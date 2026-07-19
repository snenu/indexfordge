export const DEFAULT_THEME = "AI infrastructure";

export const DEFAULT_TOKENS = ["TAO", "RENDER", "FET", "AKT", "NMR"];

export const TOKEN_UNIVERSE = [
  "TAO",
  "RENDER",
  "FET",
  "AKT",
  "NMR",
  "NEAR",
  "ICP",
  "GRT",
  "VIRTUAL",
  "LINK",
  "AAVE",
  "UNI",
  "SOL",
  "ETH",
  "BTC",
];

export type TokenMetrics = {
  price: number;
  change24hPct: number;
  return30dPct: number;
  flow30dUsd: number;
  flowTrendPct: number;
  turnover24hUsd: number;
  turnoverRate: number;
  marketcapUsd: number;
  marketcapRank: number | null;
  volatility30dPct: number;
};

export type HistoryPoint = {
  date: string;
  timestamp: number;
  close: number;
  volume: number;
  dollarVolume: number;
};

export type TokenAnalysis = {
  currencyId: string;
  symbol: string;
  name: string;
  sectors: string[];
  introduction: string;
  metrics: TokenMetrics;
  history: HistoryPoint[];
};

export type WeightSuggestion = {
  symbol: string;
  weight: number;
  rationale: string;
  score?: {
    themeFit: number;
    momentum: number;
    flowTrend: number;
    flowScale: number;
    liquidity: number;
    marketCapRank: number;
    volatilityPenalty: number;
    composite: number;
  };
};

export type BacktestPoint = {
  date: string;
  index: number;
  btc: number;
};

export type SsiReference = {
  ticker: string;
  label: string;
  overlapPct: number;
  constituentCount: number;
  matchedSymbols: string[];
  price: number | null;
  return1mPct: number | null;
  return3mPct: number | null;
  return1yPct: number | null;
  ytdPct: number | null;
};

export type TokenUniverseItem = {
  currencyId: string;
  symbol: string;
  name: string;
};

export type SodexIntent = {
  mode: string;
  network: string;
  marketDataEndpoint: string;
  orderEndpoint: string;
  status: string;
  requiresSignature: boolean;
  requiredHeaders: string[];
  orders: Array<{
    symbol: string;
    market: string | null;
    displayName: string | null;
    marketStatus: string;
    minNotional: string | null;
    executable: boolean;
    side: "buy";
    type: "market";
    timeInForce: "IOC";
    targetWeightPct: number;
    quoteAllocationPct: number;
  }>;
  notes: string[];
};

export type MacroRiskLevel = "Low" | "Medium" | "High" | "Unknown";

export type MacroEvent = {
  date: string;
  events: string[];
  daysUntil: number;
  riskLevel: Exclude<MacroRiskLevel, "Unknown">;
};

export type ProductionReadinessCheck = {
  label: string;
  status: "pass" | "watch" | "blocked";
  detail: string;
};

export type ValidationReport = {
  trainingDays: number;
  holdoutDays: number;
  holdoutIndexReturnPct: number;
  holdoutBtcReturnPct: number;
  effectiveNames: number;
  maxWeightPct: number;
  concentrationPass: boolean;
  liquidityPass: boolean;
  overfitNotes: string[];
};

export type IndexForgeResponse = {
  theme: string;
  indexName: string;
  ticker: string;
  updatedAt: string;
  tokens: TokenAnalysis[];
  composition: WeightSuggestion[];
  backtest: {
    points: BacktestPoint[];
    periodDays: number;
    indexReturnPct: number;
    btcReturnPct: number;
    maxDrawdownPct: number;
    volatilityPct: number;
    sharpeRatio: number;
    winRatePct: number;
    rebalanceCount: number;
    assumptions: string[];
    validation: ValidationReport;
  };
  model: {
    provider: "OpenAI" | "IndexForge Quant";
    name: string;
    usedOpenAI: boolean;
    note?: string;
    objective: string;
  };
  ssiDraft: {
    name: string;
    ticker: string;
    rebalance: string;
    chain: string;
    sodexMode: string;
    status: string;
    manifest: {
      id: string;
      methodology: string;
      dataWindowDays: number;
      constituents: Array<{
        symbol: string;
        weightPct: number;
      }>;
    };
  };
  ssiReferences: SsiReference[];
  sodexIntent: SodexIntent;
  macro: {
    source: "SoSoValue Macro";
    riskLevel: MacroRiskLevel;
    nextEventDate: string | null;
    eventCount: number;
    events: MacroEvent[];
    warnings: string[];
  };
  readiness: {
    status: "ready" | "watch" | "blocked";
    region: "China-compatible browser path";
    checks: ProductionReadinessCheck[];
  };
  unresolved: string[];
  warnings: string[];
  sources: {
    name: string;
    url: string;
  }[];
};

export type PublishedIndexDraft = {
  id: string;
  creator: string;
  indexName: string;
  ticker: string;
  theme: string;
  updatedAt: string;
  returnPct: number;
  maxDrawdownPct: number;
  constituents: Array<{
    symbol: string;
    weightPct: number;
  }>;
  manifestId: string;
};

export type SsiGalleryItem = SsiReference & {
  source: "SoSoValue Indexes";
};

export function normalizeSymbol(symbol: unknown) {
  return typeof symbol === "string" ? symbol.trim().replace(/^\$/, "").toUpperCase() : "";
}

export function uniqueSymbols(symbols: unknown[]) {
  return Array.from(
    new Set(symbols.map(normalizeSymbol).filter((symbol) => symbol.length > 0))
  );
}

export function buildTicker(theme: string) {
  const cleaned = theme
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const letters =
    cleaned.length > 1
      ? cleaned.map((word) => word[0]).join("")
      : (cleaned[0] ?? "INDEX").slice(0, 4);

  return `${letters.toUpperCase().slice(0, 4)}X`;
}

export function formatUsd(value: number) {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatPct(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function sanitizePublishedDrafts(value: unknown): PublishedIndexDraft[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;

      const constituents = Array.isArray(item.constituents)
        ? item.constituents
            .map((constituent) => {
              if (!isRecord(constituent)) return null;

              const symbol = normalizeSymbol(constituent.symbol);
              const weightPct = toFiniteNumber(constituent.weightPct);

              return symbol && weightPct > 0 ? { symbol, weightPct } : null;
            })
            .filter((constituent): constituent is { symbol: string; weightPct: number } =>
              Boolean(constituent)
            )
        : [];

      const id = toCleanString(item.id);
      const creator = toCleanString(item.creator);
      const indexName = toCleanString(item.indexName);
      const ticker = normalizeSymbol(item.ticker);
      const theme = toCleanString(item.theme);
      const updatedAt = toCleanString(item.updatedAt);
      const manifestId = toCleanString(item.manifestId);

      if (!id || !creator || !indexName || !ticker || !theme || !updatedAt || !manifestId) {
        return null;
      }

      return {
        id,
        creator,
        indexName,
        ticker,
        theme,
        updatedAt,
        returnPct: toFiniteNumber(item.returnPct),
        maxDrawdownPct: toFiniteNumber(item.maxDrawdownPct),
        constituents,
        manifestId,
      };
    })
    .filter((draft): draft is PublishedIndexDraft => Boolean(draft));
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
