# Gira Grand Prix

Local-first Gira planner for maximizing score before a chosen finish time.

It uses:

- the same Gira authentication flow used by `mGira` and `Gira+`
- the live `getStations` GraphQL snapshot from `https://c2g091p01.emel.pt/ws/graphql`
- the EMEL public station catalog to map internal station IDs onto public short codes
- an exact dynamic-programming search over a 30-second time grid

## Browser workflow

Install dependencies:

```bash
npm install
```

Build the web bundle and serve the local app on `http://localhost:8787`:

```bash
npm start
```

For frontend iteration with Vite, run the app server and Vite separately:

```bash
npm run serve
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api/*` to the Node server on `127.0.0.1:8787`.

## Project layout

- `src/`: production browser code and shared planner logic
- `server.mjs`: production Node server and API entrypoint
- `test/`: automated unit, server, and browser smoke tests
- `testing/fixtures/`: non-production fixtures used for local demos and tests

The bundled demo stations now live in [testing/fixtures/demo-stations.js](/Users/een2cok/workspace/gira%20grand%20prix/testing/fixtures/demo-stations.js) instead of inside the UI file, so the application code and test/demo data stay clearly separated.

## Test coverage

Run the automated checks with:

```bash
npm run lint
npm test
npm run audit:high
```

Or run them individually:

```bash
npm run test:unit
npm run test:server
npm run test:browser
```

Current automated coverage focuses on:

- planner scoring and route-selection logic in [src/lib/planner.js](/Users/een2cok/workspace/gira%20grand%20prix/src/lib/planner.js)
- auth cookie/session recovery and login rate limiting in [server.mjs](/Users/een2cok/workspace/gira%20grand%20prix/server.mjs)
- a built-app browser smoke flow that loads the demo snapshot and produces a route end to end

The browser smoke test uses local Google Chrome via `playwright-core`, and the server tests call the app handler directly so they do not need live Gira credentials or network access.

## Dependency hardening

The repo now includes a few basic npm supply-chain guardrails:

- exact dependency pinning in [package.json](/Users/een2cok/workspace/gira%20grand%20prix/package.json)
- `save-exact=true` in [/.npmrc](/Users/een2cok/workspace/gira%20grand%20prix/.npmrc)
- CI installs with `npm ci --ignore-scripts` and pins GitHub Actions by commit SHA in [ci.yml](/Users/een2cok/workspace/gira%20grand%20prix/.github/workflows/ci.yml)
- weekly dependency update PRs via [dependabot.yml](/Users/een2cok/workspace/gira%20grand%20prix/.github/dependabot.yml)
- `npm audit --audit-level=high` as both a local script and a CI check

## Put it online fast

The fastest way to try the current app on your phone is to deploy the existing Node service to Render.

1. Push this repo to GitHub.
2. Create a new Render web service from that repo.
3. Render will pick up [render.yaml](/Users/een2cok/workspace/gira%20grand%20prix/render.yaml) automatically.
4. Wait for the deploy to finish, then open the `https://...onrender.com` URL on your phone.

Why Render works well here:

- the current app already includes a Node backend for login and live station fetches
- Render gives you HTTPS by default
- HTTPS matters because browser geolocation generally requires a secure context

If you prefer to set it up manually instead of using `render.yaml`, use:

- Build Command: `npm install`
- Start Command: `npm start`

Railway is also a good option for this same codebase, but Render is the most direct “push repo, get URL, open on phone” path.

## How it works

1. Sign in with your own Gira account.
2. Load the live station snapshot.
3. Choose a start station and a finish station.
4. Choose a finish time and tune the travel assumptions.
5. Run the planner to get the highest-scoring route it can find under the model.

If the chosen start station has no bikes, the planner inserts a walking transfer to the nearest active station with an available bike.

## Scoring model

- `10` points per ride
- `100` points when a ride starts at a station above `70%` occupied
- `100` points when a ride ends at a station above `70%` unoccupied

The app treats the finish bonus conservatively: it checks the destination after your bike is docked.

## Travel model

Because this app works station-to-station, it estimates ride time from:

- straight-line distance
- a configurable street detour factor
- a configurable average cycling speed
- a configurable per-ride overhead for unlock/dock friction

Defaults:

- finish time defaults to about `2 hours` ahead
- `15 km/h`
- `1.22` detour factor
- `5` minutes per ride overhead

## Notes

- The localhost Node server is still useful for browser-based development.
- A bundled demo snapshot is included for local testing and development through the separated fixture module in `testing/fixtures/`.
- The literal scoring optimum can still be a repeatable back-and-forth loop when the same ride keeps qualifying for both bonuses.
