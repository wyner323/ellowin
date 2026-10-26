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
  `pnpm lint`, `pnpm test`, `pnpm build` (with dummy env vars, no database) and
  `pnpm audit --prod --audit-level=high` on every push to `main` and on pull requests.
- `pnpm test` — runs Vitest (`vitest run`) over pure-function unit tests in `lib/*.test.ts`
  (money math, SLA business-hour deadlines, delivery time lookup, account-origin lookup, seller
  badge thresholds, Sentry event scrubbing). `pnpm test:watch` for interactive mode.
  **Never run DB-touching tests against the real `DATABASE_URL`** (it is production). Tests that
  need a database use `lib/test-db.ts`: an in-memory Postgres (PGlite, WASM) that applies the real
  `drizzle/*.sql` migrations (UTC time zone, like Neon), no network. A test file swaps the app's
  `@/lib/db` for it with `vi.mock` (see `lib/wallet.test.ts` / `lib/sla-sweeps.test.ts`). These cover
  the escrow primitives, double-settlement guards, the 12 reconciliation checks, the three SLA sweeps
  and the server actions for orders, disputes, the wallet, listings, account/login, "Minha conta" + LGPD
  deletion, seller onboarding, reports and admin/roles (`app/actions/{orders,disputes,wallet,products,auth,account,seller,reports,admin}.test.ts`:
  real `lib/session.ts`/`lib/roles.ts` over a faked `@/lib/auth` session, with `next/cache`, `next/headers`,
  `next/server` and `@/lib/notify` mocked). Limits: PGlite is a single connection, so two truly
  concurrent transactions (the `FOR UPDATE` race, or the SQL-level status guards that only matter in a
  race) are not exercised; `auth.test.ts` fakes Better Auth itself (user creation / password check), so the
  real hashing, session cookies and Google linking are untested (the Better Auth catch-all is covered only for
  which paths answer: `app/api/auth/handler.test.ts` runs the real handler and checks that every route in
  `DISABLED_AUTH_PATHS` of `lib/auth.ts` is a 404 — the app only uses `sign-in/social`, `callback`, `get-session` and
  `sign-out`, so a NEW Better Auth route must be added to that list unless the app really needs it); the other API routes are covered (`app/api/cron/sla/route.test.ts`,
  `app/api/uploads.test.ts`, `app/api/busca/sugestoes/route.test.ts`). The buyer-facing listing SQL
  (`searchListings`, `getRelatedListings`, `getGameListingCounts` in `lib/marketplace-search.test.ts`; the public numbers in
  `lib/market-stats.test.ts`) is covered too, and so are the order/dispute readers (`lib/orders.test.ts`: who may see an
  order, internal dispute notes hidden from the parties, delivery payload decryption, queue order/pagination) and the other
  `lib/marketplace.ts` readers (`lib/marketplace-readers.test.ts`: home cards, product page, questions, seller stats, "Meus anúncios",
  public storefront). Pages are rendered for real too (`app/pages-public.test.tsx`, `app/pages-private.test.tsx`): call the async page
  component and render it with `renderHtml()` from `lib/test-render.tsx` (a `renderToReadableStream`, because
  `renderToStaticMarkup` cannot handle the async server components inside a page; `htmlToText()` gives the visible text), with
  `@/lib/auth`, `next/navigation` (`notFound`/`redirect` throw), `next/headers`, `next/server` and the header/footer mocked. They check the
  access control (login redirect, 404 for non-parties, internal dispute notes hidden, admin/staff gates, seller panel gate), public
  names instead of legal names, and that seller-typed text never escapes into the HTML/JSON-LD. `app/pages-conventions.test.tsx` renders EVERY screen
  (public, account, seller panel, moderation — add yours to its `screens` list) and enforces the page conventions: exactly one
  `<main id="conteudo">`, a single `<h1>`, `alt` on every image, `href` on every link, no `undefined`/`NaN`/`[object Object]`/`null` in the
  text. Client components are not exercised (no hooks run); nothing here looks at CSS/layout. In a single-table Drizzle select, never interpolate a column (`${product.id}`) inside a
  raw correlated subquery — it renders unqualified and binds to the subquery's own table; write `"product"."id"` as text, and in tests
  offset the variant ids from the product ids so a wrong correlation can't pass by coincidence.
  **Real Postgres for races:** `*.pg.test.ts` files (`app/actions/concurrency.pg.test.ts`) run against a real server through `lib/test-db-pg.ts` (`PG_TEST_URL`, one throw-away `ellowin_test_*` database per file, real `drizzle/*.sql` migrations, a 16-connection pool) and skip themselves without the variable; the CI job `concurrency` starts a Postgres service and sets it. They fire the same action from several people at once (last unit, double confirm, sweep x cancel, parallel withdrawals/deposits, automatic-delivery stock) and end with the production reconciliation. To run locally you need a Postgres you can create databases in (never the production `DATABASE_URL`). Rule they proved: a transaction must lock the ORDER row first (`transitionOrder`) and the wallets after it, in the sweeps too (`sweepAutoRelease`/`sweepDeliveryDeadline` used to do the opposite and deadlocked with `confirmReceipt`/`cancelOrder`; a lost race there is a silent skip, not an error).
  `lib/test-db.ts` hands out its single connection to ONE transaction at a time (like `FOR UPDATE` waits on
  Neon) — without that, code that opens transactions in parallel (the cron route runs three sweeps at once)
  interleaves BEGIN/COMMIT on the shared connection and loses updates. If you change money code, add a case there and confirm it fails when you break the
  guard (the suites were
  mutation-checked that way).
