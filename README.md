# Gira Grand Prix

Local-first Gira planner for maximizing score inside a fixed time window.

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

## Capacitor iPhone workflow

This repo is now structured so the same `dist/` bundle can be packaged into a native iPhone app with no self-hosted backend.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add the iOS shell:
   ```bash
   npm run ios:add
   ```
3. Sync the latest web build into the native project:
   ```bash
   npm run ios:sync
   ```
4. Open the Xcode project:
   ```bash
   npm run ios:open
   ```
5. In Xcode, select your Apple team, choose your iPhone, and press Run.

## Native live mode

On iPhone, the app:

- logs into Gira directly from the device
- fetches live stations directly from Gira and EMEL
- keeps the optimization logic fully on-device
- stores the session locally using Capacitor Preferences so you do not need the localhost server

If you plan to ship this more broadly, move the stored token into a Keychain-backed plugin instead of `Preferences`.

## How it works

1. Sign in with your own Gira account.
2. Load the live station snapshot.
3. Choose a start station and a finish station.
4. Tune the time budget and travel assumptions.
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

- `120` minutes
- `15 km/h`
- `1.22` detour factor
- `1.25` minutes per ride overhead

## Notes

- The localhost Node server is still useful for browser-based development.
- A bundled demo snapshot is included so the UI can still be explored without logging in.
- The literal scoring optimum can still be a repeatable back-and-forth loop when the same ride keeps qualifying for both bonuses.
