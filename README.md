# IndexForge

<p align="center">
  <img src="app/icon.svg" alt="IndexForge logo" width="96" />
</p>

<p align="center">
  <strong>Forge live crypto market themes into validated draft indexes.</strong>
</p>

Design, validate, and prepare draft on-chain thematic indexes, powered by SSI Protocol, SoSoValue, SoSoValue Indexes, SoSoValue Macro, AI, and SoDEX.

IndexForge turns a market theme like `AI infrastructure`, `DeFi blue chips`, or `SoDEX tradable majors` into a live crypto index. A creator chooses 3-8 tokens, the app pulls real SoSoValue market and macro data, the composer suggests weights, the UI backtests the basket against BTC, and the SSI/SoDEX path shows how the index can become a wrapped on-chain product that others follow.

Live production app: https://indexfordge.vercel.app

## Project Overview

IndexForge is a creator tool for turning a crypto market idea into a draft investable index. Instead of manually collecting prices, choosing weights in a spreadsheet, and guessing whether a basket is executable, IndexForge connects live market data, transparent weighting, backtesting, SSI-style index metadata, and SoDEX execution checks into one workflow.

The app is built for index creators, crypto researchers, and hackathon judges who want to see the full path from idea to validated product:

1. Start with a theme such as `AI infrastructure`, `DeFi blue chips`, or `SoDEX tradable majors`.
2. Select 3-8 tokens from the live SoSoValue universe.
3. Generate weights with OpenAI or the built-in market-signal composer.
4. Adjust those weights manually with sliders.
5. Backtest the basket against BTC using recent SoSoValue daily closes.
6. Inspect risk, liquidity, concentration, and holdout validation.
7. Inspect the live SoSoValue macro event overlay for near-term event risk.
8. Produce an unsigned SSI-style index manifest.
9. Check whether the intended rebalance legs map to live SoDEX testnet markets.
10. Review China-compatible production readiness checks.
11. Save a browser-local draft and view it in the gallery and creator profile pages.

The important idea is that IndexForge does not pretend a draft index is already live on-chain. It shows the honest pre-production path: live data first, transparent methodology second, validation third, and signed on-chain or exchange execution only after the required credentials and checks exist.

## Visual Flow

```mermaid
flowchart LR
  A["Creator theme"] --> B["Live token picker"]
  B --> C["SoSoValue data"]
  C --> D["OpenAI or quant composer"]
  D --> E["Manual slider edits"]
  E --> F["Backtest vs BTC"]
  F --> G["Macro + validation report"]
  G --> H["Production readiness"]
  H --> I["SSI draft manifest"]
  I --> J["SoDEX execution intent"]
  J --> K["Browser-saved draft"]

  B -. "Full universe search" .-> C
  D -. "Weights sum to 100%" .-> E
  J -. "No fake trades" .-> K
```

## System Diagram

```mermaid
flowchart TB
  User["Creator / Judge"] --> UI["Next.js App Router UI"]
  Ops["Production monitor"] --> HealthAPI["GET /api/index-forge/health"]

  UI --> Designer["/designer"]
  UI --> Gallery["/gallery"]
  UI --> Creators["/creators"]

  Designer --> ComposerAPI["POST /api/index-forge"]
  Designer --> UniverseAPI["GET /api/index-forge/universe"]
  Gallery --> GalleryAPI["GET /api/index-forge/gallery"]
  Creators --> LocalDrafts["Browser localStorage drafts"]
  Designer --> LocalDrafts

  ComposerAPI --> SoSoValue["SoSoValue OpenAPI"]
  UniverseAPI --> SoSoValue
  HealthAPI --> SoSoValue
  HealthAPI --> SoDEX
  GalleryAPI --> SoSoValueIndexes["SoSoValue Index endpoints"]
  ComposerAPI --> Macro["SoSoValue Macro events"]
  ComposerAPI --> OpenAI["OpenAI Responses API"]
  ComposerAPI --> Quant["IndexForge Quant fallback"]
  ComposerAPI --> SSI["Unsigned SSI manifest"]
  ComposerAPI --> SoDEX["SoDEX testnet symbols"]

  SoSoValue --> Metrics["Prices, klines, turnover, liquidity"]
  Metrics --> Backtest["Weekly rebalance backtest"]
  Macro --> Validation["Macro event overlay"]
  OpenAI --> Weights["Suggested weights"]
  Quant --> Weights
  Weights --> Backtest
  Backtest --> Response["IndexForge response"]
  SSI --> Response
  SoDEX --> Response
  Response --> Designer
```

