import { Pool } from "pg";

import type { AnalyticsEventName, AnalyticsStatsResponse, TrackedLanguage } from "../src/types.js";
import { createEmptyAnalyticsStats } from "./analytics.js";
import type { AnalyticsEventRecord, AnalyticsStore, AnalyticsStoreMode } from "./types.js";

const DAY_MS = 1000 * 60 * 60 * 24;
const TOP_EVENT_EXCLUSIONS = new Set<AnalyticsEventName>(["app_open", "page_view"]);

interface AnalyticsStoreOptions {
  hashSalt?: string;
  now?: () => number;
  retentionDays?: number;
  statsCacheMs?: number;
  topEventsLimit?: number;
}

interface CachedStatsEntry {
  expiresAt: number;
  value: AnalyticsStatsResponse;
}

function normalizeDate(value: Date | number) {
  return value instanceof Date ? value : new Date(value);
}

function countDistinct(values: Iterable<string>) {
  return new Set(values).size;
}

function summarizeAnalyticsEvents(
  events: AnalyticsEventRecord[],
  referenceTime: Date,
  topEventsLimit: number
): AnalyticsStatsResponse {
  const now = normalizeDate(referenceTime);
  const last7Boundary = now.getTime() - 7 * DAY_MS;
  const last30Boundary = now.getTime() - 30 * DAY_MS;

  const stats = createEmptyAnalyticsStats({ enabled: true });
  stats.generatedAt = now.toISOString();

  const signedInLifetime = new Set<string>();
  const signedInLast7 = new Set<string>();
  const signedInLast30 = new Set<string>();
  const latestLanguageByAccount = new Map<string, { language: TrackedLanguage; occurredAt: number }>();
  const topEventCounts = new Map<
    AnalyticsEventName,
    { anonymousCount: number; signedInCount: number; totalCount: number }
  >();

  for (const event of events) {
    const occurredAt = normalizeDate(event.occurredAt).getTime();

    if (event.accountHash) {
      signedInLifetime.add(event.accountHash);
      if (occurredAt >= last7Boundary) signedInLast7.add(event.accountHash);
      if (occurredAt >= last30Boundary) {
        signedInLast30.add(event.accountHash);
        const previous = latestLanguageByAccount.get(event.accountHash);
        if (!previous || occurredAt >= previous.occurredAt) {
          latestLanguageByAccount.set(event.accountHash, {
            language: event.language,
            occurredAt,
          });
        }
      }
    }

    if (occurredAt >= last7Boundary) {
      stats.totals.eventsLast7Days += 1;
      if (!event.authenticated) {
        stats.anonymous.eventsLast7Days += 1;
        if (event.eventName === "page_view") {
          stats.anonymous.pageViewsLast7Days += 1;
        }
      }
    }

    if (occurredAt >= last30Boundary) {
      stats.totals.eventsLast30Days += 1;
      const languageBucket = stats.languagesLast30Days[event.language];
      languageBucket.eventCount += 1;
      if (!event.authenticated) {
        stats.anonymous.eventsLast30Days += 1;
        stats.anonymous.pageViewsLast30Days += event.eventName === "page_view" ? 1 : 0;
        languageBucket.anonymousEventCount += 1;
      }

      if (!TOP_EVENT_EXCLUSIONS.has(event.eventName)) {
        const currentCount = topEventCounts.get(event.eventName) || {
          anonymousCount: 0,
          signedInCount: 0,
          totalCount: 0,
        };
        currentCount.totalCount += 1;
        if (event.authenticated) {
          currentCount.signedInCount += 1;
        } else {
          currentCount.anonymousCount += 1;
        }
        topEventCounts.set(event.eventName, currentCount);
      }
    }
  }

  for (const { language } of latestLanguageByAccount.values()) {
    stats.languagesLast30Days[language].signedInUniqueUsers += 1;
  }

  stats.signedInUniqueUsers.lifetime = countDistinct(signedInLifetime);
  stats.signedInUniqueUsers.last7Days = countDistinct(signedInLast7);
  stats.signedInUniqueUsers.last30Days = countDistinct(signedInLast30);
  stats.topEventsLast30Days = [...topEventCounts.entries()]
    .sort((left, right) => {
      if (right[1].totalCount !== left[1].totalCount) {
        return right[1].totalCount - left[1].totalCount;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, topEventsLimit)
    .map(([eventName, counts]) => ({
      eventName,
      ...counts,
    }));

  return stats;
}

export function createDisabledAnalyticsStore(): AnalyticsStore {
  return {
    async getPublicStats(referenceTime = new Date()) {
      const stats = createEmptyAnalyticsStats({ enabled: false });
      stats.generatedAt = normalizeDate(referenceTime).toISOString();
      return stats;
    },
    mode: "disabled",
    async recordEvent() {},
  };
}

export function createInMemoryAnalyticsStore(options: AnalyticsStoreOptions = {}): AnalyticsStore {
  const {
    now = () => Date.now(),
    retentionDays = 365,
    statsCacheMs = 1000 * 60 * 5,
    topEventsLimit = 5,
  } = options;
  const events: AnalyticsEventRecord[] = [];
  let cachedStats: CachedStatsEntry | null = null;

  function pruneExpiredEvents() {
    const threshold = now() - retentionDays * DAY_MS;
    while (events.length > 0) {
      const oldest = events[0];
      if (!oldest) break;
      if (normalizeDate(oldest.occurredAt).getTime() >= threshold) break;
      events.shift();
    }
  }

  return {
    async getPublicStats(referenceTime = new Date()) {
      const currentTime = now();
      if (cachedStats && cachedStats.expiresAt > currentTime) {
        return cachedStats.value;
      }

      pruneExpiredEvents();
      const stats = summarizeAnalyticsEvents(events, normalizeDate(referenceTime), topEventsLimit);
      cachedStats = {
        expiresAt: currentTime + statsCacheMs,
        value: stats,
      };
      return stats;
    },
    mode: "memory",
    async recordEvent(event) {
      pruneExpiredEvents();
      events.push({
        ...event,
        occurredAt: normalizeDate(event.occurredAt),
      });
      cachedStats = null;
    },
  };
}

export function createPostgresAnalyticsStore(
  databaseUrl: string,
  options: AnalyticsStoreOptions = {}
): AnalyticsStore {
  const {
    now = () => Date.now(),
    retentionDays = 365,
    statsCacheMs = 1000 * 60 * 5,
    topEventsLimit = 5,
  } = options;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  let cachedStats: CachedStatsEntry | null = null;
  let initializationPromise: Promise<void> | null = null;
  let lastPruneAt = 0;

  async function ensureInitialized() {
    if (!initializationPromise) {
      initializationPromise = (async () => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS analytics_events (
            id BIGSERIAL PRIMARY KEY,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            event_name TEXT NOT NULL,
            language TEXT NOT NULL,
            route TEXT,
            authenticated BOOLEAN NOT NULL,
            account_hash TEXT
          );
        `);
        await pool.query(
          "CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx ON analytics_events (occurred_at DESC);"
        );
        await pool.query(
          "CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx ON analytics_events (event_name, occurred_at DESC);"
        );
        await pool.query(
          "CREATE INDEX IF NOT EXISTS analytics_events_account_hash_idx ON analytics_events (account_hash, occurred_at DESC);"
        );
      })();
    }

    await initializationPromise;
  }

  async function pruneExpiredEvents() {
    const currentTime = now();
    if (currentTime - lastPruneAt < DAY_MS) return;
    lastPruneAt = currentTime;

    await pool.query(
      "DELETE FROM analytics_events WHERE occurred_at < NOW() - ($1::text || ' days')::interval;",
      [String(retentionDays)]
    );
  }

  return {
    async close() {
      await pool.end();
    },
    async getPublicStats(referenceTime = new Date()) {
      const currentTime = now();
      if (cachedStats && cachedStats.expiresAt > currentTime) {
        return cachedStats.value;
      }

      await ensureInitialized();
      await pruneExpiredEvents();

      const generatedAt = normalizeDate(referenceTime);
      const last7Days = new Date(generatedAt.getTime() - 7 * DAY_MS);
      const last30Days = new Date(generatedAt.getTime() - 30 * DAY_MS);

      const [signedInResult, totalsResult, languagesResult, latestLanguagesResult, topEventsResult] =
        await Promise.all([
          pool.query<{
            last30days: string;
            last7days: string;
            lifetime: string;
          }>(
            `
              SELECT
                COUNT(DISTINCT account_hash) FILTER (WHERE account_hash IS NOT NULL) AS lifetime,
                COUNT(DISTINCT account_hash) FILTER (WHERE account_hash IS NOT NULL AND occurred_at >= $1) AS last7days,
                COUNT(DISTINCT account_hash) FILTER (WHERE account_hash IS NOT NULL AND occurred_at >= $2) AS last30days
              FROM analytics_events;
            `,
            [last7Days, last30Days]
          ),
          pool.query<{
            anon30: string;
            anon7: string;
            anonpage30: string;
            anonpage7: string;
            total30: string;
            total7: string;
          }>(
            `
              SELECT
                COUNT(*) FILTER (WHERE occurred_at >= $1) AS total7,
                COUNT(*) FILTER (WHERE occurred_at >= $2) AS total30,
                COUNT(*) FILTER (WHERE NOT authenticated AND occurred_at >= $1) AS anon7,
                COUNT(*) FILTER (WHERE NOT authenticated AND occurred_at >= $2) AS anon30,
                COUNT(*) FILTER (WHERE NOT authenticated AND event_name = 'page_view' AND occurred_at >= $1) AS anonpage7,
                COUNT(*) FILTER (WHERE NOT authenticated AND event_name = 'page_view' AND occurred_at >= $2) AS anonpage30
              FROM analytics_events;
            `,
            [last7Days, last30Days]
          ),
          pool.query<{
            anonymouscount: string;
            eventcount: string;
            language: TrackedLanguage;
          }>(
            `
              SELECT
                language,
                COUNT(*) AS eventcount,
                COUNT(*) FILTER (WHERE NOT authenticated) AS anonymouscount
              FROM analytics_events
              WHERE occurred_at >= $1
              GROUP BY language;
            `,
            [last30Days]
          ),
          pool.query<{
            language: TrackedLanguage;
            signedinusers: string;
          }>(
            `
              WITH latest_language AS (
                SELECT DISTINCT ON (account_hash)
                  account_hash,
                  language
                FROM analytics_events
                WHERE account_hash IS NOT NULL
                  AND occurred_at >= $1
                ORDER BY account_hash, occurred_at DESC
              )
              SELECT language, COUNT(*) AS signedinusers
              FROM latest_language
              GROUP BY language;
            `,
            [last30Days]
          ),
          pool.query<{
            anonymouscount: string;
            event_name: AnalyticsEventName;
            signedincount: string;
            totalcount: string;
          }>(
            `
              SELECT
                event_name,
                COUNT(*) AS totalcount,
                COUNT(*) FILTER (WHERE NOT authenticated) AS anonymouscount,
                COUNT(*) FILTER (WHERE authenticated) AS signedincount
              FROM analytics_events
              WHERE occurred_at >= $1
                AND event_name <> ALL($2::text[])
              GROUP BY event_name
              ORDER BY totalcount DESC, event_name ASC
              LIMIT $3;
            `,
            [last30Days, [...TOP_EVENT_EXCLUSIONS], topEventsLimit]
          ),
        ]);

      const stats = createEmptyAnalyticsStats({ enabled: true });
      stats.generatedAt = generatedAt.toISOString();

      const signedInRow = signedInResult.rows[0];
      const totalsRow = totalsResult.rows[0];
      if (signedInRow) {
        stats.signedInUniqueUsers = {
          last30Days: Number(signedInRow.last30days || 0),
          last7Days: Number(signedInRow.last7days || 0),
          lifetime: Number(signedInRow.lifetime || 0),
        };
      }
      if (totalsRow) {
        stats.totals = {
          eventsLast30Days: Number(totalsRow.total30 || 0),
          eventsLast7Days: Number(totalsRow.total7 || 0),
        };
        stats.anonymous = {
          eventsLast30Days: Number(totalsRow.anon30 || 0),
          eventsLast7Days: Number(totalsRow.anon7 || 0),
          pageViewsLast30Days: Number(totalsRow.anonpage30 || 0),
          pageViewsLast7Days: Number(totalsRow.anonpage7 || 0),
        };
      }

      for (const row of languagesResult.rows) {
        const languageBucket = stats.languagesLast30Days[row.language];
        if (!languageBucket) continue;
        languageBucket.eventCount = Number(row.eventcount || 0);
        languageBucket.anonymousEventCount = Number(row.anonymouscount || 0);
      }

      for (const row of latestLanguagesResult.rows) {
        const languageBucket = stats.languagesLast30Days[row.language];
        if (!languageBucket) continue;
        languageBucket.signedInUniqueUsers = Number(row.signedinusers || 0);
      }

      stats.topEventsLast30Days = topEventsResult.rows.map(row => ({
        anonymousCount: Number(row.anonymouscount || 0),
        eventName: row.event_name,
        signedInCount: Number(row.signedincount || 0),
        totalCount: Number(row.totalcount || 0),
      }));

      cachedStats = {
        expiresAt: currentTime + statsCacheMs,
        value: stats,
      };
      return stats;
    },
    mode: "postgres" satisfies AnalyticsStoreMode,
    async recordEvent(event) {
      await ensureInitialized();
      await pruneExpiredEvents();
      cachedStats = null;
      await pool.query(
        `
          INSERT INTO analytics_events (
            occurred_at,
            event_name,
            language,
            route,
            authenticated,
            account_hash
          ) VALUES ($1, $2, $3, $4, $5, $6);
        `,
        [
          normalizeDate(event.occurredAt),
          event.eventName,
          event.language,
          event.route,
          event.authenticated,
          event.accountHash,
        ]
      );
    },
  };
}
