# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ellowin (ellowin.com.br) — a Brazilian marketplace for digital game goods (accounts, in-game
currency, gift cards, boosting/services) with an escrow wallet: the buyer's payment is held by
the platform and only released to the seller after delivery is confirmed.

## Commands

- `pnpm dev` — start the dev server (Next.js, Turbopack).
- `pnpm build` / `pnpm start` — production build / serve.
- `npx tsc --noEmit` — type-check. This is the main correctness gate in this repo.
- `pnpm lint` — runs ESLint (`eslint.config.mjs`); currently passes clean. Run it alongside
  `tsc --noEmit` before committing.
- `pnpm test` — runs Vitest (`vitest run`) over pure-function unit tests in `lib/*.test.ts`
  (money math, SLA business-hour deadlines, delivery time lookup, account-origin lookup, seller
  badge thresholds). `pnpm test:watch` for interactive mode. **Coverage is intentionally narrow**:
  only functions with zero I/O are tested — nothing in `lib/wallet.ts` (escrow) or any server
  action has a test yet, because there is no separate test database (only one `DATABASE_URL`,
  pointing at production) and running DB-touching tests against it would be unsafe. Provisioning
  a dedicated test database (e.g. a Neon branch) is a prerequisite for testing that code, not yet
  done.
- Package manager is `pnpm` (`pnpm-lock.yaml`). This pnpm version no longer reads workspace-level
  settings from a `pnpm` key in `package.json` at all (confirmed directly: a `pnpm.overrides`
  block once broke the Vercel build silently, and later a `pnpm.onlyBuiltDependencies` addition
  was silently ignored too) — that config now lives in `pnpm-workspace.yaml` instead
  (`allowBuilds:` there gates native postinstall scripts, e.g. `esbuild`). Don't add a `pnpm` key
  to `package.json` expecting it to do anything.

### Database changes

`drizzle-kit` is configured (`drizzle.config.ts`, migrations in `drizzle/`). To change the schema:
1. Edit `lib/db/schema.ts` (source of truth for column/table shape).
2. `pnpm db:generate` — diffs `schema.ts` against the migration history in `drizzle/` and writes a
   new numbered `.sql` file there. Read the generated SQL before applying it.
3. `pnpm db:migrate` — applies any not-yet-applied migrations to the real Neon database (tracked
   in a `drizzle.__drizzle_migrations` table). Editing `schema.ts` alone does **not** touch the
   database; the SQL file existing alone doesn't either.

The `scripts/add-*.sql` files predate this setup — they're the historical record of what was
hand-applied before `drizzle-kit` existed (baselined into `drizzle/0000_wooden_sway.sql` as a
single migration, marked already-applied rather than re-run). Don't add new schema changes as a
loose `scripts/*.sql` file anymore; always go through `db:generate`/`db:migrate`.

## Architecture

### Server actions, not a REST API

Almost all writes go through `"use server"` files in `app/actions/*.ts` (one file per domain:
`auth`, `account`, `seller`, `products`, `orders`, `disputes`, `reviews`, `wallet`, `admin`).
Every action returns the same `ActionResult` shape (`{ ok, error?, field?, message? }`, defined
in `app/actions/auth.ts`) so forms can render field-level errors consistently. `app/api/*/route.ts`
is reserved for things actions can't do: the Better Auth catch-all, file uploads to Vercel Blob
(`api/produtos/upload`, `api/perfil/avatar`, `api/perfil/banner`), and the cron sweep
(`api/cron/sla`).

**Every action re-derives the acting user from the session (`getUserId()` in `lib/session.ts`)
and scopes its query by that id.** Client-supplied ids are only ever used to select *which* row,
never to prove ownership — this is the load-bearing IDOR defense across the whole app; keep it
when adding new actions.

### Auth and identity

Better Auth (`lib/auth.ts`) backed directly by the Postgres pool (no separate adapter DB). Roles
(`user` / `moderator` / `admin`) live on `user.role`; the first admin is bootstrapped by matching
`ELLOWIN_ADMIN_EMAIL` on login (`lib/roles.ts`), not seeded in the database.

Two names exist per user, and mixing them up is a real privacy bug, not just a style issue:
- `user.name` (and `profile.fullName`) — the legal name tied to CPF/KYC. Internal/staff use only.
- `user.displayName` — the public nickname (unique, case-insensitive). This is what must render
  anywhere a buyer/seller identity is shown (chat, reviews, storefront, order pages). Reads go
  through `publicNameCol()` (SQL, in `lib/orders.ts` / `lib/marketplace.ts`) or `publicName()` /
  `initialsOf()` (JS, in `lib/utils.ts`) — always prefer `displayName`, fall back to `name`.

### Database access has two layers on purpose