- `pnpm test:e2e` — end-to-end tests (Playwright, `e2e/*.e2e.ts`, config in `playwright.config.ts`): a real browser against the real app (`next start`, so `pnpm build` first) over a throw-away Postgres. It needs `PG_TEST_URL` (the same disposable server as the `*.pg.test.ts` files, never production); `e2e/server.mjs` drops/creates the database `ellowin_e2e`, applies `drizzle/*.sql`, seeds a seller (store `loja-e2e`), a buyer with R$ 500 and one listing (`e2e/seed.mjs`, accounts hashed with `better-auth/crypto`, password in `e2e/env.mjs`), starts a tiny WebSocket-to-TCP proxy (the Neon driver only speaks WebSocket; `lib/db/index.ts` reads `ELLOWIN_DB_WSPROXY`, set only by this script) and then the app, with every production variable of `.env.local` (database, Resend, Blob, `VERCEL_ENV`) overridden so nothing real is touched or emailed. Specs run in order on one worker because they share state: public pages, login, the whole purchase (pay → deliver → confirm → review → seller reply, checking the money in the database at each step) and client-only behavior (theme toggle, 375 px overflow, favorites). Locally: `E2E_DEV=1` skips the build (`next dev`) and `E2E_CHANNEL=chrome` uses the installed Chrome instead of downloading Chromium; CI has the `e2e` job. A new critical flow gets a spec here; base-ui link buttons (`render={<Link/>}`) have role `button`, and the dev server is slow on the first compile of each page.
- Package manager is `pnpm` (`pnpm-lock.yaml`). This pnpm version no longer reads workspace-level
  settings from a `pnpm` key in `package.json` at all (confirmed directly: a `pnpm.overrides`
  block once broke the Vercel build silently, and later a `pnpm.onlyBuiltDependencies` addition
  was silently ignored too) — that config now lives in `pnpm-workspace.yaml` instead
  (`allowBuilds:` there gates native postinstall scripts, e.g. `esbuild`; `overrides:` there lifts a transitive dependency a parent pinned to a version `pnpm audit` flags, currently `vite` and `zod`,
  written as `"pkg@<fixed": "^latest"` so it stops applying by itself once the parent catches up). Don't add a `pnpm` key
  to `package.json` expecting it to do anything. When CI's audit step turns red with nothing changed on our side, a new advisory was published: look at `pnpm audit --prod` (Next.js advisories are the ones to move on first, the site runs
  its image optimizer and Server Actions publicly), bump with Dependabot's PR or `pnpm up <pkg> --depth Infinity`, and use an override only for what a parent pins.

### Database changes

`drizzle-kit` is configured (`drizzle.config.ts`, migrations in `drizzle/`). To change the schema:
1. Edit `lib/db/schema.ts` (source of truth for column/table shape).
2. `pnpm db:generate` — diffs `schema.ts` against the migration history in `drizzle/` and writes a
   new numbered `.sql` file there. Read the generated SQL before applying it.
3. `pnpm db:migrate` — applies any not-yet-applied migrations to the real Neon database (tracked
   in a `drizzle.__drizzle_migrations` table). Editing `schema.ts` alone does **not** touch the
   database; the SQL file existing alone doesn't either.

Value rules the code already respects are also CHECK constraints (migration 0014: variant price > 0 / stock >= 0, order amount > 0 and fee/net >= 0, review rating 1–5, wallet_transaction balanceAfter >= 0), created `NOT VALID` so old rows never block the migration (`lib/db-constraints.test.ts` proves the database refuses each one). A new column with a hard rule gets its `check()` in `schema.ts` the same way. Money columns stay `integer` (int4, R$ 21 million per value): an overflow would fail loudly (never wrap) and every sum already runs in `bigint`; moving them to `int8` is a table-rewriting migration that is not worth it until a balance can approach that ceiling.

