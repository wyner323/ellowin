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
  badge thresholds, Sentry event scrubbing). `pnpm test:watch` for interactive mode.
  **Coverage is intentionally narrow**:
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

### Reports (denúncias)

Separate from disputes on purpose: a dispute is about ONE order's money and only its two parties + staff can open
one; a report (`report` table, `lib/reports.ts` pure reasons, `lib/report-queries.ts` DB queries, `app/actions/reports.ts`) is any
logged-in user flagging a listing or another user (scam, hijacked account, harassment) and never moves money — resolving one only
logs a moderation record. A CHECK constraint enforces exactly one target (product XOR user). `ReportButton`
(`components/report-button.tsx`) is the one client component for both target types; wire it wherever a listing or a public profile
is shown for a viewer who isn't its owner. Queue at `/admin/denuncias` mirrors the dispute queue (open list + paginated closed
history).

### Account deletion (LGPD)

`lib/account-deletion.ts`: `getDeletionBlockers()` (wallet balance, active orders, active listings, staff role) must return empty
before `anonymizeAccount()` runs. Anonymization is NOT a row delete — orders/reviews from other people point at this user id, and
CPF/legal name/document are kept for the legal retention period (comment in `lib/db/schema.ts` on `user.deletedAt`). It clears
name/displayName/image/bio/banner/phone, sets a unique `excluido+<id>@ellowin.invalid` placeholder email, and deletes the
`session`/`account` rows so login becomes impossible. Wired into `requestAccountDeletion` (`app/actions/account.ts`, confirmation
phrase + rate limit) and the danger-zone section on `/conta`.

### Wallet reconciliation

`lib/reconcile.ts` (read-only, 10 SQL checks: balance vs ledger, held vs active orders, every order settled exactly once, total money =
deposits − withdrawals − fees, no negatives) runs at the end of every `/api/cron/sla` call and on `/admin/conferencia` (admin only). If
anything fails, `lib/reconcile-alert.ts` logs it and emails the admins at most once a day per set of problems. Orders 1–5 are legacy
demo seed (seller credited with no buyer debit) and are accounted for by `LEGACY_SEED_ORDER_IDS`; any new inconsistency is real.
When you add a new wallet `kind` or a new way money moves, update the checks.

### Notification emails

`lib/notify.ts` sends order/dispute/question emails (`notifyOrder`, `notifyQuestion`), called right after the money/status change
succeeds (actions and the three SLA sweeps). It runs in `after()`, never throws, dedupes per (user, kind, ref) through
`notification_log`, and **only really sends in production** (NODE_ENV and VERCEL_ENV both production, or `ELLOWIN_NOTIFY=1`)
— locally it just logs, because the local database is production and a test flow must not email real people. Text lives in the
pure `lib/notification-messages.ts`; emails must never contain delivery data and only carry public names.

### Lists are paginated on the server

Orders (buyer and seller), the seller's listings, the wallet statement and closed disputes use `?pagina=N` with
`PAGE_SIZE` (20) from `lib/pagination.ts`: `parsePage()` for the URL, `resolvePage()` for the clamped page/offset, the
`<Pagination>` component for the links. Filters (`?status=`, `?q=`) are also server-side so they span every page —
don't filter only the loaded page in a client component. The seller dashboard must not load every order: use the SQL
aggregates in `getSellerOrderAggregates()`, and the balance chart uses `getDailyBalanceHistory()` (one point per day).

### Buyer-facing listing pages (`/catalogo/[slug]`, `/jogos/[slug]`, `/busca`)

Filters, sort and pagination live in the URL and run in SQL: `parseListingFilters()` (pure, `lib/listing-filters.ts`,
params `ordem`, `min`, `max`, `entrega`, `nivel`, `avaliados`, `pagina`) → `searchListings()` in `lib/marketplace.ts`
(24 per page) → `ListingFilterBar` (a plain GET `<form>`, no JS) + `ListingResults`. "For sale" = active product with an
active in-stock variant (`FOR_SALE_SQL`/`MIN_PRICE_SQL`). Static demo cards are appended only in the clean view (no filter,
default sort) and only on `/catalogo` and `/busca`; the count line counts real listings only. `entrega=imediata` reads
`product.deliveryType`, not the free-text `deliveryTime` (legacy seed rows have values like `imediata`/`ate 24h`).
Filtered/paged URLs canonicalize to the base path; `/busca` is `noindex`.