## Why It Is Useful

Creating a crypto index normally requires several disconnected pieces: market-data APIs, quant weighting logic, backtesting, index methodology docs, trading venue checks, and a publishing layer. IndexForge compresses that into one interface so a solo creator can prototype an index business quickly.

Useful outcomes:

- Creators can test market themes without hardcoding performance numbers.
- Users can compare a basket against BTC before trusting the idea.
- Judges can inspect where every metric comes from.
- The app can show whether selected assets are tradable on SoDEX testnet before pretending execution is ready.
- Draft manifests make the methodology portable for future SSI Protocol submission.
- Browser-local gallery and creator profiles demonstrate the product loop without inventing fake public users or fake transactions.

## What The Demo Proves

- Live SoSoValue data can power token discovery, price history, market snapshots, liquidity checks, and SSI reference context.
- AI-generated weights can be constrained to real selected tokens and normalized to 100%.
- A deterministic quant fallback keeps the app useful even if the OpenAI call fails.
- Manual edits are not cosmetic; they rerun through the same API, backtest, validation, SSI manifest, and SoDEX intent pipeline.
- SoDEX execution is handled as an intent and readiness check, not as a fake trade.
- The app is deployed on Vercel with encrypted environment variables and production API routes.

## Wave 3 Final Status

Wave 3 production readiness pass:

Production app: https://indexfordge.vercel.app

What is working now:

- Real SoSoValue API integration using `x-soso-api-key`.
- Shared SoSoValue server client aligned to the current docs: base URL `https://openapi.sosovalue.com/openapi/v1`, auth through `x-soso-api-key`, documented `42901` rate-limit handling, in-flight request dedupe, and stale-cache fallback when a cached response exists.
- Live token resolution from `GET /currencies`.
- Full token-universe search from live SoSoValue data, including common symbols such as `BTC`, `ETH`, `SOL`, `DOGE`, `AAVE`, and `LINK`.
- Live market snapshots from `GET /currencies/{currency_id}/market-snapshot`.
- Up to 90 days of daily price history from `GET /currencies/{currency_id}/klines`.
- Optional token sector and project context from `GET /currencies/{currency_id}` when `SOSOVALUE_ENABLE_PROJECT_INFO=true`.
- AI Composer route with OpenAI support through `OPENAI_API_KEY`.
- SoSoValue-only quant composer fallback when no OpenAI key is present or an AI call fails.
- Full designer page at `/designer` with theme input, token picker, quick presets, and manual weight sliders.
- `SoDEX majors` preset for a cleaner execution demo using testnet-listed assets.
- Manual slider edits posted back to the API, normalized to 100%, and rerun through the same backtest and validation path.
- Weight display as live bars with rationale and transparent signal scores.
- Weekly-rebalanced backtest versus BTC with return, drawdown, volatility, Sharpe-style ratio, win rate, rebalance count, and assumptions.
- Holdout validation with training days, holdout days, effective names, max-weight concentration, and liquidity checks.
- Live SoSoValue Macro overlay from `GET /macro/events`, with next-14-day event count and risk tier.
- SSI manifest generation with methodology, ticker, data window, and constituent weights.
- Rate-limit-safe SoSoValue Indexes comparison from real `GET /indices` responses only; no fallback index ticker data is invented if the endpoint is unavailable.
- SoDEX testnet market simulation using live `GET /markets/symbols` metadata.
- Production readiness panel that reports market data, macro data, rate-limit posture, OpenAI fallback state, SoDEX executable legs, and China-compatible browser delivery.
- Production health endpoint at `GET /api/index-forge/health` for deployment checks.
- Gallery page at `/gallery` combining live SoSoValue Indexes with browser-saved IndexForge draft manifests.
- Creator profiles at `/creators`, grouped from sanitized browser-saved local drafts without fake creators or fake performance.
- Rate-limit-aware request caching, in-flight SoSoValue fetch dedupe, composer rate limiting, stricter token/weight validation, and safer local draft parsing.
- Optional snapshot and SSI-reference enrichments fail fast under upstream `429` responses so core index generation still returns.
- China-ready frontend shell: no `next/font/google` dependency, no browser-side SoSoValue/OpenAI calls, local Sentient font files, and same-origin API routes for third-party data.
- Vercel production deployment with encrypted environment variables for SoSoValue, OpenAI, and SSI-related config.

