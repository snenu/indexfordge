import { NextResponse } from "next/server";
import { sosoFetch } from "@/lib/sosovalue";

export const dynamic = "force-dynamic";

type HealthStatus = "online" | "configured" | "degraded" | "not_configured";

type HealthCheck = {
  service: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number;
};

type Currency = {
  currency_id?: string;
  symbol?: string;
  name?: string;
};

type MacroEventGroup = {
  date?: string;
  events?: string[];
};

type SodexSymbol = {
  name?: string;
};

export async function GET() {
  const checkedAt = new Date().toISOString();
  const checks: HealthCheck[] = [];

  checks.push(
    await timedCheck("SoSoValue currencies", async () => {
      const currencies = await sosoFetch<Currency[]>("/currencies", { retryRateLimit: false });
      const currencyList = Array.isArray(currencies) ? currencies : [];
      return `${currencyList.filter((item) => item.currency_id && item.symbol).length} currencies available.`;
    })
  );
  checks.push(
    await timedCheck("SoSoValue Indexes", async () => {
      const tickers = await sosoFetch<string[]>("/indices", { retryRateLimit: false });
      return `${Array.isArray(tickers) ? tickers.length : 0} index ticker(s) available.`;
    })
  );
  checks.push(
    await timedCheck("SoSoValue Macro", async () => {
      const groups = await sosoFetch<MacroEventGroup[]>("/macro/events", {
        retryRateLimit: false,
      });
      const eventGroups = Array.isArray(groups) ? groups : [];
      const eventCount = eventGroups.reduce((sum, group) => sum + (group.events?.length ?? 0), 0);
      return `${eventCount} macro event(s) available.`;
    })
  );
  checks.push(openAiCheck());
  checks.push(await sodexCheck());
  checks.push({
    service: "China browser path",
    status: "configured",
    detail:
      "Browser runtime uses same-origin API routes plus local/system fonts; no client-side SoSoValue, OpenAI, or Google font calls.",
    latencyMs: 0,
  });

  const status = checks.some((check) => check.status === "degraded")
    ? "degraded"
    : checks.some((check) => check.status === "not_configured")
      ? "configured"
      : "online";

  return NextResponse.json({
    status,
    checkedAt,
    checks,
  });
}

async function timedCheck(service: string, run: () => Promise<string>): Promise<HealthCheck> {
  const startedAt = performance.now();

  try {
    return {
      service,
      status: "online",
      detail: await run(),
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      service,
      status: "degraded",
      detail: error instanceof Error ? error.message : "Health check failed.",
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}

function openAiCheck(): HealthCheck {
  return {
    service: "OpenAI composer",
    status: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
    detail: process.env.OPENAI_API_KEY
      ? "Server-side OpenAI key is configured."
      : "OpenAI is optional; IndexForge Quant fallback remains active.",
    latencyMs: 0,
  };
}

async function sodexCheck(): Promise<HealthCheck> {
  const endpoint = process.env.SODEX_SPOT_ENDPOINT ?? "https://testnet-gw.sodex.dev/api/v1/spot";

  return timedCheck("SoDEX symbols", async () => {
    const response = await fetch(`${endpoint}/markets/symbols`, {
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

    const symbols = Array.isArray(payload) ? payload : payload.data ?? [];
    return `${symbols.filter((symbol) => symbol.name).length} market symbol(s) available.`;
  });
}
