# Harmony: design and build notes

One product with three editions. The name lives in `packages/shared/src/editions.ts`, so a rename touches one line.

| Edition | Who it's for | Look |
|---|---|---|
| Harmony Home | Families and helpers | Ivory canvas, sage and olive, Fraunces headings |
| Harmony People | HR and office managers | Soft plum and apricot, Bricolage Grotesque headings |
| Harmony Supply | Procurement managers | Ice blue, royal to sky blue, Plus Jakarta Sans headings |

## How it fits together

- **`packages/shared`**: editions, wording per edition, date and repeat rules, forecasting, input validation and API types. Used by both sides.
- **`packages/server`**: Hono API on Node. Postgres through Drizzle. Without `DATABASE_URL` it runs on embedded Postgres (PGlite), so it needs no install.
- **`packages/web`**: React, TypeScript, Vite, Tailwind 3, TanStack Query, Motion. Charts are hand-written SVG.

## The rules that matter

- **Every workspace is walled off.** All routes go through `workspaceAccess`; outsiders get "not found".
- **Every number comes from records.** Nothing on a dashboard is typed in or invented.
- **Live by default.** Any change is announced over server-sent events and every open screen refreshes.
- **People don't need an account to take part.** Kids and helpers can be people without a login, and the wall board link works with no account.
- **Roles:** owner, manager, member. Members never see budgets, bills or orders.
- **Stock has one list.** An item that runs low joins the restock list by itself. Buying tops up stock and records the spend.
- **A bill only becomes an expense when paid,** so nothing is counted twice.
- **Finishing a repeating task keeps it as history** and schedules the next one. Skipped tasks never count as done.

## Design language

Follows the structure of the dashboard the user shared, without copying it outright: white rounded cards on a tinted canvas, one gradient element per area with grain, tight headings, pill buttons, tilt on hover, numbers that count up.

Signature pieces that are this product's own:

- **The living shelf:** in the welcome banner, containers filled to real stock levels. Jars for home, canisters for the office, crates for procurement.
- **The runway:** on the month-ahead page, each item shown as a bar running out towards its forecast date, with an "order by" marker.
- **Edition switch:** changing workspace sweeps the new theme across the screen from where you clicked.

Motion answers what people do: checks draw themselves, finished rows slide away, numbers roll. `prefers-reduced-motion` turns all of it off.

## Not built yet

- Taking payment for subscriptions (Stripe, Billplz or similar).
- Enforced email verification on password sign-ups.
- WhatsApp Business API reminders (share links work today).
- Native mobile apps. The web app is responsive and installable.
- Translations. All text is in English.
- Running several server instances: live updates and rate limits are held in one process.