No price, volume, market cap, flow, return, weight, or backtest number is hardcoded. The default token symbols and quick presets are only starting selections; the designer can load the broader SoSoValue universe at runtime.

Current final boundary: browser-saved drafts are local demo records, not shared backend records yet. Signed SSI submission and signed SoDEX batch order submission remain intentionally gated behind future credentialed server routes because the app should not fake mainnet deployments, private signatures, public users, or submitted orders.

## What It Does

IndexForge lets anyone forge a crypto theme into an investable index:

1. Enter a theme and choose tokens.
2. Fetch live SoSoValue price, turnover, sector, and kline data.
3. Generate suggested weights with OpenAI when configured, or with the built-in SoSoValue signal composer.
4. Adjust weights with manual sliders and rerun the same backtest/validation path.
5. Display each token weight, rationale, 30-day activity, and live market metrics.
6. Backtest the weighted index against BTC using daily SoSoValue closes and weekly rebalance logic.
7. Review live SoSoValue macro event risk for the next 14 days.
8. Review production readiness and China-compatible browser-delivery checks.
9. Save a browser-local draft manifest into the gallery and creator profile workflow.
10. Simulate the SoDEX testnet order legs against live SoDEX spot symbol metadata.
11. Use the `SoDEX majors` preset to demo a basket that maps to live SoDEX testnet markets.

Example default theme: `AI infrastructure`

Default tokens:

- `TAO`
- `RENDER`
- `FET`
- `AKT`
- `NMR`

## How It Works

Data layer:

SoSoValue is the source of truth. The app resolves token symbols to currency IDs, loads current market snapshots, loads up to 90 daily klines, loads SoSoValue Index references, and pulls macro events from `GET /macro/events`. The shared server-side SoSoValue client follows the documented `x-soso-api-key` header, recognizes the documented `42901` rate-limit response, caches endpoint responses by their documented update cadence, and dedupes in-flight requests. The default route keeps project-info enrichment off to stay under SoSoValue rate limits; set `SOSOVALUE_ENABLE_PROJECT_INFO=true` to also read sectors and project introductions from `GET /currencies/{currency_id}`. The 30-day flow value is computed from real kline volume multiplied by close price, while 24-hour turnover comes directly from the market snapshot.

AI layer:

The route is OpenAI-ready. If `OPENAI_API_KEY` is set, the app sends compact SoSoValue metrics to the OpenAI Responses API and asks for structured JSON weights that sum to 100. If no OpenAI key is available or the upstream call fails, the app uses a transparent scoring model based on theme fit, 30-day momentum, flow trend, 30-day traded value, liquidity, rank, and volatility. Manual slider weights are normalized by the backend and evaluated through the same validation pipeline.

Chain layer:

The app keeps the publish state honest: it creates an index name, ticker, weekly rebalance methodology, unsigned SSI manifest, SoSoValue Indexes overlap references, and a SoDEX testnet rebalance simulation without generating fake addresses or fake transactions. Browser-saved drafts are local demo artifacts, not shared backend records yet. SoDEX signed submission remains gated on account credentials, API key name, and an EIP-712 signing key.

China delivery layer:

The browser runtime uses local assets and same-origin API routes. SoSoValue, OpenAI, SoDEX, and future SSI calls stay server-side, so China browser users do not need direct browser access to those third-party APIs. The app no longer depends on `next/font/google`; the mono UI uses a local/system stack and the display font files are served from `public/`.

