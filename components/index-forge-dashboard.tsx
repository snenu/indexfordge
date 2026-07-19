"use client";

import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Database,
  Gem,
  Globe2,
  LineChart,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME,
  DEFAULT_TOKENS,
  TOKEN_UNIVERSE,
  type BacktestPoint,
  type IndexForgeResponse,
  type PublishedIndexDraft,
  type TokenUniverseItem,
  formatPct,
  formatUsd,
  sanitizePublishedDrafts,
  uniqueSymbols,
} from "@/lib/index-forge";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { Button } from "./ui/button";

async function requestComposition(
  theme: string,
  tokens: string[],
  weights?: Array<{ symbol: string; weight: number }>
) {
  const response = await fetch("/api/index-forge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ theme, tokens, weights }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "IndexForge composer failed.");
  }

  return (await response.json()) as IndexForgeResponse;
}

async function requestUniverse() {
  const response = await fetch("/api/index-forge/universe");

  if (!response.ok) return [];

  const payload = (await response.json()) as { universe?: TokenUniverseItem[] };
  return payload.universe ?? [];
}

const QUICK_PRESETS = [
  {
    label: "AI infra",
    theme: DEFAULT_THEME,
    tokens: DEFAULT_TOKENS,
  },
  {
    label: "SoDEX majors",
    theme: "SoDEX tradable majors",
    tokens: ["BTC", "ETH", "SOL", "AAVE", "LINK"],
  },
  {
    label: "DeFi core",
    theme: "DeFi blue chips",
    tokens: ["AAVE", "UNI", "LINK", "ETH", "SOL"],
  },
];

