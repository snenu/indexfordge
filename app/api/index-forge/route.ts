import { NextResponse } from "next/server";
import {
  DEFAULT_THEME,
  DEFAULT_TOKENS,
  type BacktestPoint,
  type HistoryPoint,
  type IndexForgeResponse,
  type TokenAnalysis,
  type WeightSuggestion,
  buildTicker,
  uniqueSymbols,
} from "@/lib/index-forge";

export const dynamic = "force-dynamic";

const SOSO_BASE_URL =
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";

const SOURCES = [
  {
    name: "SoSoValue OpenAPI",
    url: "https://sosovalue-1.gitbook.io/sosovalue-api-doc",
  },
  {
    name: "SoDEX documentation",
    url: "https://sodex.com/documentation",
  },
  {
    name: "OpenAI Responses API",
    url: "https://developers.openai.com/api/reference/resources/responses/methods/create",
  },
];

type SosoEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

type Currency = {
  currency_id: string;
  symbol: string;
  name: string;
};

type CurrencyInfo = {
  currency_id: string;
  symbol: string;
  name: string;
  introduction?: string | null;
  sector?: Array<{ id?: string; name?: string }>;
};

type MarketSnapshot = {
  price?: number | string;
  change_pct_24h?: number | string;
  turnover_24h?: number | string;
  turnover_rate?: number | string;
  marketcap?: number | string;
  marketcap_rank?: number | string | null;
};

type Kline = {
  timestamp: number | string;
  close: number | string;
  volume: number | string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  model?: string;
  error?: { message?: string };
};

type ComposerPayload = {
  summary?: string;
  weights?: Array<{
    symbol?: string;
    weight?: number;
    rationale?: string;
    reason?: string;
  }>;
};

class RouteError extends Error {
  constructor(
    message: string,
    public status = 500
  ) {
    super(message);
  }
}

let currencyCache: { loadedAt: number; data: Currency[] } | null = null;
const responseCache = new Map<string, { loadedAt: number; data: unknown }>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const theme = url.searchParams.get("theme") ?? DEFAULT_THEME;
  const tokens = url.searchParams.get("tokens")?.split(",") ?? DEFAULT_TOKENS;

  return handleRequest({ theme, tokens });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return handleRequest({
    theme: typeof body.theme === "string" ? body.theme : DEFAULT_THEME,
    tokens: Array.isArray(body.tokens) ? body.tokens : DEFAULT_TOKENS,
  });
}