Performance and safety layer:

- The composer keeps a short server-side response cache for repeated requests.
- SoSoValue fetches are deduped while in flight so parallel UI calls do not stampede the API key.
- Composer requests are rate-limited per forwarded client address.
- Expensive project-info enrichment is opt-in via `SOSOVALUE_ENABLE_PROJECT_INFO=true`.
- Optional snapshot and SSI-reference enrichments fail fast under upstream 429s so core index generation still returns.
- Bad token and weight payloads return explicit `400` responses instead of internal errors.
- Local draft records are sanitized before rendering gallery or creator pages.
- SoSoValue 429s and `42901` API-code responses return a clear retry message.
- `/api/index-forge/health` reports production upstream status for SoSoValue currencies, SoSoValue Indexes, SoSoValue Macro, SoDEX symbols, OpenAI configuration, and China-compatible browser delivery.

## Local Setup

```bash
corepack pnpm install
corepack pnpm dev
```

Then open:

```text
http://localhost:3000
```

Environment variables:

```bash
SOSOVALUE_API_KEY=your_sosovalue_key
SOSOVALUE_BASE_URL=https://openapi.sosovalue.com/openapi/v1
SOSOVALUE_ENABLE_PROJECT_INFO=false
OPENAI_API_KEY=optional_openai_key
OPENAI_MODEL=gpt-4.1-mini
SSI_PROTOCOL_KEY=optional_wave_3_key
SODEX_SPOT_ENDPOINT=https://testnet-gw.sodex.dev/api/v1/spot
SODEX_ACCOUNT_ID=optional_sodex_account
SODEX_API_KEY_NAME=optional_sodex_key_name
SODEX_API_PRIVATE_KEY=optional_server_side_signing_key
```

The local `.env.local` is ignored by git. Do not commit real keys.

Production preview:

```bash
corepack pnpm build
corepack pnpm start
```

## API Route

Composer endpoint:

```http
POST /api/index-forge
```

Body:

```json
{
  "theme": "AI infrastructure",
  "tokens": ["TAO", "RENDER", "FET", "AKT", "NMR"]
}
```

Rules:

- `tokens` must resolve to 3-8 unique SoSoValue currency symbols.
- `weights`, when supplied, must be an array of `{ "symbol": string, "weight": number }` with positive finite weights.

Returns:

- resolved SoSoValue token data from the full live token universe
- AI or signal-composer weights
- manual slider weights when supplied
- weekly-rebalanced backtest points versus BTC
- risk metrics, assumptions, holdout validation, and overfit notes
- live SoSoValue Macro event overlay and production readiness checks
- SSI manifest, rate-limit-safe SoSoValue Indexes references, and SoDEX testnet simulation state
- warnings for missing symbols, missing OpenAI credentials, or upstream rate limits

Supporting endpoints:

```http
GET /api/index-forge/universe
GET /api/index-forge/gallery
GET /api/index-forge/health
```

`/api/index-forge/health` returns a JSON status object for SoSoValue currencies, SoSoValue Indexes, SoSoValue Macro, SoDEX symbols, OpenAI configuration, and China-compatible browser delivery.

## Wave Roadmap

### Wave 1: Prove the Concept

 

- Project overview and README.
- SoSoValue price, turnover, sector, and kline data for at least 5 tokens.
- OpenAI-compatible AI Composer endpoint.
- Static/live index display with weight bars.
- 30-day BTC comparison backtest.
- Demo-ready Next.js UI using the supplied hero animation and styling.

### Wave 2: Working Product

 

Wave 2 is now implemented as a working product flow, not just a static demo:

