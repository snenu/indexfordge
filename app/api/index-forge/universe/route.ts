import { NextResponse } from "next/server";
import { TOKEN_UNIVERSE, normalizeSymbol, type TokenUniverseItem } from "@/lib/index-forge";
import { SosoApiError, sosoFetch } from "@/lib/sosovalue";

export const dynamic = "force-dynamic";

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
      { status: error instanceof SosoApiError ? error.status : 500 }
    );
  }
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