### SLA / auto-refund pattern

`lib/sla.ts` is **pure only** (business-hour deadline math, `slaState()`, `formatDeadline()`) —
it's imported by a client component (`components/disputes/sla-panel.tsx`), so it must never pull
in `db`, `lib/wallet.ts`, or anything server-only. The three sweep functions
(`sweepDisputeSla`, `sweepDeliveryDeadline`, `sweepAutoRelease`) that actually touch the database
and move money live in **`lib/sla-sweeps.ts`** instead — always import sweeps from there, never
from `lib/sla.ts`. (This split exists because the two were briefly merged and it broke the
production bundle — see the note at the bottom of `lib/sla.ts`.) Sweeps are invoked both by
`/api/cron/sla` (Vercel Cron, gated by `CRON_SECRET` — see the auth check before trusting this
route) and opportunistically whenever a dispute/moderation/orders screen loads (there's no durable
job queue here, so a sweep that only ran on cron would lag if nobody hit the cron endpoint). Vercel
Hobby only allows a daily cron (`vercel.json`, 03:00), so `.github/workflows/sla-sweep.yml` also
calls the route every 15 minutes with the repo secret `CRON_SECRET` (same value as in Vercel);
until that secret is set it just logs a warning. Each auto-action leaves a `system` message in the
relevant chat so the outcome is auditable. If you build the planned "refund on missed delivery
deadline" feature, this is the pattern to copy (delivery windows are already fixed/enumerable —
see `lib/delivery.ts`).

### Storefront blends real and demo data

`lib/marketplace.ts` (real, DB-backed products) and `lib/catalog.ts` (static demo listings) are
merged in `getStorefrontCards()` so the vitrine never looks empty while the marketplace is thin.
Demo cards are visually marked and non-clickable (`source: "demo"`, `href: null`). Don't assume
every card rendered by `ProductCard` corresponds to a database row.

**Public numbers must come from the database, never from constants.** The home hero stats, category
counts/"a partir de" prices and the "Jogos com anúncios" strip read `lib/market-stats.ts` (raw SQL; "for
sale" = active product with an active variant in stock, the same rule as the cards) and are formatted by
the pure `lib/home-stats.ts`, which hides the average rating until ≥ 20 reviews and the average delivery
time until ≥ 20 deliveries (and `Novo na Ellowin` for an empty category) instead of printing a fragile or
invented figure. Legacy demo orders 1–5 are excluded from delivery averages. The static `lib/catalog.ts`
no longer carries `listings`/`startingAt` for categories — don't re-add them. Hero cards are real listings
only (`getRealStorefrontCards`); demo cards stay confined to the labeled "demonstração" fallback.

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
`.dark` class with a `prefers-color-scheme` fallback for users with no explicit preference. Gold has two
tokens on purpose: `gold` is a bright amber for fills/borders (with `gold-foreground` on top), but as
**text** on the light theme it is only ~2:1 — use `text-gold-text` for gold text (same amber in dark,
darker in light). Contrast was audited on both themes (computed WCAG ratio for every visible text node);
keep body text ≥ 4.5:1 and translucent `text-*-foreground/NN` on `bg-primary` at /80 or more.

Page-level conventions: every page's `<main>` needs `id="conteudo"` (target of the skip link in
`app/layout.tsx`); slow routes get a `loading.tsx` using `PageSkeleton`; `app/error.tsx` is the
in-layout error boundary (it deliberately avoids `SiteHeader`, which queries the DB). The header hides
search below `md` and the category bar below `lg`, so `components/mobile-nav.tsx` supplies both on small
screens — keep the two in sync if you add a nav entry. Below `sm` the header's "Criar conta" button is
hidden and lives in that menu: the two icons plus both buttons do not fit a 320–375px header, so check
header changes at 320px (the nav's right edge must keep its 16px margin). Grid/flex children holding long
text need `min-w-0` (a `<fieldset>` needs it explicitly), or an implicit grid track outgrows the viewport
and the page scrolls sideways on phones. On the product page the buy box sits right
after the title block on mobile (grid order), not after description/reviews. Product pages emit
Open Graph + JSON-LD (`lib/product-jsonld.ts`, `<` escaped, CSP nonce); the site-wide share image is
`app/opengraph-image.tsx`. Irreversible money actions (buy, confirm receipt, cancel) go through an
`AlertDialog`; action results surface through `sonner` toasts.

### Help center (`/ajuda`)

Content lives in `lib/help-content.ts` (typed topics → questions with stable `id`s that are also URL
anchors: `/ajuda#tempo-para-conferir` opens that answer through `components/help/open-on-hash.tsx`).
Numbers inside answers are built from the code's own constants (`AUTO_RELEASE_DAYS`,
`PLATFORM_FEE_BPS`, the SLA hours), so change the rule and the help follows; when a rule has no
constant, update the answer by hand. `lib/help-content.test.ts` fails on duplicate ids and on phrases the
system doesn't back ("em minutos", "24/7", "verificado por CPF"…). Never rename a published question id
(links point at it). The contact channel is **not hard-coded**: `lib/support.ts` reads
`ELLOWIN_SUPPORT_EMAIL` / `ELLOWIN_SUPPORT_HOURS` per request (no redeploy); unset → the page says there is
no direct channel yet and points to opening a dispute. Don't add copy that promises support hours or a
guarantee window the operation or the order rules don't have (`autoReleaseAt` counts 7 days from the
**purchase**, not the delivery).