export function IndexForgeDashboard() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [tokens, setTokens] = useState(DEFAULT_TOKENS);
  const [result, setResult] = useState<IndexForgeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [universe, setUniverse] = useState<TokenUniverseItem[]>([]);
  const [tokenSearch, setTokenSearch] = useState("");
  const [manualWeights, setManualWeights] = useState<Record<string, number>>({});
  const [creator, setCreator] = useState("");
  const [publishMessage, setPublishMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadInitialComposition() {
      try {
        const data = await requestComposition(DEFAULT_THEME, DEFAULT_TOKENS);

        if (active) {
          setResult(data);
          setManualWeights(weightsFromComposition(data));
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "IndexForge could not compose this index."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }

        void requestUniverse().then((items) => {
          if (active) {
            setUniverse(items);
          }
        });
      }
    }

    void loadInitialComposition();
    window.requestAnimationFrame(() => {
      if (active) {
        setCreator(window.localStorage.getItem("indexforge:creator") ?? "");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function compose(
    nextTheme = theme,
    nextTokens = tokens,
    nextWeights?: Array<{ symbol: string; weight: number }>
  ) {
    setLoading(true);
    setError("");
    setPublishMessage("");

    try {
      const data = await requestComposition(nextTheme, nextTokens, nextWeights);
      setResult(data);
      setManualWeights(weightsFromComposition(data));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "IndexForge could not compose this index."
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleToken(symbol: string) {
    setTokens((current) => {
      const exists = current.includes(symbol);

      if (exists && current.length <= 3) return current;
      if (!exists && current.length >= 8) return current;

      return exists ? current.filter((item) => item !== symbol) : [...current, symbol];
    });
  }

  function setManualWeight(symbol: string, weight: number) {
    setManualWeights((current) => ({
      ...current,
      [symbol]: weight,
    }));
  }

  async function applyManualWeights() {
    const fallbackWeight = Math.round(100 / Math.max(tokens.length, 1));
    const weights = tokens.map((symbol) => ({
      symbol,
      weight: manualWeights[symbol] ?? fallbackWeight,
    }));

    await compose(theme, tokens, weights);
  }

  function publishDraft() {
    if (!result || !creator.trim()) return;

    const draft: PublishedIndexDraft = {
      id: `${result.ssiDraft.manifest.id}-${Date.now()}`,
      creator: creator.trim(),
      indexName: result.indexName,
      ticker: result.ticker,
      theme: result.theme,
      updatedAt: result.updatedAt,
      returnPct: result.backtest.indexReturnPct,
      maxDrawdownPct: result.backtest.maxDrawdownPct,
      constituents: result.ssiDraft.manifest.constituents,
      manifestId: result.ssiDraft.manifest.id,
    };
    const existing = readPublishedDrafts();

    window.localStorage.setItem("indexforge:creator", creator.trim());
    window.localStorage.setItem(
      "indexforge:published-drafts",
      JSON.stringify([draft, ...existing].slice(0, 24))
    );
    setPublishMessage("Draft saved to this browser. Open Gallery or Creators to review it.");
  }

  const fallbackManualWeight = Math.round(100 / Math.max(tokens.length, 1));
  const tokenInput = useMemo(() => tokens.join(", "), [tokens]);
  const manualTotal = tokens.reduce(
    (sum, symbol) => sum + (manualWeights[symbol] ?? fallbackManualWeight),
    0
  );
  const filteredUniverse = useMemo(() => {
    const query = tokenSearch.trim().toUpperCase();
    const liveSymbols = universe.length
      ? universe
      : TOKEN_UNIVERSE.map((symbol) => ({ currencyId: symbol, symbol, name: symbol }));
    const bySymbol = new Map(liveSymbols.map((item) => [item.symbol, item]));

    if (query) {
      return liveSymbols
        .filter(
          (item) => item.symbol.includes(query) || item.name.toUpperCase().includes(query)
        )
        .slice(0, 24);
    }

    return uniqueUniverseItems(
      [...tokens, ...TOKEN_UNIVERSE].map(
        (symbol) => bySymbol.get(symbol) ?? { currencyId: symbol, symbol, name: symbol }
      )
    ).slice(0, 24);
  }, [tokenSearch, tokens, universe]);
  const totalFlow = result?.tokens.reduce((sum, token) => sum + token.metrics.flow30dUsd, 0) ?? 0;
  const updatedAt = result
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(result.updatedAt))
    : "";

  return (
    <main className="relative z-10 bg-background/95 backdrop-blur-[2px]">
      <section id="composer" className="border-y border-border/70 py-16 sm:py-20">
        <div className="container grid gap-12 lg:grid-cols-[0.76fr_1.24fr] lg:gap-16">
          <div className="space-y-9">
            <div>
              <Pill className="mb-5">LIVE COMPOSER</Pill>
              <h2 className="font-sentient text-4xl leading-tight sm:text-5xl">
                Forge a theme into <i>weights</i>
              </h2>
            </div>

            <div className="space-y-7 border-y border-border/70 py-7">
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
                  Theme
                </span>
                <input
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  className="mt-3 w-full bg-transparent font-sentient text-3xl text-foreground placeholder:text-foreground/25 sm:text-4xl"
                  placeholder="AI infrastructure"
                />
              </label>

              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
                  Token symbols
                </span>
                <input
                  value={tokenInput}
                  onChange={(event) =>
                    setTokens(uniqueSymbols(event.target.value.split(/[\s,]+/)).slice(0, 8))
                  }
                  className="mt-3 w-full bg-transparent font-mono text-lg uppercase text-foreground placeholder:text-foreground/25"
                  placeholder="TAO, RENDER, FET, AKT, NMR"
                />
              </label>

              <label className="block">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
                  Live token search
                </span>
                <input
                  value={tokenSearch}
                  onChange={(event) => setTokenSearch(event.target.value)}
                  className="mt-3 w-full bg-transparent font-mono text-sm uppercase text-foreground placeholder:text-foreground/25"
                  placeholder="Search SoSoValue universe"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setTheme(preset.theme);
                    setTokens(preset.tokens);
                    setTokenSearch("");
                    setManualWeights({});
                    setPublishMessage(`${preset.label} preset staged.`);
                  }}
                  className="h-9 border border-primary/55 px-3 font-mono text-xs uppercase text-primary transition-colors [clip-path:polygon(7px_0,100%_0,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,0_100%,0_7px)] hover:border-primary hover:bg-primary hover:text-black"
                >
                  {preset.label}
                </button>
              ))}
              {filteredUniverse.map((item) => {
                const active = tokens.includes(item.symbol);

                return (
                  <button
                    key={item.currencyId}
                    type="button"
                    onClick={() => toggleToken(item.symbol)}
                    className={cn(
                      "h-9 border px-3 font-mono text-xs uppercase transition-colors [clip-path:polygon(7px_0,100%_0,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,0_100%,0_7px)]",
                      active
                        ? "border-primary bg-primary text-black"
                        : "border-border/80 bg-white/[0.03] text-foreground/55 hover:border-foreground/60 hover:text-foreground"
                    )}
                    aria-pressed={active}
                  >
                    {item.symbol}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 border-y border-border/70 py-5">
              <div className="flex items-center justify-between gap-3 font-mono text-xs uppercase text-foreground/45">
                <span>Manual weights</span>
                <span>{manualTotal.toFixed(0)}% target</span>
              </div>
              <div className="space-y-4">
                {tokens.map((symbol) => (
                  <label key={symbol} className="grid gap-2">
                    <div className="flex items-center justify-between font-mono text-xs uppercase">
                      <span className="text-foreground/65">{symbol}</span>
                      <span className="text-primary">
                        {(manualWeights[symbol] ?? fallbackManualWeight).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="60"
                      value={manualWeights[symbol] ?? fallbackManualWeight}
                      onChange={(event) => setManualWeight(symbol, Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                  </label>
                ))}
              </div>
            </div>

            <label className="block border-b border-border/70 pb-5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
                Creator profile
              </span>
              <input
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
                className="mt-3 w-full bg-transparent font-mono text-sm text-foreground placeholder:text-foreground/25"
                placeholder="Creator name"
              />
            </label>

            <div className="flex flex-wrap items-center gap-4">
              <Button
                type="button"
                onClick={() => void compose()}
                disabled={loading || tokens.length < 3}
                className="min-w-[190px]"
              >
                {loading ? <Loader2 className="animate-spin" /> : <WandSparkles />}
                [Compose]
              </Button>
              <Button
                type="button"
                onClick={() => void applyManualWeights()}
                disabled={loading || tokens.length < 3}
                className="min-w-[190px]"
              >
                {loading ? <Loader2 className="animate-spin" /> : <SlidersHorizontal />}
                [Run Sliders]
              </Button>
              <Button
                type="button"
                onClick={publishDraft}
                disabled={!result || !creator.trim()}
                className="min-w-[190px]"
              >
                <Save />
                [Save Draft]
              </Button>
              <button
                type="button"
                onClick={() => {
                  setTheme(DEFAULT_THEME);
                  setTokens(DEFAULT_TOKENS);
                  void compose(DEFAULT_THEME, DEFAULT_TOKENS);
                }}
                className="inline-flex h-12 items-center gap-2 border-b border-border font-mono text-xs uppercase text-foreground/55 transition-colors hover:text-foreground"
              >
                <RefreshCw className="size-4" />
                Reset index
              </button>
            </div>

            {publishMessage ? (
              <div className="border-l border-primary pl-4 font-mono text-sm text-primary">
                {publishMessage}
              </div>
            ) : null}

            {error ? (
              <div className="border-l border-primary pl-4 font-mono text-sm text-primary">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-10">
            <MetricStrip result={result} totalFlow={totalFlow} loading={loading} />
            <Composition result={result} loading={loading} />
            <Transparency result={result} loading={loading} />
            <Performance result={result} loading={loading} />
            <MacroRisk result={result} loading={loading} />
            <Execution result={result} loading={loading} />
            <Readiness result={result} loading={loading} />
          </div>
        </div>
      </section>

      <section id="layers" className="border-b border-border/70 py-14 sm:py-16">
        <div className="container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <Pill className="mb-5">VALUECHAIN PATH</Pill>
            <h2 className="font-sentient text-4xl leading-tight sm:text-5xl">
              Data first, then <i>on-chain</i>
            </h2>
          </div>
          <div className="grid gap-0 border-y border-border/70">
            <LayerRow
              icon={<Database />}
              label="SoSoValue"
              value={
                result
                  ? `${result.tokens.length} live tokens, ${formatUsd(totalFlow)} 30d activity`
                  : "Live market snapshots and daily klines"
              }
            />
            <LayerRow
              icon={<Sparkles />}
              label={result?.model.provider ?? "AI Composer"}
              value={result?.model.name ?? "OpenAI route with SoSoValue fallback"}
            />
            <LayerRow
              icon={<Gem />}
              label={result?.ssiDraft.chain ?? "SSI Protocol"}
              value={result?.ssiDraft.status ?? "Unsigned SSI manifest"}
            />
            <LayerRow
              icon={<CalendarDays />}
              label="Macro"
              value={
                result
                  ? `${result.macro.riskLevel} risk, ${result.macro.eventCount} events in 14d`
                  : "SoSoValue macro events overlay"
              }
            />
            <LayerRow
              icon={<ArrowUpRight />}
              label="SoDEX"
              value={result?.sodexIntent.status ?? "Testnet rebalance intent"}
            />
            <LayerRow
              icon={<Globe2 />}
              label="China path"
              value={
                result
                  ? `${result.readiness.status.toUpperCase()} / ${result.readiness.region}`
                  : "Same-origin API and local asset delivery"
              }
            />
          </div>
        </div>
      </section>

      <section id="roadmap" className="py-14 sm:py-16">
        <div className="container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <Pill className="mb-5">VALIDATION</Pill>
            <h2 className="font-sentient text-4xl leading-tight sm:text-5xl">
              Evidence before <i>execution</i>
            </h2>
          </div>
          <div className="grid gap-0 border-y border-border/70">
            <RoadmapRow
              wave="Data"
              date="SoSoValue"
              status="Live"
              detail="Currency snapshots, daily klines, and SSI index references are fetched from the API route."
            />
            <RoadmapRow
              wave="Model"
              date="IndexForge"
              status="Visible"
              detail="Theme fit, momentum, flow, liquidity, market-cap rank, and volatility inputs are shown per token."
            />
            <RoadmapRow
              wave="Execution"
              date="ValueChain"
              status="Prepared"
              detail="The app produces an SSI manifest and a SoDEX testnet batch intent; signed submission waits for credentials."
            />
          </div>
        </div>
      </section>

      <footer
        id="sources"
        className="relative z-10 border-t border-border/70 py-8 font-mono text-xs uppercase text-foreground/45"
      >
        <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>IndexForge / {updatedAt || "Live market route"}</span>
          <span>{result?.sources.map((source) => source.name).join(" + ")}</span>
        </div>
      </footer>
    </main>
  );
}

function MetricStrip({
  result,
  totalFlow,
  loading,
}: {
  result: IndexForgeResponse | null;
  totalFlow: number;
  loading: boolean;
}) {
  const metrics = [
    {
      icon: <LineChart />,
      label: result ? `Index ${result.backtest.periodDays}d` : "Index",
      value: result ? formatPct(result.backtest.indexReturnPct) : "Waiting",
    },
    {
      icon: <Activity />,
      label: result ? `BTC ${result.backtest.periodDays}d` : "BTC",
      value: result ? formatPct(result.backtest.btcReturnPct) : "Waiting",
    },
    {
      icon: <Database />,
      label: "30d flow",
      value: result ? formatUsd(totalFlow) : "Waiting",
    },
    {
      icon: <Sparkles />,
      label: "Model",
      value: result ? result.model.provider : "Waiting",
    },
  ];

  return (
    <div className="grid grid-cols-2 border-y border-border/70 sm:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="min-h-28 border-border/70 p-4 odd:border-r sm:border-r sm:last:border-r-0"
        >
          <div className="mb-5 flex items-center gap-2 font-mono text-xs uppercase text-foreground/40">
            {metric.icon}
            <span>{metric.label}</span>
          </div>
          <div className="font-sentient text-2xl">
            {loading && !result ? <span className="text-foreground/25">...</span> : metric.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Composition({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return (
      <div className="space-y-4 border-y border-border/70 py-5">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="h-12 animate-pulse bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70">
      <div className="flex items-end justify-between border-b border-border/70 py-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
            {result.ticker}
          </div>
          <h3 className="mt-1 font-sentient text-3xl">{result.indexName}</h3>
        </div>
        <div className="font-mono text-xs uppercase text-primary">
          {result.model.usedOpenAI ? "OpenAI" : "Quant"}
        </div>
      </div>

      {result.composition.map((item) => {
        const token = result.tokens.find((candidate) => candidate.symbol === item.symbol);

        return (
          <div key={item.symbol} className="border-b border-border/50 py-5 last:border-b-0">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="font-mono text-sm uppercase text-foreground">
                  {item.symbol}
                  <span className="ml-3 text-foreground/35">{token?.name}</span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/55">
                  {item.rationale}
                </p>
              </div>
              <div className="font-sentient text-3xl text-primary">{item.weight}%</div>
            </div>
            <div className="h-2 bg-white/[0.06]">
              <div
                className="h-full bg-primary shadow-glow shadow-primary/50"
                style={{ width: `${item.weight}%` }}
              />
            </div>
            {token ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/40">
                <span>{formatPct(token.metrics.return30dPct)} 30d</span>
                <span>{formatUsd(token.metrics.turnover24hUsd)} 24h turnover</span>
                <span>{formatUsd(token.metrics.flow30dUsd)} 30d flow</span>
              </div>
            ) : null}
          </div>
        );
      })}

      {result.warnings.length ? (
        <div className="border-t border-primary/40 py-4 font-mono text-xs uppercase leading-5 text-primary/80">
          {result.warnings.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function Transparency({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return <div className="h-56 animate-pulse border-y border-border/70 bg-white/[0.03]" />;
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70 py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
            Weighting model
          </div>
          <h3 className="mt-1 font-sentient text-3xl">Signal transparency</h3>
        </div>
        <div className="font-mono text-xs uppercase text-foreground/45">
          {result.model.usedOpenAI ? "OpenAI weights + quant audit" : "Quant weights"}
        </div>
      </div>

      <div className="grid gap-0 border-t border-border/60">
        {result.composition.map((item) => (
          <div
            key={item.symbol}
            className="grid gap-4 border-b border-border/50 py-4 last:border-b-0 md:grid-cols-[92px_1fr]"
          >
            <div className="font-mono text-sm uppercase text-primary">{item.symbol}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <ScoreChip label="Theme" value={item.score?.themeFit} />
              <ScoreChip label="Momentum" value={item.score?.momentum} />
              <ScoreChip label="Flow" value={item.score?.flowTrend} />
              <ScoreChip label="Liquidity" value={item.score?.liquidity} />
              <ScoreChip label="Market cap" value={item.score?.marketCapRank} />
              <ScoreChip label="Risk control" value={item.score?.volatilityPenalty} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Performance({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return <div className="h-64 animate-pulse border-y border-border/70 bg-white/[0.03]" />;
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
            Backtest
          </div>
          <h3 className="mt-1 font-sentient text-3xl">
            {result.backtest.periodDays || result.backtest.points.length}d index vs BTC
          </h3>
        </div>
        <div className="flex gap-4 font-mono text-xs uppercase">
          <span className="text-primary">Index</span>
          <span className="text-foreground/50">BTC</span>
        </div>
      </div>
      <PerformanceChart points={result.backtest.points} />
      <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-4">
        <BacktestMetric label="Drawdown" value={formatPct(result.backtest.maxDrawdownPct)} />
        <BacktestMetric label="Volatility" value={formatPct(result.backtest.volatilityPct)} />
        <BacktestMetric label="Win rate" value={formatPct(result.backtest.winRatePct)} />
        <BacktestMetric label="Sharpe" value={result.backtest.sharpeRatio.toFixed(2)} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <BacktestMetric
          label="Holdout index"
          value={formatPct(result.backtest.validation.holdoutIndexReturnPct)}
        />
        <BacktestMetric
          label="Holdout BTC"
          value={formatPct(result.backtest.validation.holdoutBtcReturnPct)}
        />
        <BacktestMetric
          label="Effective names"
          value={result.backtest.validation.effectiveNames.toFixed(2)}
        />
        <BacktestMetric
          label="Max weight"
          value={formatPlainPct(result.backtest.validation.maxWeightPct)}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/40">
        <span>Drawdown {formatPct(result.backtest.maxDrawdownPct)}</span>
        <span>{result.backtest.points.length} daily SoSoValue closes</span>
        <span>{result.ssiDraft.rebalance}</span>
        <span>{result.backtest.rebalanceCount} rebalances</span>
        <span>
          {result.backtest.validation.concentrationPass ? "Concentration pass" : "Concentration watch"}
        </span>
        <span>{result.backtest.validation.liquidityPass ? "Liquidity pass" : "Liquidity watch"}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] uppercase leading-5 text-foreground/35">
        {result.backtest.assumptions.map((assumption) => (
          <span key={assumption}>{assumption}</span>
        ))}
        {result.backtest.validation.overfitNotes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
    </div>
  );
}

function PerformanceChart({ points }: { points: BacktestPoint[] }) {
  const width = 760;
  const height = 260;
  const padding = 22;
  const values = points.flatMap((point) => [point.index, point.btc]);
  const min = Math.min(...values, 96);
  const max = Math.max(...values, 104);
  const range = max - min || 1;

  function toPolyline(key: "index" | "btc") {
    return points
      .map((point, index) => {
        const x =
          padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - ((point[key] - min) / range) * (height - padding * 2);

        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-64 w-full overflow-visible"
      role="img"
      aria-label="30 day IndexForge backtest chart versus BTC"
    >
      {[0, 1, 2, 3].map((line) => {
        const y = padding + line * ((height - padding * 2) / 3);

        return (
          <line
            key={line}
            x1={padding}
            x2={width - padding}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
          />
        );
      })}
      <polyline
        fill="none"
        points={toPolyline("btc")}
        stroke="rgba(255,255,255,0.48)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <polyline
        fill="none"
        points={toPolyline("index")}
        stroke="#FFC700"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function MacroRisk({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return <div className="h-56 animate-pulse border-y border-border/70 bg-white/[0.03]" />;
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70 py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
            <CalendarDays className="size-4" />
            Macro calendar
          </div>
          <h3 className="mt-1 font-sentient text-3xl">SoSoValue event risk</h3>
        </div>
        <div className={cn("font-mono text-xs uppercase", macroTone(result.macro.riskLevel))}>
          {result.macro.riskLevel}
        </div>
      </div>

      <div className="grid gap-0 border-t border-border/60">
        {result.macro.events.length ? (
          result.macro.events.map((event) => (
            <div
              key={event.date}
              className="grid gap-3 border-b border-border/50 py-4 last:border-b-0 sm:grid-cols-[120px_1fr_90px]"
            >
              <div className="font-mono text-xs uppercase text-primary">{event.date}</div>
              <div>
                <div className="font-mono text-xs uppercase text-foreground/65">
                  {daysUntilLabel(event.daysUntil)}
                </div>
                <p className="mt-1 text-sm leading-6 text-foreground/55">
                  {event.events.join(", ")}
                </p>
              </div>
              <div className={cn("font-mono text-xs uppercase", macroTone(event.riskLevel))}>
                {event.riskLevel}
              </div>
            </div>
          ))
        ) : (
          <div className="py-5 font-mono text-xs uppercase text-foreground/45">
            No upcoming SoSoValue macro events returned for the next 14 days.
          </div>
        )}
      </div>

      {result.macro.warnings.length ? (
        <div className="mt-4 border-l border-primary pl-4 font-mono text-xs uppercase leading-5 text-primary/80">
          {result.macro.warnings.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function Execution({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return <div className="h-64 animate-pulse border-y border-border/70 bg-white/[0.03]" />;
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70 py-5">
      <div className="mb-5">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
          SSI + SoDEX
        </div>
        <h3 className="mt-1 font-sentient text-3xl">Publish path</h3>
      </div>

      <div className="grid gap-0 border-t border-border/60">
        <div className="grid gap-4 border-b border-border/50 py-4 md:grid-cols-[150px_1fr]">
          <div className="font-mono text-xs uppercase text-primary">Manifest</div>
          <div>
            <div className="font-mono text-sm uppercase text-foreground">
              {result.ssiDraft.manifest.id}
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground/55">
              {result.ssiDraft.manifest.methodology}
            </p>
          </div>
        </div>

        <div className="grid gap-4 border-b border-border/50 py-4 md:grid-cols-[150px_1fr]">
          <div className="font-mono text-xs uppercase text-primary">SSI references</div>
          <div className="grid gap-3">
            {result.ssiReferences.length ? (
              result.ssiReferences.map((reference) => (
                <div
                  key={reference.ticker}
                  className="grid gap-2 border-b border-border/35 pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[110px_1fr]"
                >
                  <div className="font-mono text-sm uppercase text-foreground">
                    {reference.label}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] uppercase text-foreground/45">
                    <span>{formatPlainPct(reference.overlapPct)} overlap</span>
                    <span>{reference.constituentCount} constituents</span>
                    <span>1m {formatOptionalPct(reference.return1mPct)}</span>
                    <span>3m {formatOptionalPct(reference.return3mPct)}</span>
                    <span>{reference.matchedSymbols.join(", ") || "No shared symbols"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="font-mono text-xs uppercase text-foreground/45">
                SSI reference data unavailable
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 py-4 md:grid-cols-[150px_1fr]">
          <div className="font-mono text-xs uppercase text-primary">SoDEX intent</div>
          <div>
            <div className="font-mono text-sm uppercase text-foreground">
              {result.sodexIntent.network} / {result.sodexIntent.mode}
            </div>
            <p className="mt-2 text-sm leading-6 text-foreground/55">
              {result.sodexIntent.status}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[11px] uppercase text-foreground/40">
              <span>{result.sodexIntent.orders.length} market orders</span>
              <span>{result.sodexIntent.requiredHeaders.join(", ")}</span>
              <span className="break-all">{result.sodexIntent.orderEndpoint}</span>
            </div>
            <div className="mt-4 grid gap-2">
              {result.sodexIntent.orders.map((order) => (
                <div
                  key={order.symbol}
                  className="grid gap-2 border-t border-border/35 pt-3 sm:grid-cols-[90px_1fr_120px]"
                >
                  <span className="font-mono text-xs uppercase text-foreground">
                    {order.symbol}
                  </span>
                  <span className="font-mono text-[11px] uppercase text-foreground/45">
                    {order.displayName ?? order.market ?? "No testnet market"} /{" "}
                    {order.minNotional ? `min ${order.minNotional} USDC` : "min notional n/a"}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] uppercase",
                      order.executable ? "text-primary" : "text-foreground/35"
                    )}
                  >
                    {order.marketStatus}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Readiness({
  result,
  loading,
}: {
  result: IndexForgeResponse | null;
  loading: boolean;
}) {
  if (!result && loading) {
    return <div className="h-56 animate-pulse border-y border-border/70 bg-white/[0.03]" />;
  }

  if (!result) return null;

  return (
    <div className="border-y border-border/70 py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground/45">
            <ShieldCheck className="size-4" />
            Production checks
          </div>
          <h3 className="mt-1 font-sentient text-3xl">China-safe readiness</h3>
        </div>
        <div
          className={cn(
            "font-mono text-xs uppercase",
            readinessTone(result.readiness.status)
          )}
        >
          {result.readiness.status}
        </div>
      </div>

      <div className="grid gap-0 border-t border-border/60">
        {result.readiness.checks.map((check) => (
          <div
            key={check.label}
            className="grid gap-3 border-b border-border/50 py-4 last:border-b-0 sm:grid-cols-[150px_88px_1fr]"
          >
            <div className="font-mono text-xs uppercase text-primary">{check.label}</div>
            <div className={cn("font-mono text-xs uppercase", checkTone(check.status))}>
              {check.status}
            </div>
            <div className="text-sm leading-6 text-foreground/55">{check.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LayerRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid gap-4 border-b border-border/70 py-5 last:border-b-0 sm:grid-cols-[180px_1fr]">
      <div className="flex items-center gap-3 font-mono text-xs uppercase text-primary">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg text-foreground/70">{value}</div>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value?: number }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border border-border/50 px-3 py-2 font-mono text-[11px] uppercase">
      <span className="text-foreground/40">{label}</span>
      <span className="text-foreground">{value === undefined ? "--" : `${value.toFixed(0)}`}</span>
    </div>
  );
}

function BacktestMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/50 px-3 py-3">
      <div className="font-mono text-[10px] uppercase text-foreground/40">{label}</div>
      <div className="mt-1 font-sentient text-2xl text-foreground">{value}</div>
    </div>
  );
}

function RoadmapRow({
  wave,
  date,
  status,
  detail,
}: {
  wave: string;
  date: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="grid gap-4 border-b border-border/70 py-5 last:border-b-0 sm:grid-cols-[120px_130px_1fr]">
      <div className="font-mono text-xs uppercase text-primary">{wave}</div>
      <div className="font-mono text-xs uppercase text-foreground/45">{date}</div>
      <div>
        <div className="mb-1 font-mono text-xs uppercase text-foreground">{status}</div>
        <p className="text-foreground/55">{detail}</p>
      </div>
    </div>
  );
}

function formatOptionalPct(value: number | null) {
  return value === null ? "--" : formatPct(value);
}

function formatPlainPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function macroTone(level: IndexForgeResponse["macro"]["riskLevel"]) {
  if (level === "High") return "text-primary";
  if (level === "Medium") return "text-foreground";
  if (level === "Low") return "text-foreground/55";
  return "text-foreground/35";
}

function readinessTone(status: IndexForgeResponse["readiness"]["status"]) {
  if (status === "ready") return "text-primary";
  if (status === "watch") return "text-foreground";
  return "text-primary";
}

function checkTone(status: IndexForgeResponse["readiness"]["checks"][number]["status"]) {
  if (status === "pass") return "text-primary";
  if (status === "watch") return "text-foreground";
  return "text-primary";
}

function daysUntilLabel(daysUntil: number) {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  if (daysUntil > 1) return `${daysUntil}d ahead`;
  if (daysUntil === -1) return "Yesterday";
  return `${Math.abs(daysUntil)}d ago`;
}

function weightsFromComposition(result: IndexForgeResponse) {
  return Object.fromEntries(result.composition.map((item) => [item.symbol, item.weight]));
}

function uniqueUniverseItems(items: TokenUniverseItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  });
}

function readPublishedDrafts(): PublishedIndexDraft[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem("indexforge:published-drafts") ?? "[]");

    return sanitizePublishedDrafts(parsed);
  } catch {
    return [];
  }
}
