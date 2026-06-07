import { NextResponse } from "next/server";
import { TOKEN_UNIVERSE, normalizeSymbol, type TokenUniverseItem } from "@/lib/index-forge";

export const dynamic = "force-dynamic";

const SOSO_BASE_URL =
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";

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

export async function GET() {
  try {
    const currencies = await sosoFetch<Currency[]>("/currencies");
    const universe: TokenUniverseItem[] = currencies
      .map((currency) => ({
        currencyId: String(currency.currency_id ?? "").trim(),
        symbol: normalizeSymbol(currency.symbol ?? ""),
        name: String(currency.name ?? "").trim(),
      }))
      .filter((currency) => currency.currencyId && currency.symbol && currency.name)
      .sort(sortUniverseItem);

    return NextResponse.json({ universe });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "IndexForge could not load token universe.",
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

function sortUniverseItem(a: TokenUniverseItem, b: TokenUniverseItem) {
  const aPriority = TOKEN_UNIVERSE.indexOf(a.symbol);
  const bPriority = TOKEN_UNIVERSE.indexOf(b.symbol);

  if (aPriority !== -1 || bPriority !== -1) {
    return (aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority) -
      (bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority);
  }

  return a.symbol.localeCompare(b.symbol);
}
