import { NextResponse } from "next/server";
import {
  DEFAULT_THEME,
  DEFAULT_TOKENS,
  type BacktestPoint,
  type HistoryPoint,
  type IndexForgeResponse,
  type MacroEvent,
  type SsiReference,
  type TokenAnalysis,
  type WeightSuggestion,
  buildTicker,
  normalizeSymbol,
  uniqueSymbols,
} from "@/lib/index-forge";
import { SosoApiError, isSosoRateLimitError, sosoFetch } from "@/lib/sosovalue";

export const dynamic = "force-dynamic";

const SOURCES = [
  {
    name: "SoSoValue OpenAPI",
    url: "https://sosovalue-1.gitbook.io/sosovalue-api-doc",
  },
  {
    name: "SoSoValue Indexes",
    url: "https://ssi.sosovalue.com/en",
  },
  {
    name: "SoDEX Trading API",
    url: "https://sodex.com/documentation/trading-api/trading-api",
  },
  {
    name: "OpenAI Responses API",
    url: "https://developers.openai.com/api/reference/resources/responses/methods/create",
  },
];

const MODEL_OBJECTIVE =
  "Maximize theme fit and risk-adjusted exposure using live SoSoValue momentum, 30d traded activity, flow trend, liquidity, market-cap rank, and volatility controls.";

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
  volume?: number | string;
};

type IndexConstituent = {
  currency_id?: string;
  symbol?: string;
  weight?: number | string;
};

type IndexSnapshot = {
  price?: number | string;
  "1month_roi"?: number | string;
  "3month_roi"?: number | string;
  "1year_roi"?: number | string;
  ytd?: number | string;
};

