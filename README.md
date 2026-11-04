# Harmony

One calm place to run a home or an office. Three editions share one app:

- **Harmony Home**: chores the whole family can see and tick off, a pantry that writes the shopping list, meals, bills and budget.
- **Harmony People**: for HR and office managers. Delegate jobs, keep pantry and cleaning supplies stocked, approve staff requests.
- **Harmony Supply**: for procurement managers. Purchase requests and approvals, purchase orders, deliveries, suppliers and stock forecasts.

Every edition has a **month-ahead plan** (what will run out and when, who has what to do, what it will cost), **live updates** across everyone's screens, and a **fridge or wall board** link that works without an account.

## Live demo

**https://23f3000111.github.io/harmony/**

GitHub Pages can't run a server, so the demo runs the real API inside your browser: the same code, on Postgres compiled to WebAssembly. Pick a demo account on the sign-in page. Anything you add is saved on your device only. Google sign-in is simulated in the demo; the full app uses real Google accounts.

## Run it

You need Node.js 20.19 or newer. Nothing else: the database is built in.

```bash
npm install
npm run build       # builds the web app and the server
npm start           # http://localhost:3000
```

For development with instant reloads:

```bash
npm run dev         # web on http://localhost:5173, API on :3000
```

To build the browser-only demo yourself:

```bash
npm run build:pages # output in packages/web/dist-pages
```

Every push to `main` runs the type checks and tests, then publishes the demo to GitHub Pages (`.github/workflows/pages.yml`).

## Demo accounts

With `DEMO_MODE=true` (the default outside production), the sign-in page lists these accounts. Each one signs in with one tap. The password for all of them is **Harmony!2026**.

| Account | Edition | Role |
|---|---|---|
| aisyah@example.com | Home | Runs the home (owner) |
| siti@example.com | Home | Family helper (no money shown) |
| priya@example.com | HR | HR manager (owner) |
| hafiz@example.com | HR | Staff member |
| daniel@example.com | Procurement | Procurement manager (owner) |
| chloe@example.com | Procurement | Requester |
| alex@example.com | All three | Manager in every edition |

The demo data refreshes itself when it's more than three days old, and anyone signed in to a demo account can reset it from Settings. Accounts you create yourself are never touched.

## Sign in with Google

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add `<APP_URL>/api/auth/google/callback` as an authorised redirect URI.
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and restart.

Until then, **Continue with Google** opens a clearly labelled stand-in page in demo mode, and an honest "not set up" message outside it.

## Going live

Copy `.env.example` to `.env` and set:

- `NODE_ENV=production`, `APP_URL=https://your-domain`, `DEMO_MODE=false`
- `DATABASE_URL` pointing at Postgres (migrations run on start-up)
- `SMTP_URL` so password resets and invites are emailed
- `TRUST_PROXY=true` if you run behind a load balancer

Health checks: `GET /healthz` (process up) and `GET /readyz` (database reachable).

## Tests

```bash
npm test            # 120 tests: date and repeat rules, forecasting, sign-in, Google token checks, roles, every workflow
npm run typecheck
```

## Layout

```
packages/shared   editions, wording, dates, repeat rules, forecasting, validation, API types
packages/server   Hono API, Postgres via Drizzle, auth, live updates, demo and starter data
packages/web      React app: dashboards, all screens, the fridge board
docs/DESIGN.md    how it fits together and the rules it follows
```

The product name lives in `packages/shared/src/editions.ts`.
