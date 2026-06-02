import type { AnalyticsStatsResponse, MessageValues } from "../types.js";
import type { AppElements } from "./app-elements.js";

interface StatsRendererOptions {
  elements: Pick<
    AppElements,
    | "statsAnonymousBreakdown"
    | "statsLanguageGrid"
    | "statsLastUpdated"
    | "statsSignedInBreakdown"
    | "statsSummaryGrid"
    | "statsTopEventsList"
  >;
  getLocale: () => string;
  translate: (key: string, values?: MessageValues) => string;
}

function createCard(label: string, value: string) {
  const card = document.createElement("article");
  card.className = "summary-card";

  const labelElement = document.createElement("span");
  labelElement.className = "summary-card__label";
  labelElement.textContent = label;

  const valueElement = document.createElement("strong");
  valueElement.className = "summary-card__value";
  valueElement.textContent = value;

  card.append(labelElement, valueElement);
  return card;
}

function createBreakdownItem(label: string, value: string) {
  const wrapper = document.createElement("div");
  const title = document.createElement("dt");
  title.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value;
  wrapper.append(title, description);
  return wrapper;
}

function createMetaItem(label: string, value: string) {
  const wrapper = document.createElement("div");
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value;
  wrapper.append(labelElement, valueElement);
  return wrapper;
}

function createEmptyNote(message: string) {
  const note = document.createElement("p");
  note.className = "summary-placeholder";
  note.textContent = message;
  return note;
}

export function createStatsRenderer({
  elements,
  getLocale,
  translate: t,
}: StatsRendererOptions) {
  function formatCount(value: number) {
    return new Intl.NumberFormat(getLocale()).format(Number(value) || 0);
  }

  function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(getLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function renderStats(stats: AnalyticsStatsResponse | null) {
    if (!stats || !stats.enabled) {
      elements.statsLastUpdated.textContent = t("stats.unavailable");
      elements.statsSummaryGrid.replaceChildren(createEmptyNote(t("stats.unavailable")));
      elements.statsSignedInBreakdown.replaceChildren();
      elements.statsAnonymousBreakdown.replaceChildren();
      elements.statsLanguageGrid.replaceChildren();
      elements.statsTopEventsList.replaceChildren();
      return;
    }

    elements.statsLastUpdated.textContent = t("stats.lastUpdated", {
      timestamp: formatTimestamp(stats.generatedAt),
    });

    elements.statsSummaryGrid.replaceChildren(
      createCard(
        t("stats.cards.signedInLifetime"),
        formatCount(stats.signedInUniqueUsers.lifetime)
      ),
      createCard(t("stats.cards.signedIn30Days"), formatCount(stats.signedInUniqueUsers.last30Days)),
      createCard(t("stats.cards.anonymousVisits30Days"), formatCount(stats.anonymous.pageViewsLast30Days)),
      createCard(t("stats.cards.totalEvents30Days"), formatCount(stats.totals.eventsLast30Days))
    );

    elements.statsSignedInBreakdown.replaceChildren(
      createBreakdownItem(
        t("stats.signedInBreakdown.lifetime"),
        formatCount(stats.signedInUniqueUsers.lifetime)
      ),
      createBreakdownItem(
        t("stats.signedInBreakdown.last7Days"),
        formatCount(stats.signedInUniqueUsers.last7Days)
      ),
      createBreakdownItem(
        t("stats.signedInBreakdown.last30Days"),
        formatCount(stats.signedInUniqueUsers.last30Days)
      )
    );

    elements.statsAnonymousBreakdown.replaceChildren(
      createBreakdownItem(
        t("stats.anonymousBreakdown.pageViewsLast7Days"),
        formatCount(stats.anonymous.pageViewsLast7Days)
      ),
      createBreakdownItem(
        t("stats.anonymousBreakdown.pageViewsLast30Days"),
        formatCount(stats.anonymous.pageViewsLast30Days)
      ),
      createBreakdownItem(
        t("stats.anonymousBreakdown.eventsLast7Days"),
        formatCount(stats.anonymous.eventsLast7Days)
      ),
      createBreakdownItem(
        t("stats.anonymousBreakdown.eventsLast30Days"),
        formatCount(stats.anonymous.eventsLast30Days)
      )
    );

    elements.statsLanguageGrid.replaceChildren(
      ...Object.entries(stats.languagesLast30Days).map(([language, bucket]) => {
        const card = document.createElement("article");
        card.className = "summary-card stats-language-card";

        const label = document.createElement("span");
        label.className = "summary-card__label";
        label.textContent = t(`stats.languages.${language}`);

        const counts = document.createElement("dl");
        counts.className = "summary-breakdown stats-language-breakdown";
        counts.append(
          createBreakdownItem(t("stats.languageBreakdown.events"), formatCount(bucket.eventCount)),
          createBreakdownItem(
            t("stats.languageBreakdown.anonymousEvents"),
            formatCount(bucket.anonymousEventCount)
          ),
          createBreakdownItem(
            t("stats.languageBreakdown.signedInUsers"),
            formatCount(bucket.signedInUniqueUsers)
          )
        );

        card.append(label, counts);
        return card;
      })
    );

    const topEvents = stats.topEventsLast30Days;
    if (topEvents.length === 0) {
      elements.statsTopEventsList.replaceChildren(createEmptyNote(t("stats.noEvents")));
      return;
    }

    elements.statsTopEventsList.replaceChildren(
      ...topEvents.map(event => {
        const item = document.createElement("li");
        item.className = "route-item";

        const top = document.createElement("div");
        top.className = "route-item__top";

        const heading = document.createElement("h3");
        heading.className = "route-item__title";
        heading.textContent = t(`stats.eventNames.${event.eventName}`);

        const count = document.createElement("span");
        count.className = "route-item__points";
        count.textContent = formatCount(event.totalCount);

        top.append(heading, count);

        const meta = document.createElement("div");
        meta.className = "route-item__meta";
        meta.append(
          createMetaItem(t("stats.topEventBreakdown.total"), formatCount(event.totalCount)),
          createMetaItem(
            t("stats.topEventBreakdown.signedIn"),
            formatCount(event.signedInCount)
          ),
          createMetaItem(
            t("stats.topEventBreakdown.anonymous"),
            formatCount(event.anonymousCount)
          )
        );

        item.append(top, meta);
        return item;
      })
    );
  }

  return {
    renderStats,
  };
}