`lib/db/index.ts` exports both `db` (Drizzle, via `drizzle-orm/neon-serverless`) and the raw
`pool` (`@neondatabase/serverless`, WebSocket-based — chosen over plain `pg` because serverless
cold starts otherwise open a fresh TCP connection per invocation).

- Ordinary reads/writes use `db` (Drizzle query builder).
- Anything touching the escrow wallet (`lib/wallet.ts`) uses the raw `pool` inside
  `withTransaction()`, with `SELECT ... FOR UPDATE` row locks (`lockWallet`). This is intentional:
  Drizzle's usual usage here is stateless per-query, but escrow moves (`moveToEscrow`,
  `releaseEscrowToSeller`, `refundEscrow`) need a real multi-statement transaction with locking to
  stay correct under concurrent purchases. Money is always integer cents; never introduce floats
  into a balance calculation. New escrow-affecting code should go through `lib/wallet.ts`
  functions, not ad hoc SQL.

### SLA / auto-refund pattern

`lib/sla.ts` computes business-hour deadlines and `sweepDisputeSla()` auto-refunds a buyer if the
seller doesn't respond to a dispute in time. It's invoked both by `/api/cron/sla` (Vercel Cron,
gated by `CRON_SECRET` — see the auth check before trusting this route) and opportunistically
whenever a dispute/moderation screen loads (there's no durable job queue here, so a sweep that
only ran on cron would lag if nobody hit the cron endpoint). Each auto-action leaves a `system`
message in the relevant chat so the outcome is auditable. If you build the planned
"refund on missed delivery deadline" feature, this is the pattern to copy (delivery windows are
already fixed/enumerable — see `lib/delivery.ts`).

### Storefront blends real and demo data

`lib/marketplace.ts` (real, DB-backed products) and `lib/catalog.ts` (static demo listings) are
merged in `getStorefrontCards()` so the vitrine never looks empty while the marketplace is thin.
Demo cards are visually marked and non-clickable (`source: "demo"`, `href: null`). Don't assume
every card rendered by `ProductCard` corresponds to a database row.

### Seller listing flow: catalog-driven suggestions

`lib/product-catalog.ts` holds a static list of ~190 games/categories plus a small set of generic
"product kinds" (Conta, Moeda/Itens, Boost, Gift Card), each with a suggested title template,
starter variants, and delivery defaults. `components/seller/game-product-picker.tsx` lets a
seller search a game and pick a kind, which pre-fills `components/seller/product-form.tsx` —
nothing here is enforced server-side beyond normal validation, sellers can still edit everything.
Buyer-facing game browsing (`/jogos`, `/jogos/[slug]`) reads from the same catalog plus real
listing counts from `lib/marketplace.ts`.

### Delivery time is a closed set, not free text

`lib/delivery.ts` defines the fixed delivery windows (`DELIVERY_TIME_OPTIONS`) and the sentinel
`INSTANT_DELIVERY_TIME` for automatic delivery. `app/actions/products.ts` re-normalizes
`deliveryType`/`deliveryTime` server-side on every write (`normalizeDelivery`) — never trust a
client-sent `deliveryTime` for an "automatica" product, it must always collapse to
`INSTANT_DELIVERY_TIME`. This exists specifically so a future auto-refund-on-late-delivery sweep
can compute a real deadline from `deliveryTime`.

### UI conventions

`components/ui/*` are shadcn-style primitives, but built on **Base UI** (`@base-ui/react`), not
Radix — check a sibling file (e.g. `button.tsx`, `select.tsx`) before assuming a Radix API.
Variants use `class-variance-authority`; `cn()` (`lib/utils.ts`) is `clsx` + `tailwind-merge`.
Domain components are grouped by feature under `components/` (`account/`, `orders/`, `seller/`,
`disputes/`, `games/`, `marketplace/`, `wallet/`, ...).

Client-side image uploads (`lib/image-compress.ts`) resize/recompress to WebP in-browser before
hitting an upload route, but the server **always** re-validates MIME type and size — never trust
the client-side compression step for safety. Avatar/banner uploads reuse a fixed Blob path per
user (so re-uploading overwrites instead of accumulating files) and append a `?v=timestamp` to
the returned URL — that cache-buster is required, or the browser/Next image optimizer keeps
serving the old file after a re-upload.

Styling is Tailwind v4 (`app/globals.css`, oklch tokens under `@theme inline`), theme-aware via
`.dark` class with a `prefers-color-scheme` fallback for users with no explicit preference.

### Security headers

`proxy.ts` (Next 16's renamed `middleware.ts`) sets a per-request CSP nonce and applies it to all
routes except static assets. If you add an inline `<script>`, it needs that nonce
(`headers().get("x-nonce")`) or it will be blocked in production.