The `scripts/add-*.sql` files predate this setup — they're the historical record of what was
hand-applied before `drizzle-kit` existed (baselined into `drizzle/0000_wooden_sway.sql` as a
single migration, marked already-applied rather than re-run). Don't add new schema changes as a
loose `scripts/*.sql` file anymore; always go through `db:generate`/`db:migrate`.

## Pending items that need the owner

`PENDENCIAS.md` (pt-BR, repo root) is the single list of things Claude cannot do alone (secrets in Vercel/GitHub, production data fixes,
legal/business decisions, test logins). When one of those comes up or gets done, update that file (and the matching memory note)
instead of leaving it only in chat.

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
banner) must pass `isOwnBlobUrl()` (`lib/blob-urls.ts`) — never trust just the Blob domain: it checks the user-id path prefix, rejects encoded `/` `.` and, when `ELLOWIN_BLOB_HOST` is set (the exact host of the app's Blob store; also used by `next.config.mjs` `remotePatterns` and the CSP `img-src`), that host only.
`purchase`, `createProduct`/`updateProduct`/reactivating a listing, `savePayoutStep` (which approves the seller) and
`requestWithdrawal` all require a confirmed email (`isEmailVerified()`/`emailNotVerified()` in `lib/session.ts`) — sign-up
does not confirm it on its own.
The seller onboarding order (store → phone → document → Pix) is enforced server-side in `app/actions/seller.ts`, not just by the
wizard, and editing an already-approved seller never lowers their status/level. Delivery data (`order.deliveryPayload`, game
credentials) is encrypted at rest with `lib/secret-box.ts` when `DELIVERY_ENCRYPTION_KEY` is set (plaintext otherwise, so the
variable must exist in Vercel before it takes effect; `scripts/encrypt-delivery-payloads.mjs` migrates old rows). Only
`getOrderDetail` reads/decrypts it — list queries must not select it. Staff who are not a party to the order get the decrypted
payload only while the order's dispute is open (`aberta`/`em_analise`, `OPEN_DISPUTE_STATUSES` in `lib/orders.ts`); with no dispute or a
closed one they see the order without the credentials.

Two names exist per user, and mixing them up is a real privacy bug, not just a style issue:
- `user.name` (and `profile.fullName`) — the legal name tied to CPF/KYC. Internal/staff use only.
- `user.displayName` — the public nickname (unique, case-insensitive). This is what must render
  anywhere a buyer/seller identity is shown (chat, reviews, storefront, order pages, emails). Reads go
  through `lib/public-name.ts` (`publicNameCol()` in SQL selects, `publicNameRaw(alias)` in hand-written
  subqueries, `anonymousName(userId)` in JS): the nickname or, without one, "Usuário" + the last 4 characters
  of the id — **never** `user.name`. `publicName()` in `lib/utils.ts` (nickname, falling back to the legal
  name) is only for a user seeing their OWN name (menu, greeting); `initialsOf()` stays there.

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
phrase + rate limit) and the danger-zone section on `/conta`. The rows stay (retention), but a deleted seller is no longer public:
`getSellerStorefront()` and `getProductBySlug()` return null when `user.deletedAt` is set (so `/loja/<slug>` and a paused listing 404), and the
action deletes the user's avatar and banner from Blob (best effort, only URLs that pass `isOwnBlobUrl`). A new public reader must also hide `deletedAt` users.

### Volume limits

Anything a logged-in user can repeat has a cap through `hitRateLimit` (`lib/rate-limit.ts`): purchases, cancels, listing questions
(`askProductQuestion`: 20/h per user, 5/h per user per listing), reports, deposits, withdrawals and the order/dispute chats
(`lib/chat-limits.ts`: 100 messages/h per person per thread, 500 messages per thread; staff exempt in the dispute chat). New repeatable
actions need one. Readers that feed every visit must not load a whole table to show a few rows: `getRealCards` pushes "for sale" and the
limit into SQL, and `uniqueSlug` (`app/actions/products.ts`) resolves the next free slug in a single query.

### Hardening conventions