- Full index designer shipped at `/designer` with theme input, live SoSoValue token universe search, token picker, and manual weight sliders.
- Quick presets shipped for the default AI infrastructure basket, a SoDEX-tradable majors basket, and a DeFi core basket.
- Manual slider edits are posted back to the Next API route, normalized to 100%, and rerun through the same SoSoValue backtest, validation, SSI, and SoDEX pipeline.
- Backtesting now uses the latest shared kline window, weekly target rebalance logic, BTC comparison, drawdown, volatility, Sharpe-style ratio, win rate, rebalance count, and explicit assumptions.
- Validation now shows a training/holdout split, holdout return versus BTC, effective names, max-weight concentration, liquidity checks, and overfit notes.
- Gallery shipped at `/gallery`, combining real SoSoValue Indexes data with browser-saved IndexForge draft manifests.
- Creator profiles shipped at `/creators`, grouped from the user's local draft manifests without fake creators or fake performance.
- SoDEX testnet simulation resolves intended rebalance legs against live `GET /markets/symbols` metadata and marks each leg as executable or not listed before any signed submission.
- `SoDEX majors` preset added for a cleaner execution demo against testnet-listed assets.
- Next API backend routes now support composer, live token universe, and gallery data.
- Production deployment shipped on Vercel at https://indexfordge.vercel.app.

Current product surfaces:

- `/` introduces the product and links into the working designer, gallery, and creator views.
- `/designer` is the main workflow: choose a theme, pick tokens, compose weights, adjust sliders, inspect backtest metrics, inspect SoSoValue macro risk, review production readiness, inspect SSI references, and stage SoDEX testnet execution intent.
- `/gallery` shows live SoSoValue Indexes plus browser-saved IndexForge draft manifests.
- `/creators` groups browser-saved drafts by creator name and summarizes best return and average drawdown.
- `/api/index-forge` composes a full index response from live SoSoValue data, SoSoValue Macro data, OpenAI or the local quant fallback, backtest validation, readiness checks, SSI manifest data, and SoDEX intent data.
- `/api/index-forge/universe` exposes the full SoSoValue token universe for search.
- `/api/index-forge/gallery` loads live SoSoValue Indexes for the gallery.
- `/api/index-forge/health` checks configured production upstreams.

Reliability and security work:

- Added full token-universe search so common symbols such as `BTC`, `ETH`, `SOL`, `DOGE`, `AAVE`, and `LINK` are discoverable.
- Added explicit token and weight validation so malformed API payloads return `400` instead of internal errors.
- Added per-client composer rate limiting to protect API-backed routes.
- Added short server-side composer caching for repeated requests.
- Added shared in-flight SoSoValue fetch deduplication to avoid duplicate upstream calls during concurrent UI requests.
- Deferred token-universe loading until after the initial composer load to avoid cold-start API bursts.
- Made expensive project-info enrichment opt-in with `SOSOVALUE_ENABLE_PROJECT_INFO=true`.
- Made optional snapshot, macro, and SSI-reference enrichments fail fast under upstream `429` responses so core index generation still returns.
- Updated SoSoValue rate-limit handling to recognize the documented `42901` API code.
- Hardened OpenAI response handling and fallback behavior so non-JSON upstream responses do not leak raw provider text into the UI.
- Removed hardcoded fallback SoSoValue Index tickers; SSI references only come from real `/indices` responses.
- Sanitized browser-local drafts before rendering gallery and creator pages.
- Removed `next/font/google` so production builds do not need Google font access.
- Added a reduced-motion CSS fallback that hides the WebGL canvas for users who prefer reduced motion.
- Removed stale tracked Next.js runtime logs from the repository.

Deployment and verification:

