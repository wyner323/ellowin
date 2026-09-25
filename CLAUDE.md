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
  `tsc --noEmit` before committing. GitHub Actions (`.github/workflows/ci.yml`) runs `tsc --noEmit`,
  `pnpm lint` and `pnpm test` on every push to `main` and on pull requests.
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

Google login (`socialProviders.google` in `lib/auth.ts`, only enabled when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` exist; button hidden
otherwise): production baseURL is pinned to `https://ellowin.com.br` (only when NODE_ENV and VERCEL_ENV are both production — the
pulled `.env.local` also has VERCEL_ENV=production, so NODE_ENV is what keeps `next dev` local). Google users arrive without
CPF/phone/birth date, so `/completar-cadastro` (`completeProfile`) collects them and `accountBlock()` (email verified **and**
profile complete, in `lib/session.ts`) gates buy/list/become-seller/withdraw. The Google photo is dropped on user creation (images
must come from our Blob), and linking Google to an existing account with an UNVERIFIED email wipes its password/sessions first
(`lib/account-link.ts`) so a pre-registered attacker password can't survive.

Password reset (`requestPasswordReset`/`resetPassword` in `app/actions/auth.ts`, pages `/esqueci-senha` and `/redefinir-senha`) follows
the same rule: the Better Auth HTTP endpoints are disabled, the actions rate-limit (3/email/h, 10/IP/h), always answer the same
whether or not the email exists, the link is 1 h / single use, and a successful reset revokes all sessions and emails a notice.

Login and sign-up go **only** through `loginUser`/`registerUser` in `app/actions/auth.ts`: Better
Auth's own rate limiter runs only in its HTTP handler (not in `auth.api.*` calls, and its counter
is per-instance memory), so those actions use the DB-backed limiter in `lib/rate-limit.ts`
(`auth_attempt` table) and `/api/auth/sign-in/email` + `/sign-up/email` are disabled in
`lib/auth.ts` (`disabledPaths`) so they can't be used to bypass it. OTP codes are never returned
to the browser unless `ELLOWIN_DEMO_OTP=true`. User-supplied Blob URLs (product photos, avatar,
banner) must pass `isOwnBlobUrl()` (`lib/blob-urls.ts`) — never trust just the Blob domain.
`purchase`, `createProduct`/`updateProduct`/reactivating a listing, `savePayoutStep` (which approves the seller) and
`requestWithdrawal` all require a confirmed email (`isEmailVerified()`/`emailNotVerified()` in `lib/session.ts`) — sign-up
does not confirm it on its own.
The seller onboarding order (store → phone → document → Pix) is enforced server-side in `app/actions/seller.ts`, not just by the
wizard, and editing an already-approved seller never lowers their status/level. Delivery data (`order.deliveryPayload`, game
credentials) is encrypted at rest with `lib/secret-box.ts` when `DELIVERY_ENCRYPTION_KEY` is set (plaintext otherwise, so the
variable must exist in Vercel before it takes effect; `scripts/encrypt-delivery-payloads.mjs` migrates old rows). Only
`getOrderDetail` reads/decrypts it — list queries must not select it.

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
- **Any transaction that moves an order's money must start with `transitionOrder()`** (an
  `UPDATE "order" ... WHERE status = <expected>` that throws `StateConflictError` on 0 rows).
  Checking `order.status` in a plain SELECT before the transaction is not enough: two parallel
  requests both pass it and settle the same order twice (this was a real money-minting bug in
  `confirmReceipt`/`cancelOrder`/`resolveDispute`). `releaseEscrowToSeller`/`refundEscrow` also
  throw if the buyer's `heldCents` doesn't cover the amount, and the DB has `CHECK` constraints
  against negative wallet balances.

### Lists are paginated on the server

Orders (buyer and seller), the seller's listings, the wallet statement and closed disputes use `?pagina=N` with
`PAGE_SIZE` (20) from `lib/pagination.ts`: `parsePage()` for the URL, `resolvePage()` for the clamped page/offset, the
`<Pagination>` component for the links. Filters (`?status=`, `?q=`) are also server-side so they span every page —
don't filter only the loaded page in a client component. The seller dashboard must not load every order: use the SQL
aggregates in `getSellerOrderAggregates()`, and the balance chart uses `getDailyBalanceHistory()` (one point per day).

### SLA / auto-refund pattern

`lib/sla.ts` computes business-hour deadlines and `sweepDisputeSla()` auto-refunds a buyer if the
seller doesn't respond to a dispute in time. It's invoked both by `/api/cron/sla` (Vercel Cron,
gated by `CRON_SECRET` — see the auth check before trusting this route) and opportunistically
whenever a dispute/moderation screen loads (there's no durable job queue here, so a sweep that
only ran on cron would lag if nobody hit the cron endpoint). Vercel Hobby only allows a daily cron (`vercel.json`, 03:00), so `.github/workflows/sla-sweep.yml` also calls the route every 15 minutes with the repo secret `CRON_SECRET` (same value as in Vercel); until that secret is set it just logs a warning. Each auto-action leaves a `system`
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
**Every `<Select>` must pass an `items` prop** (`Record<value, label>`): without it Base UI
shows the raw `value` string in the trigger after selection instead of the item's label.
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