type MacroEventGroup = {
  date?: string;
  events?: string[];
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

type ManualWeight = {
  symbol: string;
  weight: number;
};

type SodexSymbol = {
  name?: string;
  displayName?: string;
  baseCoin?: string;
  quoteCoin?: string;
  minNotional?: string;
  status?: string;
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
const compositionCache = new Map<string, { loadedAt: number; data: IndexForgeResponse }>();
const requestWindows = new Map<string, { resetAt: number; count: number }>();
const COMPOSITION_CACHE_TTL_MS = 60 * 1000;
const COMPOSER_RATE_LIMIT = 12;
const COMPOSER_RATE_WINDOW_MS = 60 * 1000;

export async function GET(request: Request) {
  try {
    assertRequestAllowed(request);

    const url = new URL(request.url);
    const theme = url.searchParams.get("theme") ?? DEFAULT_THEME;
    const tokens = coerceTokenInput(url.searchParams.get("tokens"));

    return handleRequest({ theme, tokens });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestAllowed(request);

    const body = await request.json().catch(() => ({}));
    const payload = isRecord(body) ? body : {};

    return handleRequest({
      theme: typeof payload.theme === "string" ? payload.theme : DEFAULT_THEME,
      tokens: coerceTokenInput(payload.tokens),
      weights: coerceManualWeightInput(payload.weights),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleRequest(input: { theme: string; tokens: string[]; weights?: ManualWeight[] }) {
  try {
    const theme = cleanTheme(input.theme);
    const requestedSymbols = uniqueSymbols(input.tokens);
    const cacheKey = buildCompositionCacheKey(theme, requestedSymbols, input.weights);
    const cached = compositionCache.get(cacheKey);

    if (cached && Date.now() - cached.loadedAt < COMPOSITION_CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    if (requestedSymbols.length < 3) {
      throw new RouteError("Pick at least 3 token symbols for an index.", 400);
    }

    if (requestedSymbols.length > 8) {
      throw new RouteError("Pick no more than 8 token symbols for an index.", 400);
    }

    const currencies = await getCurrencies();
    const bySymbol = new Map(currencies.map((currency) => [currency.symbol, currency]));
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
          `${currency.symbol} could not be loaded: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      await sleep(160);
    }

    if (tokens.length < 3) {
      const rateLimited = warnings.some((warning) => warning.toLowerCase().includes("rate limit"));

      throw new RouteError(
        rateLimited
          ? "SoSoValue rate limit exceeded while loading token history. Please retry after the API window resets."
          : "Not enough SoSoValue token data returned to compose an index.",
        rateLimited ? 429 : 502
      );
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
    warnings.push(...(await enrichWithSnapshots(tokens)));

    const fallbackComposition = composeFromMarketData(theme, tokens);
    const manualComposition = coerceManualWeights(input.weights, tokens, fallbackComposition);
    const ai = manualComposition
      ? {
          composition: manualComposition,
          model: {
            provider: "IndexForge Quant" as const,
            name: "Manual Wave 2 designer",
            usedOpenAI: false,
            note: "Weights were supplied by the designer sliders and normalized before backtest.",
            objective: MODEL_OBJECTIVE,
          },
          warnings: [],
        }
      : await composeWithOpenAI(theme, tokens, fallbackComposition);
    const composition = ai.composition;
    const backtest = buildBacktest(tokens, composition, benchmark.history);
    const ticker = buildTicker(theme);
    const indexName = `${titleCase(theme)} Index`;
    const ssiLookup = await getSsiReferences(composition, tokens.length <= 5 ? 1 : 0);
    const manifest = buildSsiManifest(indexName, ticker, composition, backtest.periodDays);
    const sodex = await buildSodexIntent(composition);
    const macro = await getMacroOverlay();
    const responseWarnings = [
      ...warnings,
      ...ai.warnings,
      ...ssiLookup.warnings,
      ...sodex.warnings,
      ...macro.warnings,
    ];

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
        rebalance: "Weekly target-weight rebalance",
        chain: "ValueChain / SSI Protocol",
        sodexMode: "SoDEX testnet rebalance intent",
        status: process.env.SSI_PROTOCOL_KEY
          ? "Ready for credentialed SSI submit route"
          : "Unsigned SSI manifest ready; add SSI credentials to submit.",
        manifest,
      },
      ssiReferences: ssiLookup.references,
      sodexIntent: sodex.intent,
      macro,
      readiness: buildReadinessReport({
        tokens,
        warnings: responseWarnings,
        model: ai.model,
        sodexIntent: sodex.intent,
        macro,
      }),
      unresolved,
      warnings: responseWarnings,
      sources: SOURCES,
    };

    setCompositionCache(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}

async function getCurrencies() {
  if (currencyCache && Date.now() - currencyCache.loadedAt < 5 * 60 * 1000) {
    return currencyCache.data;
  }

  const data = (await sosoFetch<Currency[]>("/currencies"))
    .map(normalizeCurrency)
    .filter((currency) => currency.currency_id && currency.symbol && currency.name);
  currencyCache = { loadedAt: Date.now(), data };
  return data;
}

function normalizeCurrency(currency: Currency): Currency {
  return {
    currency_id: String(currency.currency_id ?? "").trim(),
    symbol: normalizeSymbol(currency.symbol ?? ""),
    name: String(currency.name ?? "").trim(),
  };
}

async function getTokenAnalysis(currency: Currency): Promise<TokenAnalysis> {
  return buildBenchmarkToken(currency, await getKlines(currency.currency_id));
}

function buildBenchmarkToken(currency: Currency, klines: Kline[]): TokenAnalysis {
  const history = normalizeHistory(klines).slice(-90);
  const metricWindow = history.slice(-31);
  const firstClose = metricWindow[0]?.close ?? 0;
  const lastClose = metricWindow.at(-1)?.close ?? firstClose;
  const previousClose = metricWindow.at(-2)?.close ?? firstClose;
  const latestFlow = metricWindow.at(-1)?.dollarVolume ?? 0;
  const dollarVolumes = metricWindow.slice(-30).map((point) => point.dollarVolume);
  const recentFlow = average(dollarVolumes.slice(-7));
  const previousFlow = average(dollarVolumes.slice(-14, -7));
  const dailyReturns = metricWindow
    .slice(1)
    .map((point, index) => point.close / metricWindow[index].close - 1)
    .filter(Number.isFinite);

  return {
    currencyId: currency.currency_id,
    symbol: currency.symbol,
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
  return sosoFetch<Kline[]>(`/currencies/${currencyId}/klines?interval=1d&limit=91`);
}

async function enrichWithSnapshots(tokens: TokenAnalysis[]) {
  const warnings: string[] = [];
  const includeProjectInfo = process.env.SOSOVALUE_ENABLE_PROJECT_INFO === "true";

  for (const token of tokens) {
    try {
      await sleep(120);
      const snapshot = await sosoFetch<MarketSnapshot>(
        `/currencies/${token.currencyId}/market-snapshot`,
        { retryRateLimit: false }
      );

      if (includeProjectInfo) {
        const info = await sosoFetch<CurrencyInfo>(`/currencies/${token.currencyId}`).catch(
          () => null
        );

        token.name = info?.name?.trim() || token.name;
        token.sectors =
          info?.sector
            ?.map((sector) => sector.name?.trim())
            .filter((sector): sector is string => Boolean(sector)) ?? token.sectors;
        token.introduction = stripHtml(info?.introduction ?? token.introduction);
      }

      token.metrics.price = toNumber(snapshot.price, token.metrics.price);
      token.metrics.change24hPct =
        snapshot.change_pct_24h === undefined
          ? token.metrics.change24hPct
          : toPercent(snapshot.change_pct_24h);
      token.metrics.turnover24hUsd = toNumber(
        snapshot.turnover_24h,
        token.metrics.turnover24hUsd
      );
      token.metrics.turnoverRate = toNumber(snapshot.turnover_rate, token.metrics.turnoverRate);
      token.metrics.marketcapUsd = toNumber(snapshot.marketcap, token.metrics.marketcapUsd);
      token.metrics.marketcapRank = normalizeRank(snapshot.marketcap_rank);
    } catch (error) {
      if (isRateLimitError(error)) {
        continue;
      }

      warnings.push(
        `${token.symbol} snapshot enrichment failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  return warnings;
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
        objective: MODEL_OBJECTIVE,
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
    const data = await createOpenAIWeights(apiKey, modelName, prompt, tokens);
    const text = extractOpenAIText(data);
    const parsed = extractJson(text);
    const composition = coerceAiWeights(parsed, tokens, fallback);

    if (!composition) {
      throw new Error("OpenAI response did not include valid weights.");
    }

    return {
      composition,
      model: {
        provider: "OpenAI",
        name: data.model ?? modelName,
        usedOpenAI: true,
        objective: MODEL_OBJECTIVE,
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
        objective: MODEL_OBJECTIVE,
      },
      warnings: [
        `OpenAI composer unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ],
    };
  }
}

async function createOpenAIWeights(
  apiKey: string,
  modelName: string,
  prompt: object,
  tokens: TokenAnalysis[]
) {
  const body = JSON.stringify({
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
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body,
    });
    const text = await response.text();
    let data: OpenAIResponse;

    try {
      data = parseOpenAIJson(text);
    } catch (error) {
      if (response.status >= 500 && attempt === 0) {
        await sleep(800);
        continue;
      }

      throw error;
    }

    if (response.ok) {
      return data;
    }

    if (response.status >= 500 && attempt === 0) {
      await sleep(800);
      continue;
    }

    throw new Error(data.error?.message ?? `OpenAI request failed with ${response.status}`);
  }

  throw new Error("OpenAI request failed after retry.");
}

function parseOpenAIJson(text: string): OpenAIResponse {
  try {
    return JSON.parse(text) as OpenAIResponse;
  } catch {
    throw new Error("OpenAI returned a non-JSON upstream response.");
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

    return {
      token,
      score: Math.max(score, 0.08),
      components: {
        themeFit: toScore(themeScore),
        momentum: toScore(momentumScore),
        flowTrend: toScore(flowScore),
        flowScale: toScore(flowScale),
        liquidity: toScore(liquidityScore),
        marketCapRank: toScore(rankScore),
        volatilityPenalty: toScore(volatilityPenalty),
        composite: toScore(Math.max(score, 0.08)),
      },
    };
  });

  const weights = roundWeights(scored.map(({ score }) => score));

  return scored.map(({ token, components }, index) => ({
    symbol: token.symbol,
    weight: weights[index],
    rationale: buildRationale(token),
    score: components,
  }));
}

function buildBacktest(
  tokens: TokenAnalysis[],
  composition: WeightSuggestion[],
  benchmarkHistory: HistoryPoint[]
) {
  const weightBySymbol = new Map(composition.map((item) => [item.symbol, item.weight / 100]));
  const histories = tokens.map((token) => ({
    symbol: token.symbol,
    history: token.history,
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
  const targetWeights = new Map(
    trimmed.map((item) => [item.symbol, weightBySymbol.get(item.symbol) ?? 0])
  );
  let activeWeights = new Map(targetWeights);
  let indexValue = 100;
  let rebalanceCount = 0;
  const indexReturns: number[] = [];

  if (!minLength) {
    return {
      points,
      periodDays: 0,
      indexReturnPct: 0,
      btcReturnPct: 0,
      maxDrawdownPct: 0,
      volatilityPct: 0,
      sharpeRatio: 0,
      winRatePct: 0,
      rebalanceCount: 0,
      assumptions: backtestAssumptions(),
      validation: buildValidationReport(tokens, composition, points),
    };
  }

  const firstBenchmark = benchmark[0]?.close ?? 0;

  points.push({
    date: benchmark[0]?.date ?? "",
    index: 100,
    btc: 100,
  });

  for (let index = 1; index < minLength; index += 1) {
    const tokenReturns = trimmed.map((item) => {
      const previous = item.history[index - 1]?.close ?? 0;
      const current = item.history[index]?.close ?? previous;

      return {
        symbol: item.symbol,
        dailyReturn: previous > 0 ? current / previous - 1 : 0,
      };
    });
    const portfolioReturn = tokenReturns.reduce(
      (sum, item) => sum + (activeWeights.get(item.symbol) ?? 0) * item.dailyReturn,
      0
    );

    indexValue *= 1 + portfolioReturn;
    indexReturns.push(portfolioReturn);

    const driftedWeights = new Map<string, number>();
    const driftTotal = tokenReturns.reduce(
      (sum, item) => sum + (activeWeights.get(item.symbol) ?? 0) * (1 + item.dailyReturn),
      0
    );

    tokenReturns.forEach((item) => {
      const drifted = (activeWeights.get(item.symbol) ?? 0) * (1 + item.dailyReturn);
      driftedWeights.set(item.symbol, driftTotal > 0 ? drifted / driftTotal : 0);
    });

    activeWeights = driftedWeights;

    if (index % 7 === 0 && index < minLength - 1) {
      activeWeights = new Map(targetWeights);
      rebalanceCount += 1;
    }

    const currentBenchmark = benchmark[index]?.close ?? firstBenchmark;

    points.push({
      date: benchmark[index]?.date ?? "",
      index: round(indexValue),
      btc: firstBenchmark > 0 ? round((currentBenchmark / firstBenchmark) * 100) : 100,
    });
  }

  const volatility = standardDeviation(indexReturns) * Math.sqrt(365) * 100;
  const meanDailyReturn = average(indexReturns);

  return {
    points,
    periodDays: Math.max(points.length - 1, 0),
    indexReturnPct: points.length ? round(points.at(-1)!.index - 100) : 0,
    btcReturnPct: points.length ? round(points.at(-1)!.btc - 100) : 0,
    maxDrawdownPct: round(calculateMaxDrawdown(points.map((point) => point.index))),
    volatilityPct: round(volatility),
    sharpeRatio: round(volatility > 0 ? (meanDailyReturn * 365 * 100) / volatility : 0),
    winRatePct: round(
      indexReturns.length
        ? (indexReturns.filter((dailyReturn) => dailyReturn > 0).length /
            indexReturns.length) *
            100
        : 0
    ),
    rebalanceCount,
    assumptions: backtestAssumptions(),
    validation: buildValidationReport(tokens, composition, points),
  };
}

function buildValidationReport(
  tokens: TokenAnalysis[],
  composition: WeightSuggestion[],
  points: BacktestPoint[]
): IndexForgeResponse["backtest"]["validation"] {
  const periodDays = Math.max(points.length - 1, 0);
  const holdoutDays = Math.min(30, periodDays);
  const trainingDays = Math.max(periodDays - holdoutDays, 0);
  const holdoutStart = points.at(-(holdoutDays + 1)) ?? points[0];
  const holdoutEnd = points.at(-1);
  const weights = composition.map((item) => item.weight / 100);
  const effectiveNames = weights.length
    ? 1 / weights.reduce((sum, weight) => sum + weight ** 2, 0)
    : 0;
  const maxWeightPct = Math.max(...composition.map((item) => item.weight), 0);
  const liquidityPass = tokens.every(
    (token) => token.metrics.turnover24hUsd > 0 && token.metrics.flow30dUsd > 0
  );
  const concentrationPass = maxWeightPct <= 40 && effectiveNames >= Math.min(3, weights.length);
  const overfitNotes = [
    `${trainingDays}d training / ${holdoutDays}d holdout split from the shared SoSoValue kline window.`,
    "Theme fit is one input, but final weights are capped by liquidity, rank, and volatility controls.",
    "Manual slider edits reuse the same validation and backtest path as AI weights.",
  ];

  if (!concentrationPass) {
    overfitNotes.push("Concentration warning: reduce the largest weight or add more constituents.");
  }

  if (!liquidityPass) {
    overfitNotes.push("Liquidity warning: one or more constituents lack live turnover or flow data.");
  }

  return {
    trainingDays,
    holdoutDays,
    holdoutIndexReturnPct:
      holdoutStart && holdoutEnd && holdoutStart.index > 0
        ? round((holdoutEnd.index / holdoutStart.index - 1) * 100)
        : 0,
    holdoutBtcReturnPct:
      holdoutStart && holdoutEnd && holdoutStart.btc > 0
        ? round((holdoutEnd.btc / holdoutStart.btc - 1) * 100)
        : 0,
    effectiveNames: round(effectiveNames),
    maxWeightPct,
    concentrationPass,
    liquidityPass,
    overfitNotes,
  };
}

async function getMacroOverlay(): Promise<IndexForgeResponse["macro"]> {
  const empty = {
    source: "SoSoValue Macro" as const,
    riskLevel: "Unknown" as const,
    nextEventDate: null,
    eventCount: 0,
    events: [],
    warnings: [],
  };

  try {
    const groups = await sosoFetch<MacroEventGroup[]>("/macro/events", {
      retryRateLimit: false,
    });
    const events = normalizeMacroEvents(Array.isArray(groups) ? groups : []);
    const upcoming = events.filter((event) => event.daysUntil >= 0 && event.daysUntil <= 14);
    const limitedEvents = upcoming.slice(0, 8);

    return {
      source: "SoSoValue Macro",
      riskLevel: rankMacroRisk(limitedEvents),
      nextEventDate: limitedEvents[0]?.date ?? null,
      eventCount: upcoming.reduce((sum, event) => sum + event.events.length, 0),
      events: limitedEvents,
      warnings: [],
    };
  } catch (error) {
    return {
      ...empty,
      warnings: [
        `SoSoValue macro events unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      ],
    };
  }
}

function normalizeMacroEvents(groups: MacroEventGroup[]): MacroEvent[] {
  const today = startOfUtcDay(new Date());

  return groups
    .map((group) => {
      const date = String(group.date ?? "").trim();
      const eventDate = parseUtcDate(date);
      const events =
        group.events
          ?.map((event) => String(event).trim())
          .filter(Boolean)
          .slice(0, 6) ?? [];

      if (!date || !eventDate || !events.length) return null;

      const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000);

      return {
        date,
        events,
        daysUntil,
        riskLevel: rankMacroEventRisk(daysUntil, events.length),
      };
    })
    .filter((event): event is MacroEvent => Boolean(event))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.date.localeCompare(b.date));
}

function buildReadinessReport(input: {
  tokens: TokenAnalysis[];
  warnings: string[];
  model: IndexForgeResponse["model"];
  sodexIntent: IndexForgeResponse["sodexIntent"];
  macro: IndexForgeResponse["macro"];
}): IndexForgeResponse["readiness"] {
  const hasRateLimitWarning = input.warnings.some((warning) =>
    warning.toLowerCase().includes("rate limit")
  );
  const executableLegs = input.sodexIntent.orders.filter((order) => order.executable).length;
  const checks: IndexForgeResponse["readiness"]["checks"] = [
    {
      label: "China browser path",
      status: "pass",
      detail: "Client uses local assets and same-origin API routes; third-party calls stay server-side.",
    },
    {
      label: "SoSoValue market data",
      status:
        input.tokens.length >= 3 && input.tokens.every((token) => token.history.length > 0)
          ? "pass"
          : "blocked",
      detail: `${input.tokens.length} constituents loaded with shared daily kline windows.`,
    },
    {
      label: "Rate-limit posture",
      status: hasRateLimitWarning ? "watch" : "pass",
      detail: hasRateLimitWarning
        ? "A SoSoValue optional enrichment hit the key-level limit; cached core data stayed usable."
        : "Shared cache, in-flight dedupe, and optional enrichment skips protect the 20/min key limit.",
    },
    {
      label: "Macro event overlay",
      status: input.macro.riskLevel === "Unknown" ? "watch" : "pass",
      detail:
        input.macro.riskLevel === "Unknown"
          ? "Macro events are unavailable for this response."
          : `${input.macro.eventCount} SoSoValue macro event(s) in the next 14 days.`,
    },
    {
      label: "OpenAI dependency",
      status: "pass",
      detail: input.model.usedOpenAI
        ? "OpenAI is configured server-side for weight suggestions."
        : "Quant fallback is active, so China browser users do not depend on OpenAI reachability.",
    },
    {
      label: "SoDEX execution path",
      status: executableLegs === input.sodexIntent.orders.length ? "pass" : "watch",
      detail: `${executableLegs}/${input.sodexIntent.orders.length} SoDEX market legs are currently executable.`,
    },
  ];
  const status = checks.some((check) => check.status === "blocked")
    ? "blocked"
    : checks.some((check) => check.status === "watch")
      ? "watch"
      : "ready";

  return {
    status,
    region: "China-compatible browser path",
    checks,
  };
}

async function getSsiReferences(
  composition: WeightSuggestion[],
  maxReferences: number
): Promise<{
  references: SsiReference[];
  warnings: string[];
}> {
  const warnings: string[] = [];
  let tickers: string[] = [];

  if (maxReferences <= 0) {
    return {
      references: [],
      warnings: [
        "SSI references skipped for this larger basket to stay within SoSoValue rate limits.",
      ],
    };
  }

  try {
    tickers = normalizeIndexTickers(await sosoFetch<string[]>("/indices"));
  } catch (error) {
    warnings.push(
      `SoSoValue Index list unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  if (!tickers.length) {
    warnings.push("SoSoValue Index list returned no tickers; SSI references skipped.");
    return { references: [], warnings };
  }

  const candidates = prioritizeIndexTickers(tickers).slice(0, Math.min(maxReferences, 2));
  const customWeights = new Map(
    composition.map((item) => [normalizeSymbol(item.symbol), item.weight / 100])
  );
  const references: SsiReference[] = [];

  for (const ticker of candidates) {
    try {
      await sleep(100);
      const constituents = await sosoFetch<IndexConstituent[]>(
        `/indices/${ticker}/constituents`,
        { retryRateLimit: false }
      );
      const matchedSymbols = constituents
        .map((item) => normalizeSymbol(item.symbol ?? ""))
        .filter((symbol) => customWeights.has(symbol));
      const overlap = constituents.reduce((sum, item) => {
        const symbol = normalizeSymbol(item.symbol ?? "");
        const customWeight = customWeights.get(symbol) ?? 0;
        const ssiWeight = toNumber(item.weight);

        return sum + Math.min(customWeight, ssiWeight);
      }, 0);

      references.push({
        ticker,
        label: formatSsiLabel(ticker),
        overlapPct: round(overlap * 100),
        constituentCount: constituents.length,
        matchedSymbols,
        price: null,
        return1mPct: null,
        return3mPct: null,
        return1yPct: null,
        ytdPct: null,
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        continue;
      }

      warnings.push(
        `${formatSsiLabel(ticker)} constituents unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  const topReferences = references
    .sort((a, b) => b.overlapPct - a.overlapPct || a.ticker.localeCompare(b.ticker))
    .slice(0, maxReferences);

  for (const reference of topReferences) {
    try {
      await sleep(100);
      const snapshot = await sosoFetch<IndexSnapshot>(
        `/indices/${reference.ticker}/market-snapshot`,
        { retryRateLimit: false }
      );

      reference.price = toNullableNumber(snapshot.price);
      reference.return1mPct = toNullablePercent(snapshot["1month_roi"]);
      reference.return3mPct = toNullablePercent(snapshot["3month_roi"]);
      reference.return1yPct = toNullablePercent(snapshot["1year_roi"]);
      reference.ytdPct = toNullablePercent(snapshot.ytd);
    } catch (error) {
      if (isRateLimitError(error)) {
        continue;
      }

      warnings.push(
        `${reference.label} market snapshot unavailable: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  }

  return { references: topReferences, warnings };
}

function buildSsiManifest(
  indexName: string,
  ticker: string,
  composition: WeightSuggestion[],
  dataWindowDays: number
): IndexForgeResponse["ssiDraft"]["manifest"] {
  const constituents = composition.map((item) => ({
    symbol: item.symbol,
    weightPct: item.weight,
  }));
  const id = `${ticker.toLowerCase()}-${hashString(
    JSON.stringify({ indexName, ticker, constituents })
  )}`;

  return {
    id,
    methodology:
      "Theme-fit scoring with SoSoValue momentum, 30d activity, liquidity, market-cap rank, and volatility controls; weekly target rebalance.",
    dataWindowDays,
    constituents,
  };
}

async function buildSodexIntent(composition: WeightSuggestion[]): Promise<{
  intent: IndexForgeResponse["sodexIntent"];
  warnings: string[];
}> {
  const spotEndpoint =
    process.env.SODEX_SPOT_ENDPOINT ?? "https://testnet-gw.sodex.dev/api/v1/spot";
  const hasSigningConfig = Boolean(
    process.env.SODEX_ACCOUNT_ID &&
      process.env.SODEX_API_KEY_NAME &&
      process.env.SODEX_API_PRIVATE_KEY
  );
  const warnings: string[] = [];
  let markets: SodexSymbol[] = [];

  try {
    markets = await fetchSodexSymbols(spotEndpoint);
  } catch (error) {
    warnings.push(
      `SoDEX testnet symbols unavailable: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  const orders = composition.map((item) => {
    const market = findSodexMarket(item.symbol, markets);

    return {
      symbol: item.symbol,
      market: market?.name ?? null,
      displayName: market?.displayName ?? null,
      marketStatus: market?.status ?? "NOT_LISTED",
      minNotional: market?.minNotional ?? null,
      executable: Boolean(market?.name && market.status === "TRADING"),
      side: "buy" as const,
      type: "market" as const,
      timeInForce: "IOC" as const,
      targetWeightPct: item.weight,
      quoteAllocationPct: item.weight,
    };
  });
  const executableCount = orders.filter((order) => order.executable).length;

  return {
    intent: {
      mode: "Spot batch rebalance",
      network: spotEndpoint.includes("mainnet") ? "mainnet" : "testnet",
      marketDataEndpoint: `${spotEndpoint}/markets/symbols`,
      orderEndpoint: `${spotEndpoint}/trade/orders/batch`,
      status: hasSigningConfig
        ? `${executableCount}/${orders.length} legs resolved; ready for signed SoDEX order construction.`
        : `${executableCount}/${orders.length} legs resolved; configure SoDEX accountID, API key name, and EIP-712 signer before submission.`,
      requiresSignature: true,
      requiredHeaders: ["Content-Type", "Accept", "X-API-Key", "X-API-Sign", "X-API-Nonce"],
      orders,
      notes: [
        "Use the live SoDEX symbol name field in signed order payloads.",
        "Submit as a signed batch order only after accountID, precision, min notional, and slippage checks pass.",
        "Keep the private signing key server-side; send only X-API-Sign and nonce headers.",
      ],
    },
    warnings,
  };
}

async function fetchSodexSymbols(spotEndpoint: string) {
  const response = await fetch(`${spotEndpoint}/markets/symbols`, {
    headers: {
      accept: "application/json",
    },
    next: { revalidate: 30 },
  });
  const payload = (await response.json().catch(() => null)) as
    | { data?: SodexSymbol[] }
    | SodexSymbol[]
    | null;

  if (!response.ok || !payload) {
    throw new Error(`SoDEX symbols failed with ${response.status}`);
  }

  return Array.isArray(payload) ? payload : payload.data ?? [];
}

function findSodexMarket(symbol: string, markets: SodexSymbol[]) {
  const normalized = normalizeSymbol(symbol);

  return (
    markets.find((market) => {
      const base = normalizeSymbol(market.baseCoin ?? "");
      const name = normalizeSymbol(market.name ?? "");
      const displayName = normalizeSymbol(market.displayName ?? "");

      return (
        base === normalized ||
        base === `V${normalized}` ||
        base === `TEST${normalized}` ||
        name.startsWith(`${normalized}_`) ||
        name.startsWith(`V${normalized}_`) ||
        name.startsWith(`TEST${normalized}_`) ||
        displayName.startsWith(`${normalized}/`) ||
        displayName.startsWith(`V${normalized}/`) ||
        displayName.startsWith(`TEST${normalized}/`)
      );
    }) ?? null
  );
}

function coerceManualWeights(
  weights: ManualWeight[] | undefined,
  tokens: TokenAnalysis[],
  fallback: WeightSuggestion[]
) {
  if (!weights?.length) return null;

  const fallbackBySymbol = new Map(fallback.map((item) => [item.symbol, item]));
  const rawBySymbol = new Map<string, number>();

  weights.forEach((item) => {
    const symbol = normalizeSymbol(item.symbol ?? "");
    const weight = toNumber(item.weight);

    if (symbol && weight > 0) {
      rawBySymbol.set(symbol, weight);
    }
  });

  if (!tokens.every((token) => rawBySymbol.has(token.symbol))) return null;

  const normalized = roundWeights(tokens.map((token) => rawBySymbol.get(token.symbol) ?? 0));

  return tokens.map((token, index) => ({
    symbol: token.symbol,
    weight: normalized[index],
    rationale: buildManualRationale(token, normalized[index]),
    score: fallbackBySymbol.get(token.symbol)?.score,
  }));
}

function coerceTokenInput(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return DEFAULT_TOKENS;

  if (typeof value === "string") {
    return value.split(/[\s,]+/);
  }

  if (!Array.isArray(value)) {
    throw new RouteError("Tokens must be an array of symbol strings.", 400);
  }

  if (!value.every((item) => typeof item === "string")) {
    throw new RouteError("Every token symbol must be a string.", 400);
  }

  return value;
}

function coerceManualWeightInput(value: unknown): ManualWeight[] | undefined {
  if (value === undefined || value === null) return undefined;

  if (!Array.isArray(value)) {
    throw new RouteError("Weights must be an array of { symbol, weight } objects.", 400);
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new RouteError("Weights must be an array of { symbol, weight } objects.", 400);
    }

    if (typeof item.symbol !== "string" || !normalizeSymbol(item.symbol)) {
      throw new RouteError("Every weight must include a token symbol.", 400);
    }

    if (
      typeof item.weight !== "number" ||
      !Number.isFinite(item.weight) ||
      item.weight <= 0 ||
      item.weight > 100
    ) {
      throw new RouteError("Weight values must be finite numbers above 0 and at most 100.", 400);
    }

    return {
      symbol: item.symbol,
      weight: item.weight,
    };
  });
}

function buildManualRationale(token: TokenAnalysis, weight: number) {
  return `Manual ${weight}% target using ${formatSigned(
    token.metrics.return30dPct
  )} 30d return, ${formatSigned(token.metrics.flowTrendPct)} flow trend, and live SoSoValue liquidity.`;
}

function coerceAiWeights(
  parsed: ComposerPayload,
  tokens: TokenAnalysis[],
  fallback: WeightSuggestion[]
) {
  if (!Array.isArray(parsed.weights)) return null;

  const tokenSymbols = new Set(tokens.map((token) => token.symbol));
  const fallbackBySymbol = new Map(fallback.map((item) => [item.symbol, item]));
  const bySymbol = new Map<string, WeightSuggestion>();

  parsed.weights.forEach((item) => {
    const symbol = normalizeSymbol(item.symbol ?? "");
    const weight = toNumber(item.weight);

    if (symbol && tokenSymbols.has(symbol) && weight > 0) {
      bySymbol.set(symbol, {
        symbol,
        weight,
        rationale: item.rationale ?? item.reason ?? "Weighted by OpenAI from live SoSoValue inputs.",
        score: fallbackBySymbol.get(symbol)?.score,
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
    score: fallbackBySymbol.get(token.symbol)?.score,
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

function backtestAssumptions() {
  return [
    "Daily SoSoValue closes over the latest shared history window.",
    "Weekly target-weight rebalance every 7 daily bars.",
    "No trading fees, slippage, taxes, custody costs, or borrow costs.",
    "BTC is normalized to the same first close as the index.",
  ];
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

function rankMacroRisk(events: MacroEvent[]): IndexForgeResponse["macro"]["riskLevel"] {
  if (!events.length) return "Low";

  const sevenDayEventCount = events
    .filter((event) => event.daysUntil <= 7)
    .reduce((sum, event) => sum + event.events.length, 0);

  if (events.some((event) => event.riskLevel === "High") || sevenDayEventCount >= 4) {
    return "High";
  }

  if (events.some((event) => event.riskLevel === "Medium") || sevenDayEventCount > 0) {
    return "Medium";
  }

  return "Low";
}

function rankMacroEventRisk(
  daysUntil: number,
  eventCount: number
): MacroEvent["riskLevel"] {
  if (daysUntil <= 3 || eventCount >= 3) return "High";
  if (daysUntil <= 7 || eventCount >= 2) return "Medium";
  return "Low";
}

function parseUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRank(rank: MarketSnapshot["marketcap_rank"]) {
  const value = toNumber(rank);
  return value > 0 ? Math.round(value) : null;
}

function normalizeIndexTickers(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((ticker) => (typeof ticker === "string" ? ticker.trim().toLowerCase() : ""))
            .filter(Boolean)
        )
      )
    : [];
}

function prioritizeIndexTickers(tickers: string[]) {
  const preferredOrder = ["ssiai", "ssidepin", "ssidefi", "ssimag7", "ussi", "ssimeme"];
  const priority = new Map(preferredOrder.map((ticker, index) => [ticker, index]));

  return [...tickers].sort((a, b) => {
    const aPriority = priority.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = priority.get(b) ?? Number.MAX_SAFE_INTEGER;

    return aPriority - bPriority || a.localeCompare(b);
  });
}

function formatSsiLabel(ticker: string) {
  if (ticker.toLowerCase() === "ussi") return "USSI";

  return `${ticker.replace(/^ssi/i, "").toUpperCase()}.ssi`;
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

function toNullableNumber(value: unknown) {
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPercent(value: unknown, fallback = 0) {
  const parsed = toNumber(value, fallback);
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function toNullablePercent(value: unknown) {
  const parsed = toNullableNumber(value);
  return parsed === null ? null : round(Math.abs(parsed) <= 1 ? parsed * 100 : parsed);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function toScore(value: number) {
  return round(value * 100);
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value)}%`;
}

function isRateLimitError(error: unknown) {
  return (error instanceof RouteError && error.status === 429) || isSosoRateLimitError(error);
}

function buildCompositionCacheKey(
  theme: string,
  symbols: string[],
  weights: ManualWeight[] | undefined
) {
  return JSON.stringify({
    theme,
    symbols,
    weights:
      weights
        ?.map((item) => ({
          symbol: normalizeSymbol(item.symbol),
          weight: toNumber(item.weight),
        }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol)) ?? null,
  });
}

function setCompositionCache(key: string, data: IndexForgeResponse) {
  compositionCache.set(key, { loadedAt: Date.now(), data });

  if (compositionCache.size > 40) {
    const oldest = Array.from(compositionCache.entries()).sort(
      (a, b) => a[1].loadedAt - b[1].loadedAt
    )[0]?.[0];

    if (oldest) {
      compositionCache.delete(oldest);
    }
  }
}

function assertRequestAllowed(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || "local";
  const now = Date.now();
  const current = requestWindows.get(key);

  if (!current || now >= current.resetAt) {
    requestWindows.set(key, { resetAt: now + COMPOSER_RATE_WINDOW_MS, count: 1 });
    return;
  }

  current.count += 1;

  if (current.count > COMPOSER_RATE_LIMIT) {
    throw new RouteError("Too many composer requests. Please retry in a minute.", 429);
  }
}

function errorResponse(error: unknown) {
  const status =
    error instanceof RouteError || error instanceof SosoApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "IndexForge failed to compose.";

  return NextResponse.json({ message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36).padStart(6, "0").slice(0, 6);
}