- Vercel production deployment: https://indexfordge.vercel.app
- Latest Wave 3 final verification date: 2026-07-19.
- Dependency graph finalized with `pnpm@10.24.0`, no `latest` package specs, no unused Expo/React Native/Leva/Recharts debug stack, `auto-install-peers=false` to avoid mobile-only optional peers in this web app, and only the known native build scripts for Tailwind/Sharp/resolver packages approved.
- Local checks run before deploy: `corepack pnpm install --frozen-lockfile --prefer-offline --reporter append-only`, `corepack pnpm lint`, and `corepack pnpm build`.
- Local production server smoke confirmed `/api/index-forge/health` reports SoSoValue currencies, SoSoValue Indexes, SoSoValue Macro, SoDEX symbols, OpenAI configuration, and China browser path as available/configured.
- Local production API smoke confirmed `/api/index-forge/universe` returns the live SoSoValue universe with `BTC` and `ETH`, `/api/index-forge` returns a 5-token AI infrastructure index with weights summing to 100 and 90 backtest points, `/api/index-forge/gallery` returns 6 live SoSoValue Indexes, and malformed over-limit input returns `400`.
- Browser smoke checks confirmed the home WebGL hero, `/designer` on desktop and mobile, `/gallery`, `/creators`, mobile menu navigation, no browser console errors, no horizontal overflow, and nonblank screenshots.
- Vercel production deployment completed successfully with Next.js 16.2.6 and the committed pnpm lockfile.
- Production API smoke confirmed `https://indexfordge.vercel.app/api/index-forge/health`, live universe lookup, index generation, macro overlay, gallery data, and readiness status after deployment.
- Production browser smoke confirmed `https://indexfordge.vercel.app`, `/designer`, `/gallery`, `/creators`, and mobile menu navigation after deployment.

Final boundaries:

- Browser-saved drafts are local demo records. They are not yet shared across users or devices.
- Signed SSI submission and signed SoDEX batch order submission are intentionally gated behind future credentialed server routes.
- SoSoValue has strict key-level rate limits, so optional enrichment is conservative by default.
- A shared database or Vercel storage layer is the next step for a truly public creator network.

### Current Production Notes

- `OPENAI_API_KEY`, `SOSOVALUE_API_KEY`, `SOSOVALUE_BASE_URL`, `OPENAI_MODEL`, and `SSI_PROTOCOL_KEY` are configured as encrypted Vercel environment variables.
- Keep real keys only in ignored local files such as `.env.local` and in Vercel encrypted env vars.
- Rotate any key that was pasted into chat or terminal history before the final submission.

## Verification

Recommended pre-deploy checks:

```bash
corepack pnpm lint
corepack pnpm build
```

Manual smoke checks:

- `/designer` loads the default AI infrastructure basket.
- Token search returns common symbols such as `BTC` and `ETH`.
- Macro risk renders from `GET /macro/events` when SoSoValue returns events.
- Production readiness shows the China-compatible browser path and upstream status.
- `SoDEX majors` resolves listed testnet markets in the execution panel.
- `/gallery` loads live SoSoValue Indexes and local drafts.
- `/creators` groups browser-saved drafts by creator name.
- `/api/index-forge/health` returns JSON health checks without exposing secrets.

### Wave 3: Production Ready

Wave 3 is implemented as a production-ready, credential-honest app:

- Shared SoSoValue API client, current rate-limit handling, and no invented market/index data.
- Live macro event overlay from the SoSoValue Macro module.
- China-compatible browser path with local/system fonts and server-side third-party API access.
- Production readiness panel in the designer.
- `/api/index-forge/health` endpoint for deployment checks.
- Hardened local draft parsing and stricter composer input validation.
- Final README, setup, API, verification, and boundary notes.

Credentialed SSI mainnet deployment, signed SoDEX order submission, copy-trade subscriptions, scheduled rebalances, and fee collection are not faked in this repo. They require real credentials, custody/signing policy, persistence, and separate production approval before implementation.

## Why It Matters

Building a crypto index fund normally requires quants, trading infrastructure, custodial mechanics, and a distribution layer. IndexForge compresses that into one creator workflow: pick a theme, let market data and AI shape the basket, backtest it, then publish it as a followable on-chain strategy. That is the one-person finance business angle for the wave hack.

## References

- SoSoValue API documentation: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoSoValue rate limit documentation: https://sosovalue-1.gitbook.io/sosovalue-api-doc/rate-limit
- SoSoValue Index documentation: https://sosovalue-1.gitbook.io/sosovalue-api-doc/3.-sosovalue-index/index
- SoSoValue Macro documentation: https://sosovalue-1.gitbook.io/sosovalue-api-doc/8.-macro/macro
- SoDEX documentation: https://sodex.com/documentation
- OpenAI Responses API reference: https://developers.openai.com/api/reference/resources/responses/methods/create
