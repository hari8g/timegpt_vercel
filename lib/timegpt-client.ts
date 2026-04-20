"use client";

import type { ForecastPoint, ForecastRequestInput, ForecastResult, TimeGptApiResponse } from "@/types/forecast";

const DEFAULT_BASE_URL = "http://13.126.109.148:32768";
const MODEL_NAME = "timegpt-1-long-horizon" as const;

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_TIMEGPT_BASE_URL || DEFAULT_BASE_URL;
  return trimTrailingSlash(configured);
}

function shouldUseProxy(baseUrl: string) {
  if (typeof window === "undefined") {
    return false;
  }

  return window.location.protocol === "https:" && baseUrl.startsWith("http://");
}

function buildHeaders() {
  const apiKey = process.env.NEXT_PUBLIC_TIMEGPT_API_KEY;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

function mapSeries(timestamps: string[], values: number[]): ForecastPoint[] {
  return timestamps.map((timestamp, index) => ({
    timestamp,
    value: values[index] ?? Number.NaN,
  }));
}

export async function requestForecast(input: ForecastRequestInput & { historyTimestamps: string[]; futureTimestamps: string[] }) {
  const baseUrl = normalizeBaseUrl();
  const useProxy = shouldUseProxy(baseUrl);
  const response = await fetch(useProxy ? "/api/forecast" : `${baseUrl}/v2/forecast`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      series: {
        sizes: [input.values.length],
        y: input.values,
      },
      h: input.horizon,
      freq: input.freq,
      model: MODEL_NAME,
      clean_ex_first: true,
      finetune_steps: 0,
      ...(input.levels.length > 0 ? { level: input.levels } : {}),
      ...(useProxy ? { baseUrl } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Forecast request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as TimeGptApiResponse;
  if (!Array.isArray(payload.mean)) {
    throw new Error("The model response did not include forecast values.");
  }

  const intervals = Object.fromEntries(
    Object.entries(payload.intervals ?? {}).map(([key, values]) => [
      key,
      mapSeries(input.futureTimestamps, values),
    ]),
  );

  const result: ForecastResult = {
    historical: mapSeries(input.historyTimestamps, input.values),
    forecast: mapSeries(input.futureTimestamps, payload.mean),
    intervals,
    inputTokens: payload.input_tokens,
    outputTokens: payload.output_tokens,
    finetuneTokens: payload.finetune_tokens,
    requestMeta: {
      horizon: input.horizon,
      freq: input.freq,
      model: MODEL_NAME,
      baseUrl,
    },
  };

  return result;
}

export { DEFAULT_BASE_URL, MODEL_NAME };
