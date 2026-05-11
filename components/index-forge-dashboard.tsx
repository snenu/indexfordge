"use client";

import {
  Activity,
  ArrowUpRight,
  Database,
  Gem,
  LineChart,
  Loader2,
  RefreshCw,
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
  formatPct,
  formatUsd,
  uniqueSymbols,
} from "@/lib/index-forge";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { Button } from "./ui/button";

async function requestComposition(theme: string, tokens: string[]) {
  const response = await fetch("/api/index-forge", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ theme, tokens }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "IndexForge composer failed.");
  }

  return (await response.json()) as IndexForgeResponse;
}

export function IndexForgeDashboard() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [tokens, setTokens] = useState(DEFAULT_TOKENS);
  const [result, setResult] = useState<IndexForgeResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadInitialComposition() {
      try {
        const data = await requestComposition(DEFAULT_THEME, DEFAULT_TOKENS);

        if (active) {
          setResult(data);
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
      }
    }

    void loadInitialComposition();

    return () => {
      active = false;
    };
  }, []);

  async function compose(nextTheme = theme, nextTokens = tokens) {
    setLoading(true);
    setError("");

    try {
      const data = await requestComposition(nextTheme, nextTokens);
      setResult(data);
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

  const tokenInput = useMemo(() => tokens.join(", "), [tokens]);
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
                  className="mt-3 w-full bg-transparent font-sentient text-3xl text-foreground outline-none placeholder:text-foreground/25 sm:text-4xl"
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
                  className="mt-3 w-full bg-transparent font-mono text-lg uppercase text-foreground outline-none placeholder:text-foreground/25"
                  placeholder="TAO, RENDER, FET, AKT, NMR"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              {TOKEN_UNIVERSE.map((symbol) => {
                const active = tokens.includes(symbol);

                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => toggleToken(symbol)}
                    className={cn(
                      "h-9 border px-3 font-mono text-xs uppercase transition-colors [clip-path:polygon(7px_0,100%_0,100%_calc(100%_-_7px),calc(100%_-_7px)_100%,0_100%,0_7px)]",
                      active
                        ? "border-primary bg-primary text-black"
                        : "border-border/80 bg-white/[0.03] text-foreground/55 hover:border-foreground/60 hover:text-foreground"
                    )}
                    aria-pressed={active}
                  >
                    {symbol}
                  </button>
                );
              })}
            </div>

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
                Reset wave demo
              </button>
            </div>

            {error ? (
              <div className="border-l border-primary pl-4 font-mono text-sm text-primary">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-10">
            <MetricStrip result={result} totalFlow={totalFlow} loading={loading} />
            <Composition result={result} loading={loading} />
            <Performance result={result} loading={loading} />
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
              value={result?.model.name ?? "Claude route with SoSoValue fallback"}
            />
            <LayerRow
              icon={<Gem />}
              label={result?.ssiDraft.chain ?? "SSI Protocol"}
              value={result?.ssiDraft.status ?? "Draft deploy path for Wave 3"}
            />
            <LayerRow
              icon={<ArrowUpRight />}
              label="SoDEX"
              value={result?.ssiDraft.sodexMode ?? "Copy-trade mirror route"}
            />
          </div>
        </div>
      </section>

      <section id="roadmap" className="py-14 sm:py-16">
        <div className="container grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <Pill className="mb-5">BUILD PLAN</Pill>
            <h2 className="font-sentient text-4xl leading-tight sm:text-5xl">
              Wave roadmap to <i>live funds</i>
            </h2>
          </div>
          <div className="grid gap-0 border-y border-border/70">
            <RoadmapRow
              wave="Wave 1"
              date="May 12, 2026"
              status="Live now"
              detail="SoSoValue data, AI weights, bars, backtest, README, demo-ready UI."
            />
            <RoadmapRow
              wave="Wave 2"
              date="May 18-29, 2026"
              status="Product"
              detail="Full designer, sliders, public gallery, SoDEX testnet order simulation."
            />
            <RoadmapRow
              wave="Wave 3"
              date="Jun 4-15, 2026"
              status="Production"
              detail="SSI deploys, SoDEX copy-trading, rebalance engine, creator fees."
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
      label: "Index 30d",
      value: result ? formatPct(result.backtest.indexReturnPct) : "Waiting",
    },
    {
      icon: <Activity />,
      label: "BTC 30d",
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
          {result.model.usedClaude ? "Claude" : "Quant"}
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
          <h3 className="mt-1 font-sentient text-3xl">Index vs BTC</h3>
        </div>
        <div className="flex gap-4 font-mono text-xs uppercase">
          <span className="text-primary">Index</span>
          <span className="text-foreground/50">BTC</span>
        </div>
      </div>
      <PerformanceChart points={result.backtest.points} />
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase text-foreground/40">
        <span>Drawdown {formatPct(result.backtest.maxDrawdownPct)}</span>
        <span>{result.backtest.points.length} daily SoSoValue closes</span>
        <span>{result.ssiDraft.rebalance}</span>
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
