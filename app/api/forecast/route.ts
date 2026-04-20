import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "http://13.126.109.148:32768";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveBaseUrl(explicitBaseUrl?: string) {
  return trimTrailingSlash(explicitBaseUrl || process.env.TIMEGPT_BASE_URL || DEFAULT_BASE_URL);
}

function buildHeaders() {
  const apiKey = process.env.TIMEGPT_API_KEY || process.env.NEXT_PUBLIC_TIMEGPT_API_KEY;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown> & { baseUrl?: string };
    const baseUrl = resolveBaseUrl(body.baseUrl);

    const upstreamResponse = await fetch(`${baseUrl}/v2/forecast`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        ...body,
        baseUrl: undefined,
      }),
      cache: "no-store",
    });

    const text = await upstreamResponse.text();

    return new NextResponse(text, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The forecast proxy could not reach the TimeGPT endpoint.",
      },
      { status: 500 },
    );
  }
}
