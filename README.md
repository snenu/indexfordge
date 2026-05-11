# IndexForge

Design, backtest, and publish your own on-chain thematic index, powered by SSI Protocol, SoSoValue, AI, and SoDEX.

IndexForge turns a market theme like `AI infrastructure`, `DeFi blue chips`, or `RWA plays` into a live crypto index. A creator chooses 3-8 tokens, the app pulls real SoSoValue market data, the composer suggests weights, the UI backtests the basket against BTC, and the SSI/SoDEX path shows how the index becomes a wrapped on-chain product that others can follow.

## Wave 1 Status

Wave 1 due date: May 12, 2026 at 20:30.

What is working now:

- Real SoSoValue API integration using `x-soso-api-key`.
- Live token resolution from `GET /currencies`.
- Live market snapshots from `GET /currencies/{currency_id}/market-snapshot`.
- 30-day daily price history from `GET /currencies/{currency_id}/klines`.
- Token sector and project context from `GET /currencies/{currency_id}`.
- AI Composer route with OpenAI support through `OPENAI_API_KEY`.
- SoSoValue-only composer fallback when no OpenAI key is present or an AI call fails.
- Weight display as live bars.
- 30-day weighted backtest versus BTC.
- SSI Protocol and SoDEX publishing path represented as a Wave 3-ready draft state.

No price, volume, market cap, flow, return, or backtest number is hardcoded. The default token symbols are only a demo starting universe; the market data comes from SoSoValue at runtime.

## What It Does

IndexForge lets anyone forge a crypto theme into an investable index:

1. Enter a theme and choose tokens.
2. Fetch live SoSoValue price, turnover, sector, and kline data.
3. Generate suggested weights with OpenAI when configured, or with the built-in SoSoValue signal composer.
4. Display each token weight, rationale, 30-day activity, and live market metrics.
5. Backtest the weighted index against BTC using daily SoSoValue closes.
6. Prepare the SSI Protocol / ValueChain / SoDEX publishing flow for Wave 2 and Wave 3.

Example default theme: `AI infrastructure`

Default tokens:

- `TAO`
- `RENDER`
- `FET`
- `AKT`
- `NMR`

## How It Works

Data layer:

SoSoValue is the source of truth. The app resolves token symbols to currency IDs, loads current market snapshots, loads 30 daily klines, and reads sectors/project introductions. The 30-day flow value is computed from real kline volume multiplied by close price, while 24-hour turnover comes directly from the market snapshot.

AI layer:

The route is OpenAI-ready. If `OPENAI_API_KEY` is set, the app sends compact SoSoValue metrics to the OpenAI Responses API and asks for structured JSON weights that sum to 100. If no OpenAI key is available, the app uses a transparent scoring model based on theme fit, 30-day momentum, flow trend, 30-day traded value, liquidity, rank, and volatility.

Chain layer:

Wave 1 does not submit transactions because SSI Protocol and SoDEX credentials are still pending. The app keeps the publish state honest: it creates an index name, ticker, weekly rebalance draft, ValueChain/SSI target, and SoDEX copy-trade preview status without generating fake addresses or fake transactions.

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
OPENAI_API_KEY=optional_openai_key
OPENAI_MODEL=gpt-4.1-mini
SSI_PROTOCOL_KEY=optional_wave_3_key
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

Returns:

- resolved SoSoValue token data
- AI or signal-composer weights
- 30-day backtest points versus BTC
- SSI/SoDEX draft publish state
- warnings for missing symbols or missing OpenAI credentials

## Wave Roadmap

### Wave 1: Prove the Concept

May 12, 2026

- Project overview and README.
- SoSoValue price, turnover, sector, and kline data for at least 5 tokens.
- OpenAI-compatible AI Composer endpoint.
- Static/live index display with weight bars.
- 30-day BTC comparison backtest.
- Demo-ready Next.js UI using the supplied hero animation and styling.

### Wave 2: Working Product

May 18-29, 2026

- Full index designer with theme input, token picker, and weight sliders.
- Re-run backtests after manual edits.
- Public index gallery.
- SoDEX testnet order simulation.
- FastAPI or Next API backend deployment.
- Public demo link and indexed creator profiles.

### Wave 3: Production Ready

June 4-15, 2026

- SSI Protocol mainnet index deployment.
- SoDEX copy-trade subscriptions.
- Scheduled on-chain rebalance jobs.
- Creator management fee collection.
- AI rebalance suggestions from live market and flow changes.
- Final demo, docs, and security notes.

## Why It Matters

Building a crypto index fund normally requires quants, trading infrastructure, custodial mechanics, and a distribution layer. IndexForge compresses that into one creator workflow: pick a theme, let market data and AI shape the basket, backtest it, then publish it as a followable on-chain strategy. That is the one-person finance business angle for the wave hack.

## References

- SoSoValue API documentation: https://sosovalue-1.gitbook.io/sosovalue-api-doc
- SoDEX documentation: https://sodex.com/documentation
- OpenAI Responses API reference: https://developers.openai.com/api/reference/resources/responses/methods/create
