"use client";

import dynamic from "next/dynamic";
import type { Data, Layout } from "plotly.js";

import type { ForecastResult } from "@/types/forecast";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface ForecastChartProps {
  result: ForecastResult | null;
  comparisonResult?: ForecastResult | null;
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

export default function ForecastChart({ result, comparisonResult = null }: ForecastChartProps) {
  if (!result) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
        <div className="max-w-md">
          <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
            Forecast canvas
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">Your forecast will appear here</h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Upload a CSV, choose a numeric variable, and run the long-horizon forecast to render
            the history, projected trend, and uncertainty bands.
          </p>
        </div>
      </section>
    );
  }

  const historyWindowSize = Math.min(
    result.historical.length,
    Math.max(result.requestMeta.horizon * 3, 40),
  );
  const historicalWindow = result.historical.slice(-historyWindowSize);

  const traces: Data[] = [
    {
      type: "scatter",
      mode: "lines",
      name: `Historical (last ${historyWindowSize})`,
      x: historicalWindow.map((point) => point.timestamp),
      y: historicalWindow.map((point) => point.value),
      line: { color: "#64748b", width: 2.4 },
    },
  ];

  for (const level of [95]) {
    const pair = getIntervalPair(result.intervals, level);
    if (!pair.lower || !pair.upper) {
      continue;
    }

    traces.push(
      {
        type: "scatter",
        mode: "lines",
        name: `${level}% lower`,
        x: pair.lower.map((point) => point.timestamp),
        y: pair.lower.map((point) => point.value),
        line: { color: "rgba(0,0,0,0)", width: 0 },
        hoverinfo: "skip",
        showlegend: false,
      },
      {
        type: "scatter",
        mode: "lines",
        name: `${level}% interval`,
        x: pair.upper.map((point) => point.timestamp),
        y: pair.upper.map((point) => point.value),
        line: { color: "rgba(0,0,0,0)", width: 0 },
        fill: "tonexty",
        fillcolor: "rgba(14,165,233,0.15)",
        hovertemplate: `${level}% confidence interval<extra></extra>`,
      },
    );
  }

  const lastHistoricalPoint = historicalWindow[historicalWindow.length - 1];
  const firstForecastPoint = result.forecast[0];

  if (lastHistoricalPoint && firstForecastPoint) {
    traces.push({
      type: "scatter",
      mode: "lines",
      name: "Transition",
      x: [lastHistoricalPoint.timestamp, firstForecastPoint.timestamp],
      y: [lastHistoricalPoint.value, firstForecastPoint.value],
      line: { color: "#0ea5e9", width: 2, dash: "dot" },
      hoverinfo: "skip",
      showlegend: false,
    });
  }

  traces.push({
    type: "scatter",
    mode: "lines+markers",
    name: "Forecast",
    x: result.forecast.map((point) => point.timestamp),
    y: result.forecast.map((point) => point.value),
    line: { color: "#0f172a", width: 3 },
    marker: { color: "#0ea5e9", size: 6, line: { color: "#ffffff", width: 1.5 } },
    hovertemplate: "Forecast: %{y:.3f}<extra></extra>",
  });

  if (comparisonResult) {
    traces.push({
      type: "scatter",
      mode: "lines",
      name: "Previous forecast",
      x: comparisonResult.forecast.map((point) => point.timestamp),
      y: comparisonResult.forecast.map((point) => point.value),
      line: { color: "#f59e0b", width: 2.5, dash: "dash" },
      hovertemplate: "Previous: %{y:.3f}<extra></extra>",
    });
  }

  const layout: Partial<Layout> = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 16, r: 24, b: 56, l: 56 },
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      x: 0,
      font: { color: "#475569", size: 12 },
    },
    font: {
      color: "#334155",
      family: "var(--font-geist-sans)",
    },
    xaxis: {
      gridcolor: "rgba(148,163,184,0.14)",
      zerolinecolor: "rgba(148,163,184,0.14)",
      linecolor: "rgba(148,163,184,0.25)",
      tickfont: { color: "#64748b" },
      title: { text: "Time" },
    },
    yaxis: {
      gridcolor: "rgba(148,163,184,0.14)",
      zerolinecolor: "rgba(148,163,184,0.14)",
      linecolor: "rgba(148,163,184,0.25)",
      tickfont: { color: "#64748b" },
      title: { text: "Value" },
    },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor: "#ffffff",
      bordercolor: "#dbeafe",
      font: { color: "#0f172a" },
    },
  };

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
            Forecast chart
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900">Forecast-focused trend view</h3>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Frequency: {result.requestMeta.freq}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Horizon: {result.requestMeta.horizon}
          </span>
          {Object.keys(result.intervals).length > 0 ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
              95% confidence interval
            </span>
          ) : null}
          {comparisonResult ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
              Overlay: previous vs current forecast
            </span>
          ) : null}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
            Zoomed: last {historyWindowSize} history points
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

      <div className="mt-4 grid gap-4 border-t border-slate-100 px-4 pt-4 md:grid-cols-[1fr_320px]">
        <div className="text-sm text-slate-500">
          SHAP view summarizes feature contribution strength from the model response. Larger bars
          indicate stronger average absolute contribution.
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-medium tracking-[0.22em] text-slate-400 uppercase">
            SHAP contributions
          </p>
          {result.shapSummary.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              No SHAP values returned for this request. This is expected when no exogenous features
              are provided.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {result.shapSummary.map((item) => {
                const max = result.shapSummary[0]?.contribution || 1;
                const width = Math.max(8, (item.contribution / max) * 100);
                return (
                  <div key={item.feature}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                      <span>{item.feature}</span>
                      <span>{item.contribution.toFixed(4)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white">
                      <div
                        className="h-2 rounded-full bg-sky-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
