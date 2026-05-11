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
};

export type BacktestPoint = {
  date: string;
  index: number;
  btc: number;
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
    indexReturnPct: number;
    btcReturnPct: number;
    maxDrawdownPct: number;
  };
  model: {
    provider: "Claude" | "IndexForge Quant";
    name: string;
    usedClaude: boolean;
    note?: string;
  };
  ssiDraft: {
    name: string;
    ticker: string;
    rebalance: string;
    chain: string;
    sodexMode: string;
    status: string;
  };
  unresolved: string[];
  warnings: string[];
  sources: {
    name: string;
    url: string;
  }[];
};

export function normalizeSymbol(symbol: string) {
  return symbol.trim().replace(/^\$/, "").toUpperCase();
}

export function uniqueSymbols(symbols: string[]) {
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
