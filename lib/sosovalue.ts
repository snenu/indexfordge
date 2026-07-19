export const SOSOVALUE_BASE_URL =
  process.env.SOSOVALUE_BASE_URL ?? "https://openapi.sosovalue.com/openapi/v1";

type SosoEnvelope<T> = {
  code?: number | string;
  message?: string;
  data?: T;
  details?: {
    retry_after?: number | string;
  };
};

type SosoFetchOptions = {
  retryRateLimit?: boolean;
  cacheTtlMs?: number;
  revalidateSeconds?: number;
};

export class SosoApiError extends Error {
  constructor(
    message: string,
    public status = 500,
    public retryAfterSeconds: number | null = null
  ) {
    super(message);
  }
}

const RATE_LIMIT_CODES = new Set([42901]);
const responseCache = new Map<string, { loadedAt: number; data: unknown }>();
const inFlightFetches = new Map<string, Promise<unknown>>();

export async function sosoFetch<T>(
  path: string,
  options: SosoFetchOptions = {}
): Promise<T> {
  const apiKey = process.env.SOSOVALUE_API_KEY;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const retryRateLimit = options.retryRateLimit ?? true;
  const ttl = options.cacheTtlMs ?? cacheTtl(normalizedPath);

  if (!apiKey) {
    throw new SosoApiError("SOSOVALUE_API_KEY is not configured.", 500);
  }

  const cached = responseCache.get(normalizedPath);

  if (cached && Date.now() - cached.loadedAt < ttl) {
    return cached.data as T;
  }

  const inFlight = inFlightFetches.get(normalizedPath);

  if (inFlight) {
    return (await inFlight) as T;
  }

  const requestPromise = requestSoso<T>(normalizedPath, {
    cached,
    retryRateLimit,
    revalidateSeconds: options.revalidateSeconds ?? Math.max(Math.floor(ttl / 1000), 1),
  });

  inFlightFetches.set(normalizedPath, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightFetches.delete(normalizedPath);
  }
}

export function isSosoRateLimitError(error: unknown) {
  return error instanceof SosoApiError && error.status === 429;
}

function cacheTtl(path: string) {
  if (path === "/currencies") return 60 * 1000;
  if (path === "/indices") return 60 * 1000;
  if (path === "/macro/events") return 60 * 1000;
  if (path.includes("/constituents")) return 60 * 1000;
  if (path.includes("/market-snapshot")) return 30 * 1000;
  if (path.includes("/klines")) return 60 * 1000;
  return 5 * 60 * 1000;
}

async function requestSoso<T>(
  path: string,
  context: {
    cached?: { loadedAt: number; data: unknown };
    retryRateLimit: boolean;
    revalidateSeconds: number;
  }
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${SOSOVALUE_BASE_URL}${path}`, {
      headers: {
        "x-soso-api-key": process.env.SOSOVALUE_API_KEY ?? "",
      },
      next: { revalidate: context.revalidateSeconds },
    });
    const payload = (await response.json().catch(() => null)) as SosoEnvelope<T> | null;
    const retryAfterSeconds = readRetryAfterSeconds(response, payload);
    const rateLimited = isRateLimited(response, payload);

    if (rateLimited && context.cached) {
      return context.cached.data as T;
    }

    if (rateLimited) {
      if (context.retryRateLimit && attempt < 4) {
        await sleep(retryAfterSeconds ? retryAfterSeconds * 1000 : 1500 * 2 ** attempt);
        continue;
      }

      throw new SosoApiError(
        "SoSoValue rate limit exceeded. Please retry after the API window resets.",
        429,
        retryAfterSeconds
      );
    }

    if (!response.ok || !payload || Number(payload.code) !== 0 || !("data" in payload)) {
      throw new SosoApiError(
        payload?.message ?? `SoSoValue request failed with ${response.status}`,
        response.ok ? 502 : response.status
      );
    }

    responseCache.set(path, { loadedAt: Date.now(), data: payload.data });
    trimCache();
    return payload.data as T;
  }

  throw new SosoApiError("SoSoValue request failed after retry.", 502);
}

function isRateLimited(response: Response, payload: SosoEnvelope<unknown> | null) {
  return response.status === 429 || RATE_LIMIT_CODES.has(Number(payload?.code));
}

function readRetryAfterSeconds(response: Response, payload: SosoEnvelope<unknown> | null) {
  const headerValue = Number(response.headers.get("retry-after"));
  const detailValue = Number(payload?.details?.retry_after);
  const value = Number.isFinite(headerValue) && headerValue > 0 ? headerValue : detailValue;

  return Number.isFinite(value) && value > 0 ? value : null;
}

function trimCache() {
  if (responseCache.size <= 160) return;

  const oldestKey = Array.from(responseCache.entries()).sort(
    (a, b) => a[1].loadedAt - b[1].loadedAt
  )[0]?.[0];

  if (oldestKey) {
    responseCache.delete(oldestKey);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