### Security headers

`proxy.ts` (Next 16's renamed `middleware.ts`) sets a per-request CSP nonce and applies it to all
routes except static assets. If you add an inline `<script>`, it needs that nonce
(`headers().get("x-nonce")`) or it will be blocked in production.

### Error monitoring (Sentry)

`@sentry/nextjs` is wired in (`next.config.mjs` via `withSentryConfig` from the `/config`
subpath — the main package export doesn't have it in this version) but is **inert by default**:
`lib/sentry-shared.ts` reads `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` and sets `enabled: false` when
neither is set, so nothing is sent and the build/deploy can't break for lack of a Sentry account.
The browser SDK is ~460 KB raw (~150 KB gzip), so it is **not in the bundle unless
`NEXT_PUBLIC_SENTRY_DSN` is set at build time** (`instrumentation-client.ts`, `app/error.tsx` and
`app/global-error.tsx` import it dynamically behind that check; never add a static
`import "@sentry/nextjs"` to client code — it puts the SDK on every page). With the DSN it loads after
hydration. A server-only `SENTRY_DSN` leaves the browser SDK off.
To activate it: create a Sentry project, set `NEXT_PUBLIC_SENTRY_DSN` in Vercel and **redeploy** (it is
inlined at build, a plain env change is not enough); optionally
`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source-map upload (readable stack traces)
and `SENTRY_TRACES_SAMPLE_RATE` for performance tracing (0 by default). Runtime init lives in
`instrumentation.ts` (server/edge, picks the config by `NEXT_RUNTIME`) and
`instrumentation-client.ts` (browser); `app/global-error.tsx` catches root-layout render errors.
Given this app handles CPF/wallet/delivery data: `sendDefaultPii: false`, Session Replay is
deliberately **not** enabled, and every event passes through `scrubSensitiveData()`
(`lib/sentry-scrub.ts`) which redacts sensitive keys (cpf, senha, pixKey, deliveryPayload, tokens,
etc.) before it leaves the process. `lib/notify.ts` and `lib/reconcile-alert.ts` report failures
to it; add `Sentry.captureException`/`captureMessage` calls to new server-side failure paths the
same way.

**Note: CI does not run `next build`** (`.github/workflows/ci.yml` only runs `tsc --noEmit`,
`pnpm lint`, `pnpm test`) — none of those catch Next's client/server module-boundary errors (e.g.
a client component transitively importing server-only code like `next/server`'s `after()`). That
class of bug only surfaces in an actual `next build`/`pnpm build`, which is why `lib/sla.ts` had to
be split from `lib/sla-sweeps.ts` (see above). Run `pnpm build` locally before pushing anything
that touches imports shared between client and server code, since CI won't catch it.
