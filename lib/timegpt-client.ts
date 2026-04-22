"use client";

import type { ForecastPoint, ForecastRequestInput, ForecastResult, TimeGptApiResponse } from "@/types/forecast";

const DEFAULT_BASE_URL = "http://13.126.109.148:32768";
const DEFAULT_MODEL_NAME = "timegpt-1-long-horizon" as const;

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_TIMEGPT_BASE_URL || DEFAULT_BASE_URL;
  return trimTrailingSlash(configured);
}

function shouldUseProxy(baseUrl: string) {
  if (typeof window === "undefined") {
    return true;
  }

  const preferDirect = process.env.NEXT_PUBLIC_TIMEGPT_PREFER_DIRECT === "true";
  if (preferDirect) {
    return window.location.protocol === "https:" && baseUrl.startsWith("http://");
  }

  // Default to proxying through Next.js to avoid browser CORS failures.
  return true;
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

function summarizeFeatureContributions(featureContributions?: number[][] | null) {
  if (!featureContributions || featureContributions.length === 0) {
    return [];
  }

  const featureCount = featureContributions[0]?.length ?? 0;
  if (featureCount === 0) {
    return [];
  }

  const scores = Array.from({ length: featureCount }, (_, idx) => {
    const values = featureContributions
      .map((row) => row[idx] ?? 0)
      .filter((value) => Number.isFinite(value));
    const meanAbs =
      values.length > 0 ? values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length : 0;
    return { feature: `Feature ${idx + 1}`, contribution: meanAbs };
  });

  return scores.sort((a, b) => b.contribution - a.contribution).slice(0, 8);
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
      model: input.model,
      clean_ex_first: input.cleanExFirst,
      finetune_steps: input.finetuneSteps,
      finetune_depth: input.finetuneDepth,
      finetune_loss: input.finetuneLoss,
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
    shapSummary: summarizeFeatureContributions(payload.feature_contributions),
    requestMeta: {
      horizon: input.horizon,
      freq: input.freq,
      model: input.model,
      baseUrl,
    },
  };

  return result;
}

export { DEFAULT_BASE_URL, DEFAULT_MODEL_NAME };