`purchase` only shows the buyer the text of expected refusals (`PurchaseError` plus the wallet's "Saldo insuficiente"); any other exception goes to Sentry
and the screen gets a generic message, so a raw database error never reaches the browser. `createProduct`/`updateProduct` reject a `categorySlug` that is not in
`lib/catalog.ts` `categories`; `resolveDispute` rejects an `outcome` other than `comprador`/`vendedor` at runtime (the TypeScript union is not a check). The
withdrawal ledger line carries the masked Pix key (`maskPixKey`), never the full one. Workflows run with `permissions: contents: read` (CI) or none
(`sla-sweep.yml`), and `.github/dependabot.yml` opens weekly update PRs (actions are still pinned by tag, not SHA). `completeProfile` refuses an already-complete profile (`isProfileComplete`), so legal name/CPF/phone cannot be rewritten after KYC; `addFunds` reads the 24 h
deposit total inside the transaction with the wallet locked; changing an existing Pix key emails the account owner (`sendPixKeyChangedEmail`, masked key only). Public copy must not
claim checks the system does not do (no "verified sellers", no "documents under analysis": KYC stores only a file name; `lib/catalog.test.ts` guards the category texts). Nicknames and store names that pass for the platform ("Ellowin", "Suporte", "Admin"... see `isReservedName`, folded for accents/width/separators) are refused except
for staff changing their own nickname. `withTransaction` sets `lock_timeout` 10 s and `statement_timeout` 30 s; the cron route also runs `purgeExpiredRows()` (`lib/housekeeping.ts`: sessions,
`verification` tokens and OTP codes expired > 1 day) and answers only the counts. `pnpm db:migrate` hits the database in `.env.local` (production) and now asks for confirmation (`--yes` without a terminal).
`registerUser` never returns a raw exception text (Sentry + fixed message), email subjects are forced to one line, Google `disableIdTokenSignIn` is on, and `.github/CODEOWNERS` + `SECURITY.md` exist.

### Read cache for public numbers

`cachedRead()` (`lib/read-cache.ts`, a thin `unstable_cache`, 60 s) wraps the public number readers that are identical for every visitor: `getMarketStats`, `getCategoryStats`,
`getGameStats`, `getListedGames` (`lib/market-stats.ts`) and `getGameListingCounts` (`lib/marketplace.ts`). The cost is up to 60 s of delay in those NUMBERS only (home hero, category and
game counts, "Jogos com anúncios", sitemap); the listing page, search, cards and purchase price still read the database live. Never wrap anything that reads the session, a cookie or a
wallet. In tests (`NODE_ENV=test`) it returns the original function, so DB tests see real data. Request time to expect in production: ~130 ms of Brazil↔US network (functions run in `iad1`
next to the database) plus render; a sleeping Neon adds 1–2 s on the first request.

### Seller panel: analytics, charts and exports

`/painel/vendedor` is the summary (last 30 days, KPIs with sparkline, revenue and balance charts, top listings, receivables); `/painel/vendedor/analises?periodo=7|30|90` is the full page
(KPIs vs. the previous period, revenue per day with the previous period overlaid, views and orders per day, funnel views → orders → completed, revenue by game/category, per-listing table with
views and conversion, health meters for on-time delivery/cancel/refund/dispute rates, returning buyers, expected releases). All numbers come from `getSellerAnalytics()` (`lib/seller-analytics.ts`, SQL only):
the windows are the last N **São Paulo calendar days** including today and the N before; a sale counts on its `completedAt` day, an order on its `createdAt` day. Pure math is in `lib/analytics-math.ts`
(`parsePeriod` only accepts 7/30/90), geometry in `lib/chart-geometry.ts`. Charts are hand-drawn SVG in `components/seller/analytics/` (server-renderable, no chart library: Recharts was removed): 2 px lines,
bars ≤ 24 px with a 4 px rounded end, one hue (`--chart-1`), no dual axis, last-point label, hover/keyboard cursor, and every chart card offers "Ver tabela" (`ChartCard`). Deltas always carry an arrow and
a sign, health meters a text verdict: never color alone.
Views come from `product_view_daily` (migration 0009; one aggregate counter per product per São Paulo day, no IP/cookie/visitor, `lib/product-views.ts`): the product page counts a view in `after()` only for an
active listing, not for its owner and not for bots (`countsAsView`). If the table does not exist yet, `getSellerAnalytics` returns `viewsAvailable: false` and the UI shows "—" instead of failing.
Monthly goal: `seller_goal` table (migration 0010, one row per seller; deliberately NOT a column of `seller_application`, so the many `select()` of that table never depend on the migration), `lib/seller-goals.ts` + `setMonthlyGoal` (`app/actions/seller-goal.ts`, R$ 50 to R$ 10 mi, 20/h); `goalProgress()` gives percent, projection and status. Price benchmark: `getPriceBenchmarks` compares a listing's cheapest in-stock price with the MEDIAN of other sellers' active in-stock listings of the same game and category, and only shows it with 3+ peers (`MIN_PRICE_PEERS`; never a competitor's price, title or owner). Low stock: `getLowStock` (variants ≤ 2 units in active listings) feeds an action item on the summary. "Meus anúncios" shows 30-day visits (`getRecentViews`). Every reader that touches a not-yet-migrated table falls back to "unavailable".
Listing quality: `listingQuality()` (`lib/listing-quality.ts`, pure) scores a published listing 0–100 (photos 30, description 30, title 20, game 10, game-specific details 10) and returns the tips for what is missing; "Meus anúncios" shows it per card. It is guidance for the seller only: nothing in search or the storefront uses it, so never describe it as a ranking. Vacation mode: `setStoreVacation` (`app/actions/vacation.ts`, 10/h, approved sellers; coming back needs a confirmed email) moves ALL active listings to `product.status = "ferias"` (`VACATION_STATUS`, `lib/store-vacation.ts`) and back to "ativo" only the ones in "ferias", so listings the seller paused by hand stay paused. No migration: `status` is free text and every public reader requires `= 'ativo'`, so "ferias" is hidden like "pausado"; in the seller panel "paused" means `status <> 'ativo'` (summary count and the `?status=pausado` filter). A NEW public reader must keep filtering by `= 'ativo'`, never by `<> 'pausado'`. The SLA sweeps still run on the panel/orders pages on purpose: the GitHub cron has been red (CRON_SECRET), so they are the only thing guaranteeing release/refund by deadline; do not move them out of page load until the cron is proven green.
`/painel/vendedor/vendas/exportar` (GET, seller only, 10/h) returns a spreadsheet CSV (`lib/csv.ts`: `;` separator, comma decimals, BOM, formula-injection neutralized, public buyer names only, max 5000 rows).

### Automatic delivery (stock of encrypted items)

Design and decisions in `docs/entrega-automatica.md`. A listing with `deliveryType = "automatica"` (only categories `gift-cards` and `contas`, `allowsAutoDelivery` in `lib/delivery-stock-lines.ts`; any approved
seller, no sales gate) sells items from `delivery_stock_item` (migration 0011): one code/key/login per row, `payload` encrypted with `stock:<variantId>` as AAD, `payloadHash` an HMAC (`hashField`, needs the key) that
refuses the same item twice, even after it was sold, and `mask` the only thing the panel ever shows. `purchase` (`app/actions/orders.ts`) claims the oldest available item INSIDE the same transaction that moves the money
(`claimStockItem`, `FOR UPDATE SKIP LOCKED`), moves the content to `order.deliveryPayload` re-encrypted for `order:<id>` (the stock row's `payload` becomes NULL: the secret never lives in two places; a CHECK ties
`payload IS NULL` to `orderId IS NOT NULL`) and writes the order already as `entregue` with the usual `autoReleaseAt`. No item to claim → `PurchaseError("Item esgotado.")`, whatever `stock` says: selling what cannot be
delivered is impossible by construction. A sold item NEVER returns to stock (the code was shown); cancel/late-refund only apply to `aguardando_entrega`, which an automatic order never is.
`product_variant.stock` of an automatic listing is DERIVED (= available items, `syncStock`): `createProduct` starts it at 0, `updateProduct` never writes the form's stock for an automatic listing, and going back to manual is refused
while available items exist. Seller side: `app/actions/delivery-stock.ts` (`addStock`/`removeStock`, 30 adds/h, ≤ 500 lines per send, ≤ 10,000 available per variant), page `/painel/vendedor/produtos/[id]/estoque`
(`components/seller/stock-manager.tsx`). **The option is OFF until `autoDeliveryAvailable()`** (key configured AND table exists): without them the form hides "Automática", `createProduct`/`updateProduct` refuse it and `addStock`
refuses to store anything (never plaintext codes). Readers of the new table tolerate the missing migration (`isMissingStockTable`, `to_regclass`), the same way the seller analytics do. Anonymizing an account deletes its still-available
items (`purgeAvailableStock`). The order_created email for an automatic order says "já foi entregue" (one email; `notifyOrder(..., { automatic })`). Sentry scrubbing redacts any `payload` key.
A migration 0011 data step turns pre-existing "automatic" listings into manual ones with the 24 h deadline (they were only a label and their orders had no deadline, so late delivery was never refunded). Until that migration runs
(`stockTableExistsIn` false), `purchase` treats an old "automatic" listing like before (awaiting delivery, seller delivers by hand) instead of refusing the sale.

### Review replies, quick delivery and canned replies

The seller answers a review they RECEIVED with one public, editable reply (`review_reply` table, migration 0012, a table of its own so the many review readers never depend on it): `replyToReview`/`deleteReviewReply`
(`app/actions/review-replies.ts`, 30/h, 3–500 chars from `lib/review-reply-rules.ts`, `review.sellerId` must be the session user; the review id only selects the row). Every reader goes through `withReplies`/`getRepliesByReview`
(`lib/review-replies.ts`) which treat a missing table as "no replies" (`isUndefinedTable`, `lib/db-errors.ts`, walks the `cause` chain like `isUniqueViolation`): the product page, the storefront and the order page show the reply
under the review (`ReviewReplyView`, plain text); the seller panel has `/painel/vendedor/avaliacoes` (filter `?filtro=sem-resposta`) and the order page shows the reply form to the seller. Without the migration the panel says so and hides the form.
Sales list: an order awaiting delivery gets `QuickDelivery` under its row (deadline counter `DeliveryCountdown`, pure math in `lib/countdown.ts`: ok / under 1 h "entregue logo" / overdue, always words + icon; it renders only the deadline on the
server and ticks in 30 s slices on the client with `useSyncExternalStore`, so there is no hydration mismatch) and the same `markDelivered` action as the order page. Canned replies (`lib/canned-replies.ts`, static text, `CannedReplies` chips) fill the
delivery box, the seller side of the order chat and the review reply; they only insert text, nothing is sent, and a test bans the claims the site never makes ("garantia", "24/7", "em minutos"...).

### Duplicating a listing and bulk price/stock edit

`duplicateProduct` (`app/actions/products.ts`, 20/h, same email/profile gate as publishing) copies title (+ " (cópia)", `copyTitle`), category, game, description, delivery, origin, attributes and the ACTIVE items (name, price, note); the copy is
created PAUSED with stock 0 and WITHOUT photos on purpose (removing a photo from a listing deletes the Blob file, so two listings sharing one file would break one of them); an automatic listing is copied as automatic only while
`autoDeliveryAvailable()`, else as manual 24 h. `/painel/vendedor/produtos/lote` (`BulkEditTable`, 50 items per page, `getBulkRowsPage` in `lib/seller-bulk.ts`) edits price and stock of many items: ticking rows + "ajustar %" (`applyPercent`, −90…+1000, clamped to
R$ 1,00…R$ 100.000,00) only fills the fields, nothing leaves the browser until "Salvar", which sends just the changed rows (`diffChanges`) to `bulkUpdateVariants` (`app/actions/products-bulk.ts`, ≤ 100 per call, 30/h): every id must be an ACTIVE item
of a listing of the session user, every value is validated before anything is written (one bad row refuses the batch, one transaction), and the stock of an automatic listing is refused (it is the number of registered items). Price/stock limits
(`MAX_PRICE_CENTS`, `MIN_PRICE_CENTS`, `MAX_STOCK`) live in `lib/listing-checks.ts` and are shared with the listing form.

### Fee statement, new-seller checklist, low-stock email, auto-delivery watch

`/painel/vendedor/extrato` (+ `/exportar` CSV, 10/h): COMPLETED sales of the last 12 São Paulo months, one row per month plus total (`getMonthlyStatement`, `lib/seller-statement.ts`; pure month math in `lib/statement-math.ts`), a sale counts in the month of its
`completedAt`, refunded/cancelled never count, and the page says it is not a tax document. `buildChecklist` (`lib/seller-checklist.ts`, pure; inputs from `getChecklistInputs` in `lib/seller-checklist-data.ts`) is the "Complete a sua loja" card on the summary:
fixed steps count for progress, "pendências" (unanswered questions/reviews) only appear while they exist, and the card disappears at `NEW_SELLER_SALES` (10) completed sales or when nothing is left; a missing goal/reply table just drops that
item. `notifyLowStock(variantId)` (`lib/notify.ts`, called by `purchase` after the commit) emails the seller when an ACTIVE item of an ACTIVE listing is at ≤ `LOW_STOCK_THRESHOLD` (2) units, reading the stock at send time, at most one "baixo" and one "zero"
email per item per São Paulo day (`refId stock:<variant>:<day>:<level>` in `notification_log`); `purchase` tests that mock `@/lib/notify` must also provide `notifyLowStock`. `/admin/entrega-automatica` (`lib/auto-delivery-monitor.ts`, staff only via
`getStaff()`, NOT `getCurrentStaff()` which returns any logged user) shows, per seller of stock-delivered orders, orders / disputes / buyer-won / refunded and flags 5+ orders with 10%+ disputes: this is the brake for the "no sales gate" decision on automatic delivery.

### Favorites and price-drop alerts

`favorite` (migration 0013, PK user+product) is private to the buyer (the seller never sees who saved a listing; `/favoritos` is `noindex` and in robots): `toggleFavorite` (`app/actions/favorites.ts`, 60/h, max 200, not your own listing, hidden for deleted sellers) stores
`baselineCents` = the lowest price FOR SALE right now (`minSellingPrice`: active listing, active item, stock > 0). `notifyPriceChange(productId)` (`lib/notify.ts`) runs after an edit that really changed a price or added an item (`updateProduct`, `bulkUpdateVariants`; NOT on stock edits):
one SQL statement locks the product's favorites, moves every changed baseline to the new minimum and returns the OLD baselines; a person whose old baseline is higher gets one email ("Baixou o preço", at most one per person per listing per São Paulo day, never the seller, only while the listing
is active), a price rise just raises the baseline so a later drop alerts again. Anonymizing an account deletes its favorites (`purgeFavorites`, guarded by `to_regclass`). Every reader tolerates the missing table (`available: false`, the button simply does not render).
Tests that mock `@/lib/notify` for `products`/bulk need `notifyPriceChange`; for `purchase`, `notifyLowStock`.

### Account origin, the certification seal and buyer account safety

The origin of an account listing is a DECLARATION by the seller (`lib/account-origin.ts`): the product page says so and that Ellowin does not check it. `purchase` copies what was declared at the moment of payment into the order chat as a `system` message
(`originPurchaseNote`, only for category `contas` with a valid origin; no migration needed), so a later edit of the listing cannot change what the buyer saw, and both parties and the moderation can read it. The Selo de Certificação is evidence-based:
`sealState` (`lib/seller-seal.ts`) gives the seal only to a seller with NO recovered-account flag AND at least one completed sale, and the text carries the number of sales ("… em N vendas concluídas"); a seller with no completed sale is "Vendedor novo", with no seal
(zero records proves nothing). `getSellerAccountFlagSummary` returns `completedSales` for that. An `entregue` order of a `contas` listing shows the buyer `AccountSecurityChecklist` (change password, e-mails, 2FA, sessions, only then confirm).

### Wallet reconciliation

`lib/reconcile.ts` (read-only, 12 SQL checks: balance vs ledger, held vs active orders, every order settled exactly once, total money =
deposits − withdrawals − fees, no negatives, and the two stock checks: a sold stock item points at a delivered order of the same variant; an automatic variant's `stock` equals its available items; those two are skipped when
the 0011 table does not exist yet) runs at the end of every `/api/cron/sla` call and on `/admin/conferencia` (admin only). If
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
Filtered/paged URLs canonicalize to the base path; `/busca` is `noindex`. Card extras (`instant`, `positivePct` from
≥ 5 reviews, "últimas N unidades" at ≤ 5 in stock) come from the same query and the pure `lib/card-info.ts`. The product
page ends with `getRelatedListings()` (same game/category + same store); the header search has a `/` shortcut
(`components/search-shortcut.tsx`) and game-name suggestions through a native `<datalist>`
(`components/search-suggestions.tsx` → `/api/busca/sugestoes`, static catalog only, `lib/search-suggest.ts`). `/busca` with
a text term sorts by relevance by default (`defaultSort` on `ListingFilters`; title starts with the term > a title word starts
with it > game starts with it > rest, ties by newest) and offers no relevance option without a term. `/busca` also
takes `?categoria=` (chips; `scopeHref()` keeps the scope when clearing filters). Category and game pages show real
listing/seller counts and "a partir de" (`getCategoryStats()`/`getGameStats()` in `lib/market-stats.ts`), never the filtered total.

### Unique-violation errors

Drizzle (0.45) wraps driver errors in a `DrizzleQueryError` with the original in `.cause`, so `error.code === "23505"` is false
for `db.insert/update` calls (it only works on the raw `pool`/`client`). Use `isUniqueViolation()` from `lib/db-errors.ts`, which
walks the cause chain; never re-implement the check inline (an inline one made "nickname already in use" a 500 in "Minha conta").

### Per-game attributes (rank, region…)

`lib/game-attributes.ts` (pure) defines, per game slug, closed-set fields (`valorant`, `counter-strike-2`, `steam` so far)
stored in `product.attributes` (jsonb, key → option value; migration 0008). Same pattern as delivery time: the seller form
(`components/seller/product-form.tsx`) renders selects from the definition, `createProduct`/`updateProduct` re-validate with
`sanitizeAttributes()` (unknown keys/values dropped, required fields enforced) and `/jogos/[slug]` adds `a_<key>` filters
(`parseListingFilters(sp, fields)` → `product.attributes ->> key`). The product page lists them and cards show up to 2 `highlight`
fields. To add a game, add an entry to `GAME_ATTRIBUTES` (only append options — changing a `value` orphans saved listings);
the test file checks the game exists in the catalog. Listings created before this have `{}`, so a filter excludes them until
the seller edits the listing.

### Per-game SEO text

`lib/game-seo.ts` holds, for 10 games, the meta description, intro, "o que conferir" tips and FAQ shown at the end of
`/jogos/[slug]` (`components/games/game-seo-section.tsx`; the "how buying works" steps use `AUTO_RELEASE_DAYS`). Each game must
have its own text (a test fails on copied paragraphs), only claim what the system does, and never type a number of days (the
test bans `N dias`). Every game that has structured attributes must also have an entry.

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
until that secret is set the run FAILS (red, `::error::`) instead of passing silently. The route's JSON body is printed in the PUBLIC GitHub Actions log of that workflow, so it carries only counts and the word `falhou`
(never exception text or the names of the failed wallet checks; those go to the server log/Sentry and the admin email), and a failed step answers
HTTP 500 so the workflow goes red. Each auto-action leaves a `system` message in the
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

### Game icons

`GameIcon` (`components/games/game-icon.tsx`) shows, in this order: (1) the game's own image from `public/images/jogos/<slug>.webp` (128x128, listed in `lib/game-images.ts`; app icons
from the App Store, Steam community icons and icons declared by the game's official site, picked and checked one by one), (2) a platform/game mark from `lib/game-brand-icons.ts` (Simple Icons SVG paths, CC0, on the brand color),
(3) a generated tile with the initials and a color derived from the slug (`lib/game-icon.ts`). It is decorative (`aria-hidden`) and used in the `/jogos` list, the game page header
and the home "Jogos com anúncios" strip. These are the publishers' own trademarks used only to identify the game (the owner accepted that risk, no licence); `lib/game-images.test.ts`
keeps the list and the folder in sync. To add or fix one, drop a square webp in the folder and add the slug to the list (a wrong match is worse than the generated tile: check the image).

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
`INSTANT_DELIVERY_TIME` for automatic delivery (which is real now: see "Automatic delivery" above). `app/actions/products.ts` re-normalizes
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

### Theme toggle (light / dark / automatic)

The choice lives in the `ellowin-theme` cookie (`lib/theme.ts`, pure): `app/layout.tsx` reads it and puts `dark`/`light` on `<html>`
server-side, so there is no pre-hydration script (it would need the CSP nonce) and no flash. No cookie = no class = the CSS follows
`prefers-color-scheme` (`:root:not(.light)` block in `app/globals.css`). The Tailwind `dark:` variant is defined to match all three
states. Client side, `useThemePreference()` (`components/theme-preference.ts`) reads the `<html>` class and writes class + cookie;
`ThemeToggle` (header, `sm`+) and `ThemeMenuItems` (inside the mobile menu, below `sm`) use it, and so does the sonner `Toaster`.
`next-themes` was removed — don't re-add it. The dev-only `DesignLab` restores the chosen theme when its panel closes.
Because the root layout calls `cookies()`, every page renders dynamically (they already did, via the header session).

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
guarantee window the operation or the order rules don't have (`autoReleaseAt` is set by `markDelivered` and counts 7 days from the
**delivery**; it is NULL while the order awaits delivery. Orders delivered before 2026-10-17 keep the old date, 7 days from the purchase).

