import { NextResponse } from "next/server";
import { normalizeSymbol, type SsiGalleryItem } from "@/lib/index-forge";

export const dynamic = "force-dynamic";

const SOSO_BASE_URL =
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";

type SosoEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

type IndexConstituent = {
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

export async function GET() {
  try {
    const tickers = await sosoFetch<string[]>("/indices");
    const items: SsiGalleryItem[] = [];

    for (const ticker of tickers.slice(0, 8)) {
      const [snapshot, constituents] = await Promise.all([
        sosoFetch<IndexSnapshot>(`/indices/${ticker}/market-snapshot`).catch(() => null),
        sosoFetch<IndexConstituent[]>(`/indices/${ticker}/constituents`).catch(() => []),
      ]);

      items.push({
        source: "SoSoValue Indexes",
        ticker,
        label: formatSsiLabel(ticker),
        overlapPct: 0,
        constituentCount: constituents.length,
        matchedSymbols: constituents
          .map((item) => normalizeSymbol(item.symbol ?? ""))
          .filter(Boolean)
          .slice(0, 8),
        price: toNullableNumber(snapshot?.price),
        return1mPct: toNullablePercent(snapshot?.["1month_roi"]),
        return3mPct: toNullablePercent(snapshot?.["3month_roi"]),
        return1yPct: toNullablePercent(snapshot?.["1year_roi"]),
        ytdPct: toNullablePercent(snapshot?.ytd),
      });
    }

    return NextResponse.json({
      items: items.sort(
        (a, b) => (b.return1mPct ?? -Infinity) - (a.return1mPct ?? -Infinity)
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "IndexForge could not load gallery.",
      },
      { status: 500 }
    );
  }
}

async function sosoFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;

  if (!apiKey) {
    throw new Error("SOSOVALUE_API_KEY is not configured.");
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${SOSO_BASE_URL}${path}`, {
      headers: {
        "x-soso-api-key": apiKey,
      },
      next: { revalidate: 60 },
    });
    const payload = (await response.json().catch(() => null)) as SosoEnvelope<T> | null;
    const rateLimited = response.status === 429 || payload?.code === 402901;

    if (rateLimited && attempt < 3) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }

    if (!response.ok || !payload || payload.code !== 0) {
      throw new Error(payload?.message ?? `SoSoValue request failed with ${response.status}`);
    }

    return payload.data;
  }

  throw new Error("SoSoValue request failed after retry.");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSsiLabel(ticker: string) {
  if (ticker.toLowerCase() === "ussi") return "USSI";

  return `${ticker.replace(/^ssi/i, "").toUpperCase()}.ssi`;
}

function toNullableNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullablePercent(value: unknown) {
  const parsed = toNullableNumber(value);
  return parsed === null
    ? null
    : Math.round((Math.abs(parsed) <= 1 ? parsed * 100 : parsed) * 100) / 100;
}