async function handleRequest(input: { theme: string; tokens: string[] }) {
  try {
    const theme = cleanTheme(input.theme);
    const requestedSymbols = uniqueSymbols(input.tokens).slice(0, 8);

    if (requestedSymbols.length < 3) {
      throw new RouteError("Pick at least 3 token symbols for an index.", 400);
    }

    const currencies = await getCurrencies();
    const bySymbol = new Map(
      currencies.map((currency) => [currency.symbol.toUpperCase(), currency])
    );
    const unresolved = requestedSymbols.filter((symbol) => !bySymbol.has(symbol));
    const resolved = requestedSymbols
      .map((symbol) => bySymbol.get(symbol))
      .filter((currency): currency is Currency => Boolean(currency));

    if (resolved.length < 3) {
      throw new RouteError(
        `SoSoValue resolved only ${resolved.length} token(s). Try symbols from the listed universe.`,
        400
      );
    }

    const warnings = unresolved.map(
      (symbol) => `${symbol} was not found in the SoSoValue currency list.`
    );
    const tokens: TokenAnalysis[] = [];

    for (const currency of resolved) {
      try {
        tokens.push(await getTokenAnalysis(currency));
      } catch (error) {
        warnings.push(
          `${currency.symbol.toUpperCase()} could not be loaded: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      await sleep(160);
    }

    if (tokens.length < 3) {
      throw new RouteError("Not enough SoSoValue token data returned to compose an index.", 502);
    }

    const btcCurrency = bySymbol.get("BTC");
    let benchmark = tokens.find((token) => token.symbol === "BTC");

    if (!benchmark && btcCurrency) {
      try {
        await sleep(250);
        benchmark = buildBenchmarkToken(btcCurrency, await getKlines(btcCurrency.currency_id));
      } catch (error) {
        warnings.push(
          `BTC benchmark could not be loaded: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
    }

    benchmark ??= tokens[0];
    await enrichWithSnapshots(tokens);

    const fallbackComposition = composeFromMarketData(theme, tokens);
    const ai = await composeWithOpenAI(theme, tokens, fallbackComposition);
    const composition = ai.composition;
    const backtest = buildBacktest(tokens, composition, benchmark.history);
    const ticker = buildTicker(theme);
    const indexName = `${titleCase(theme)} Index`;

    const response: IndexForgeResponse = {
      theme,
      indexName,
      ticker,
      updatedAt: new Date().toISOString(),
      tokens,
      composition,
      backtest,
      model: ai.model,
      ssiDraft: {
        name: indexName,
        ticker,
        rebalance: "Weekly rebalance draft",
        chain: "ValueChain / SSI Protocol",
        sodexMode: "SoDEX copy-trade payload preview",
        status: process.env.SSI_PROTOCOL_KEY
          ? "Ready for SSI submit route"
          : "Awaiting SSI credentials",
      },
      unresolved,
      warnings: [...warnings, ...ai.warnings],
      sources: SOURCES,
    };

    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof RouteError ? error.status : 500;
    const message = error instanceof Error ? error.message : "IndexForge failed to compose.";

    return NextResponse.json({ message }, { status });
  }
}

async function getCurrencies() {
  if (currencyCache && Date.now() - currencyCache.loadedAt < 5 * 60 * 1000) {
    return currencyCache.data;
  }

  const data = await sosoFetch<Currency[]>("/currencies");
  currencyCache = { loadedAt: Date.now(), data };
  return data;
}

async function getTokenAnalysis(currency: Currency): Promise<TokenAnalysis> {
  return buildBenchmarkToken(currency, await getKlines(currency.currency_id));
}

function buildBenchmarkToken(currency: Currency, klines: Kline[]): TokenAnalysis {
  const history = normalizeHistory(klines).slice(-30);
  const firstClose = history[0]?.close ?? 0;
  const lastClose = history.at(-1)?.close ?? firstClose;
  const previousClose = history.at(-2)?.close ?? firstClose;
  const latestFlow = history.at(-1)?.dollarVolume ?? 0;
  const dollarVolumes = history.map((point) => point.dollarVolume);
  const recentFlow = average(dollarVolumes.slice(-7));
  const previousFlow = average(dollarVolumes.slice(-14, -7));
  const dailyReturns = history
    .slice(1)
    .map((point, index) => point.close / history[index].close - 1)
    .filter(Number.isFinite);

  return {
    currencyId: currency.currency_id,
    symbol: currency.symbol.toUpperCase(),
    name: currency.name,
    sectors: [],
    introduction: "",
    metrics: {
      price: lastClose,
      change24hPct: previousClose > 0 ? (lastClose / previousClose - 1) * 100 : 0,
      return30dPct: firstClose > 0 ? (lastClose / firstClose - 1) * 100 : 0,
      flow30dUsd: dollarVolumes.reduce((sum, value) => sum + value, 0),
      flowTrendPct:
        previousFlow > 0 ? ((recentFlow - previousFlow) / previousFlow) * 100 : 0,
      turnover24hUsd: latestFlow,
      turnoverRate: 0,
      marketcapUsd: 0,
      marketcapRank: null,
      volatility30dPct: standardDeviation(dailyReturns) * Math.sqrt(30) * 100,
    },
    history,
  };
}

async function getKlines(currencyId: string) {
  return sosoFetch<Kline[]>(`/currencies/${currencyId}/klines?interval=1d&limit=31`);
}

async function enrichWithSnapshots(tokens: TokenAnalysis[]) {
  for (const token of tokens) {
    try {
      await sleep(120);
      const [snapshot, info] = await Promise.all([
        sosoFetch<MarketSnapshot>(`/currencies/${token.currencyId}/market-snapshot`),
        sosoFetch<CurrencyInfo>(`/currencies/${token.currencyId}`).catch(() => null),
      ]);

      token.name = info?.name || token.name;
      token.sectors =
        info?.sector
          ?.map((sector) => sector.name)
          .filter((sector): sector is string => Boolean(sector)) ?? token.sectors;
      token.introduction = stripHtml(info?.introduction ?? token.introduction);
      token.metrics.price = toNumber(snapshot.price, token.metrics.price);
      token.metrics.change24hPct =
        snapshot.change_pct_24h === undefined
          ? token.metrics.change24hPct
          : toNumber(snapshot.change_pct_24h) * 100;
      token.metrics.turnover24hUsd = toNumber(
        snapshot.turnover_24h,
        token.metrics.turnover24hUsd
      );
      token.metrics.turnoverRate = toNumber(snapshot.turnover_rate, token.metrics.turnoverRate);
      token.metrics.marketcapUsd = toNumber(snapshot.marketcap, token.metrics.marketcapUsd);
      token.metrics.marketcapRank = normalizeRank(snapshot.marketcap_rank);
    } catch {
      return;
    }
  }
}

async function sosoFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;

  if (!apiKey) {
    throw new RouteError("SOSOVALUE_API_KEY is not configured.", 500);
  }

  const cached = responseCache.get(path);
  const ttl = cacheTtl(path);

  if (cached && Date.now() - cached.loadedAt < ttl) {
    return cached.data as T;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${SOSO_BASE_URL}${path}`, {
      headers: {
        "x-soso-api-key": apiKey,
      },
      next: { revalidate: 30 },
    });
    const payload = (await response.json().catch(() => null)) as SosoEnvelope<T> | null;
    const rateLimited = response.status === 429 || payload?.code === 402901;

    if (rateLimited && attempt < 2) {
      await sleep(1200 * (attempt + 1));
      continue;
    }

    if (!response.ok || !payload || payload.code !== 0) {
      throw new Error(payload?.message ?? `SoSoValue request failed with ${response.status}`);
    }

    responseCache.set(path, { loadedAt: Date.now(), data: payload.data });
    return payload.data;
  }

  throw new Error("SoSoValue request failed after retry.");
}

async function composeWithOpenAI(
  theme: string,
  tokens: TokenAnalysis[],
  fallback: WeightSuggestion[]
): Promise<{
  composition: WeightSuggestion[];
  model: IndexForgeResponse["model"];
  warnings: string[];
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  if (!apiKey) {
    return {
      composition: fallback,
      model: {
        provider: "IndexForge Quant",
        name: "SoSoValue signal composer",
        usedOpenAI: false,
        note: "Add OPENAI_API_KEY to switch this route to OpenAI.",
      },
      warnings: ["OpenAI key is not configured; using the SoSoValue signal composer."],
    };
  }

  const prompt = {
    theme,
    instruction:
      "Return JSON only. Suggest index weights that sum to 100 using the live SoSoValue token data. Favor theme fit, positive 30d momentum, improving flow trend, and enough liquidity. Give one concise rationale per token.",
    outputShape: {
      weights: [
        {
          symbol: "TOKEN",
          weight: 20,
          rationale: "One sentence grounded in the provided data.",
        },
      ],
    },
    tokens: tokens.map((token) => ({
      symbol: token.symbol,
      name: token.name,
      sectors: token.sectors,
      price: token.metrics.price,
      change24hPct: token.metrics.change24hPct,
      return30dPct: token.metrics.return30dPct,
      flow30dUsd: token.metrics.flow30dUsd,
      flowTrendPct: token.metrics.flowTrendPct,
      turnover24hUsd: token.metrics.turnover24hUsd,
      marketcapUsd: token.metrics.marketcapUsd,
      marketcapRank: token.metrics.marketcapRank,
      volatility30dPct: token.metrics.volatility30dPct,
      introduction: token.introduction.slice(0, 360),
    })),
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        max_output_tokens: 1200,
        temperature: 0.2,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(prompt),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "indexforge_weights",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                weights: {
                  type: "array",
                  minItems: tokens.length,
                  maxItems: tokens.length,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      symbol: {
                        type: "string",
                        enum: tokens.map((token) => token.symbol),
                      },
                      weight: {
                        type: "number",
                        minimum: 1,
                        maximum: 100,
                      },
                      rationale: {
                        type: "string",
                        minLength: 12,
                        maxLength: 180,
                      },
                    },
                    required: ["symbol", "weight", "rationale"],
                  },
                },
              },
              required: ["weights"],
            },
          },
        },
      }),
    });
    const data = (await response.json()) as OpenAIResponse;

    if (!response.ok) {
      throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}`);
    }

    const text = extractOpenAIText(data);
    const parsed = extractJson(text);
    const composition = coerceAiWeights(parsed, tokens);

    if (!composition) {
      throw new Error("OpenAI response did not include valid weights.");
    }

    return {
      composition,
      model: {
        provider: "OpenAI",
        name: data.model ?? modelName,
        usedOpenAI: true,
      },
      warnings: [],
    };
  } catch (error) {
    return {
      composition: fallback,
      model: {
        provider: "IndexForge Quant",
        name: "SoSoValue signal composer",
        usedOpenAI: false,
        note: "OpenAI call failed, so the route used the local market-signal composer.",
      },
      warnings: [
        `OpenAI composer unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ],
    };
  }
}

function composeFromMarketData(theme: string, tokens: TokenAnalysis[]) {
  const flowValues = tokens.map((token) => token.metrics.flow30dUsd);
  const liquidityValues = tokens.map((token) => token.metrics.turnover24hUsd);
  const scored = tokens.map((token, index) => {
    const themeScore = scoreThemeFit(theme, token);
    const momentumScore = clamp((token.metrics.return30dPct + 35) / 70, 0.08, 1);
    const flowScore = clamp((token.metrics.flowTrendPct + 60) / 120, 0.08, 1);
    const flowScale = normalizeLog(flowValues[index], flowValues);
    const liquidityScore = normalizeLog(liquidityValues[index], liquidityValues);
    const rankScore = token.metrics.marketcapRank
      ? clamp(1 - (token.metrics.marketcapRank - 1) / 180, 0.08, 1)
      : 0.45;
    const volatilityPenalty = clamp(1 - token.metrics.volatility30dPct / 130, 0.55, 1);
    const score =
      (themeScore * 0.3 +
        momentumScore * 0.22 +
        flowScore * 0.18 +
        flowScale * 0.12 +
        liquidityScore * 0.12 +
        rankScore * 0.06) *
      volatilityPenalty;

    return { token, score: Math.max(score, 0.08) };
  });

  const weights = roundWeights(scored.map(({ score }) => score));

  return scored.map(({ token }, index) => ({
    symbol: token.symbol,
    weight: weights[index],
    rationale: buildRationale(token),
  }));
}

function buildBacktest(
  tokens: TokenAnalysis[],
  composition: WeightSuggestion[],
  benchmarkHistory: HistoryPoint[]
) {
  const weightBySymbol = new Map(
    composition.map((item) => [item.symbol.toUpperCase(), item.weight / 100])
  );
  const histories = tokens.map((token) => ({
    symbol: token.symbol,
    history: token.history.slice(-30),
  }));
  const minLength = Math.min(
    benchmarkHistory.length,
    ...histories.map((item) => item.history.length)
  );
  const benchmark = benchmarkHistory.slice(-minLength);
  const trimmed = histories.map((item) => ({
    symbol: item.symbol,
    history: item.history.slice(-minLength),
  }));
  const points: BacktestPoint[] = [];

  for (let index = 0; index < minLength; index += 1) {
    const value = trimmed.reduce((sum, item) => {
      const first = item.history[0]?.close ?? 0;
      const current = item.history[index]?.close ?? first;
      const normalized = first > 0 ? (current / first) * 100 : 100;

      return sum + normalized * (weightBySymbol.get(item.symbol) ?? 0);
    }, 0);
    const firstBenchmark = benchmark[0]?.close ?? 0;
    const currentBenchmark = benchmark[index]?.close ?? firstBenchmark;

    points.push({
      date: benchmark[index]?.date ?? "",
      index: round(value),
      btc: firstBenchmark > 0 ? round((currentBenchmark / firstBenchmark) * 100) : 100,
    });
  }

  return {
    points,
    indexReturnPct: points.length ? round(points.at(-1)!.index - 100) : 0,
    btcReturnPct: points.length ? round(points.at(-1)!.btc - 100) : 0,
    maxDrawdownPct: round(calculateMaxDrawdown(points.map((point) => point.index))),
  };
}

function coerceAiWeights(parsed: ComposerPayload, tokens: TokenAnalysis[]) {
  if (!Array.isArray(parsed.weights)) return null;

  const tokenSymbols = new Set(tokens.map((token) => token.symbol));
  const bySymbol = new Map<string, WeightSuggestion>();

  parsed.weights.forEach((item) => {
    const symbol = item.symbol?.toUpperCase();
    const weight = toNumber(item.weight);

    if (symbol && tokenSymbols.has(symbol) && weight > 0) {
      bySymbol.set(symbol, {
        symbol,
        weight,
        rationale: item.rationale ?? item.reason ?? "Weighted by OpenAI from live SoSoValue inputs.",
      });
    }
  });

  if (bySymbol.size !== tokenSymbols.size) return null;

  const normalizedWeights = roundWeights(
    tokens.map((token) => bySymbol.get(token.symbol)?.weight ?? 0)
  );

  return tokens.map((token, index) => ({
    symbol: token.symbol,
    weight: normalizedWeights[index],
    rationale: bySymbol.get(token.symbol)?.rationale ?? "",
  }));
}

function extractOpenAIText(data: OpenAIResponse) {
  if (data.output_text) return data.output_text;

  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .find((part) => part.type === "output_text")?.text ?? ""
  );
}

function extractJson(text: string): ComposerPayload {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first === -1 || last === -1 || last <= first) {
    throw new Error("No JSON object found.");
  }

  return JSON.parse(text.slice(first, last + 1)) as ComposerPayload;
}

function normalizeHistory(klines: Kline[]): HistoryPoint[] {
  return klines
    .map((point) => {
      const close = toNumber(point.close);
      const volume = toNumber(point.volume);
      const timestamp = toNumber(point.timestamp);

      return {
        date: new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        close,
        volume,
        dollarVolume: close * volume,
      };
    })
    .filter((point) => point.timestamp > 0 && point.close > 0)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function buildRationale(token: TokenAnalysis) {
  const flowDirection =
    token.metrics.flowTrendPct > 8
      ? "rising flow"
      : token.metrics.flowTrendPct < -8
        ? "cooling flow"
        : "steady flow";
  const sector = token.sectors[0] ? `${token.sectors[0]} fit` : "theme fit";

  return `${sector}, ${formatSigned(token.metrics.return30dPct)} 30d return, and ${flowDirection} from SoSoValue activity.`;
}

function scoreThemeFit(theme: string, token: TokenAnalysis) {
  const haystack = `${token.symbol} ${token.name} ${token.sectors.join(" ")} ${
    token.introduction
  }`.toLowerCase();
  const words = theme
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !["index", "token", "tokens"].includes(word));
  const matches = words.filter((word) => haystack.includes(word)).length;
  const sectorMatch = token.sectors.some((sector) =>
    words.some((word) => sector.toLowerCase().includes(word))
  );

  return clamp(0.5 + matches * 0.18 + (sectorMatch ? 0.2 : 0), 0.35, 1);
}

function roundWeights(scores: number[]) {
  const total = scores.reduce((sum, score) => sum + Math.max(score, 0), 0) || 1;
  const raw = scores.map((score) => (Math.max(score, 0) / total) * 100);
  const rounded = raw.map(Math.floor);
  let diff = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let index = 0; index < order.length && diff > 0; index += 1) {
    rounded[order[index].index] += 1;
    diff -= 1;
  }

  return rounded;
}

function normalizeLog(value: number, values: number[]) {
  const logs = values.map((item) => Math.log10(Math.max(item, 1)));
  const min = Math.min(...logs);
  const max = Math.max(...logs);

  if (max === min) return 0.5;

  return clamp((Math.log10(Math.max(value, 1)) - min) / (max - min), 0.08, 1);
}

function calculateMaxDrawdown(values: number[]) {
  let peak = values[0] ?? 100;
  let drawdown = 0;

  values.forEach((value) => {
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, peak > 0 ? (value / peak - 1) * 100 : 0);
  });

  return drawdown;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));

  return Math.sqrt(variance);
}

function average(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : 0;
}

function cacheTtl(path: string) {
  if (path === "/currencies") return 5 * 60 * 1000;
  if (path.includes("/market-snapshot")) return 30 * 1000;
  if (path.includes("/klines")) return 60 * 1000;
  return 5 * 60 * 1000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRank(rank: MarketSnapshot["marketcap_rank"]) {
  const value = toNumber(rank);
  return value > 0 ? Math.round(value) : null;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTheme(theme: string) {
  return theme.trim().replace(/\s+/g, " ").slice(0, 80) || DEFAULT_THEME;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value)}%`;
}
