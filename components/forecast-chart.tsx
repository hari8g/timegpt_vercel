"use client";

import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";

import type { ForecastResult } from "@/types/forecast";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface ForecastChartProps {
  result: ForecastResult | null;
}

function getIntervalPair(
  intervals: ForecastResult["intervals"],
  level: number,
): {
  lower: ForecastResult["forecast"] | null;
  upper: ForecastResult["forecast"] | null;
} {
  const entries = Object.entries(intervals);
  const levelText = String(level);
  const lowerEntry =
    entries.find(([key]) => key.toLowerCase().includes(`lo-${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`lower-${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`lo${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`lower${levelText}`));
  const upperEntry =
    entries.find(([key]) => key.toLowerCase().includes(`hi-${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`upper-${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`hi${levelText}`)) ??
    entries.find(([key]) => key.toLowerCase().includes(`upper${levelText}`));

  return {
    lower: lowerEntry?.[1] ?? null,
    upper: upperEntry?.[1] ?? null,
  };
}

export default function ForecastChart({ result }: ForecastChartProps) {
  if (!result) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[32px] border border-white/10 bg-white/6 p-8 text-center shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
        <div className="max-w-md">
          <p className="text-[11px] font-medium tracking-[0.28em] text-cyan-200 uppercase">
            Forecast canvas
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-white">Your forecast will appear here</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Upload a CSV, choose a numeric variable, and run the long-horizon forecast to render
            the history, projected trend, and uncertainty bands.
          </p>
        </div>
      </section>
    );
  }

  const traces: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: "Historical",
      x: result.historical.map((point) => point.timestamp),
      y: result.historical.map((point) => point.value),
      line: { color: "#cbd5e1", width: 2.2 },
    },
  ];

  for (const level of [95, 80]) {
    const pair = getIntervalPair(result.intervals, level);
    if (!pair.lower || !pair.upper) {
      continue;
    }

    traces.push(
      {
        type: "scatter",
        mode: "lines",
        x: pair.lower.map((point) => point.timestamp),
        y: pair.lower.map((point) => point.value),
        line: { color: "transparent" },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "lines",
        name: `${level}% interval`,
        x: pair.upper.map((point) => point.timestamp),
        y: pair.upper.map((point) => point.value),
        line: { color: "transparent" },
        fill: "tonexty",
        fillcolor: level === 95 ? "rgba(56,189,248,0.16)" : "rgba(125,211,252,0.28)",
      },
    );
  }

  traces.push({
    type: "scatter",
    mode: "lines+markers",
    name: "Forecast",
    x: result.forecast.map((point) => point.timestamp),
    y: result.forecast.map((point) => point.value),
    line: { color: "#22d3ee", width: 3 },
    marker: { color: "#67e8f9", size: 6 },
  });

  const layout: Partial<Layout> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 24, r: 24, b: 56, l: 56 },
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      x: 0,
      font: { color: "#cbd5e1" },
    },
    font: {
      color: "#e2e8f0",
      family: "var(--font-geist-sans)",
    },
    xaxis: {
      gridcolor: "rgba(148,163,184,0.12)",
      zerolinecolor: "rgba(148,163,184,0.12)",
      title: { text: "Time" },
    },
    yaxis: {
      gridcolor: "rgba(148,163,184,0.12)",
      zerolinecolor: "rgba(148,163,184,0.12)",
      title: { text: "Value" },
    },
    hovermode: "x unified",
  };

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/6 p-4 shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-cyan-200 uppercase">
            Forecast chart
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Historical trend and forecast</h3>
        </div>
        <div className="flex gap-3 text-xs text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
            Frequency: {result.requestMeta.freq}
          </span>
          <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
            Horizon: {result.requestMeta.horizon}
          </span>
        </div>
      </div>
      <Plot
        data={traces}
        layout={layout}
        config={{
          displaylogo: false,
          responsive: true,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
        }}
        className="h-[460px] w-full"
        useResizeHandler
      />
    </section>
  );
}