### SEO (ranking on Google)

What the code does for search (`lib/seo.ts`, `lib/product-jsonld.ts`, `lib/indexnow.ts`): product pages get a title with the price (`productSeo`: "Conta X por R$ 79,00 | Ellowin"), a description
with the payment-protection sentence, schema.org Product JSON-LD (one `Offer` per variant, public store name as seller, game as brand, SKU `ellowin-<id>`) and a BreadcrumbList; game and
category pages get the breadcrumb; the home declares Organization + WebSite with a `SearchAction`. A game page with no listing and no own text (`lib/game-seo.ts`) is `noindex` and left out of
`/sitemap.xml` (it becomes indexable by itself when someone lists a game); paused listings are `noindex`. `pingIndexNow()` tells Bing/Yandex right after a listing is published, edited or
paused (production only; the public key is served at `/indexnow-key.txt`). **Google does not use IndexNow**: it needs the sitemap and Search Console (owner steps in `PENDENCIAS.md`).
Copy for the search result must be true for the system, like everywhere else (`lib/seo.test.ts` bans "garantia", "em minutos", "24/7", "verificado").

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

**CI runs `next build` too** (since 2026-10-11), because `tsc`/`lint`/`vitest` don't catch Next's client/server
module-boundary errors (e.g. a client component transitively importing server-only code like `next/server`'s
`after()`) — which is why `lib/sla.ts` had to be split from `lib/sla-sweeps.ts` (see above). The CI build has no database
and fake `DATABASE_URL`/`BETTER_AUTH_SECRET`, so **no page or route may query the database while building**: anything that
is statically prerendered and reads Neon (like the old `app/sitemap.ts`) fails that build — mark it
`export const dynamic = "force-dynamic"`. The audit step fails on high/critical advisories in production dependencies; fix
by bumping the transitive package (`pnpm up <pkg> --depth Infinity`; a parent that pins an exact version needs its own
bump, as happened with `minimatch` → `brace-expansion`). Still run `pnpm build` locally before pushing.
