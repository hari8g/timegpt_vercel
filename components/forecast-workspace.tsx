"use client";

import { AlertTriangle, CheckCircle2, DatabaseZap, LineChart, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import DataSummary from "@/components/data-summary";
import DataTablePreview from "@/components/data-table-preview";
import ForecastChart from "@/components/forecast-chart";
import ForecastControls from "@/components/forecast-controls";
import UploadDropzone from "@/components/upload-dropzone";
import { parseCsvFile } from "@/lib/csv";
import { requestForecast, DEFAULT_BASE_URL, MODEL_NAME } from "@/lib/timegpt-client";
import { buildValidatedSeries } from "@/lib/time-series";
import type { ForecastResult, ParsedCsvResult, ValidatedSeries } from "@/types/forecast";

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="flex items-center gap-3 text-cyan-200">
        {icon}
        <span className="text-[11px] font-medium tracking-[0.28em] uppercase text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

function MessagePanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "warning" | "danger" | "success";
}) {
  if (items.length === 0) {
    return null;
  }

  const styles = {
    warning: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    danger: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
  }[tone];

  const Icon = tone === "danger" ? AlertTriangle : tone === "warning" ? AlertTriangle : CheckCircle2;

  return (
    <div className={`rounded-[24px] border p-5 ${styles}`}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <h4 className="font-medium">{title}</h4>
      </div>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ForecastWorkspace() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataset, setDataset] = useState<ParsedCsvResult | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [horizon, setHorizon] = useState(24);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validatedSeries = useMemo<ValidatedSeries | null>(() => {
    if (!dataset || !selectedTarget) {
      return null;
    }

    return (
      buildValidatedSeries({
        rows: dataset.rows,
        timeColumn: dataset.defaultTimeColumn ?? "",
        targetColumn: selectedTarget,
        horizon,
      })
    );
  }, [dataset, horizon, selectedTarget]);

  const successHints = useMemo(() => {
    if (!dataset || !validatedSeries || validatedSeries.quality.blockingIssues.length > 0) {
      return [];
    }

    return [
      `Time column detected as ${validatedSeries.timeColumn}.`,
      `Target column ready: ${validatedSeries.targetColumn}.`,
      `Inferred frequency: ${validatedSeries.inferredFrequencyLabel}.`,
    ];
  }, [dataset, validatedSeries]);

  const intervalLevels = useMemo(() => {
    if (!validatedSeries || validatedSeries.points.length < 61) {
      return [];
    }

    return [80, 95];
  }, [validatedSeries]);

  const runtimeWarnings = useMemo(() => {
    const warnings = [...(validatedSeries?.quality.warnings ?? [])];
    if (validatedSeries && validatedSeries.points.length < 61) {
      warnings.push(
        "Prediction intervals were disabled for this series because the endpoint requires at least 61 valid samples for interval bands.",
      );
    }
    return warnings;
  }, [validatedSeries]);

  async function handleFileSelected(file: File) {
    setErrorMessage(null);
    setForecastResult(null);
    setDataset(null);
    setSelectedTarget("");
    setFileName(file.name);

    try {
      const parsed = await parseCsvFile(file);
      setDataset(parsed);

      if (parsed.numericTargetColumns.length === 0) {
        throw new Error(
          "No forecastable numeric columns were found. Keep the first column as time and include at least one numeric variable.",
        );
      }

      setSelectedTarget(parsed.numericTargetColumns[0]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to process the uploaded CSV.");
    }
  }

  async function generateForecast() {
    if (!validatedSeries) {
      setErrorMessage("Upload a CSV and choose a valid target before generating a forecast.");
      return;
    }

    if (validatedSeries.quality.blockingIssues.length > 0 || !validatedSeries.freq) {
      setErrorMessage("Resolve the data issues shown below before requesting a forecast.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await requestForecast({
        values: validatedSeries.points.map((point) => point.value),
        historyTimestamps: validatedSeries.points.map((point) => point.timestamp),
        futureTimestamps: validatedSeries.futureTimestamps,
        freq: validatedSeries.freq,
        horizon,
        levels: intervalLevels,
      });

      setForecastResult(result);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The forecast request failed. Check your endpoint availability and CORS settings.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#111827_100%)] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[36px] border border-white/10 bg-white/6 px-6 py-8 shadow-[0_24px_90px_rgba(2,6,23,0.45)] backdrop-blur sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-medium tracking-[0.36em] text-cyan-200 uppercase">
                TimeGPT Forecast Studio
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Upload a CSV, auto-profile the series, and generate a polished long-horizon
                forecast.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Built for Vercel with a minimal analytics-first interface. The app treats the first
                CSV column as time, lets you choose a numeric target, and sends the series to your
                TimeGPT endpoint for forecasting.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                icon={<Sparkles className="h-5 w-5" />}
                label="Model"
                value={MODEL_NAME}
                helper="Locked to the long-horizon TimeGPT model."
              />
              <MetricCard
                icon={<DatabaseZap className="h-5 w-5" />}
                label="Endpoint"
                value={DEFAULT_BASE_URL}
                helper="Direct locally, with HTTPS-safe proxy fallback on deployment."
              />
            </div>
          </div>
        </section>

        <div className="mt-8">
          <UploadDropzone fileName={fileName} onFileSelected={handleFileSelected} disabled={isLoading} />
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-[24px] border border-rose-400/20 bg-rose-400/10 p-5 text-sm leading-6 text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        {dataset ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-6">
              <ForecastControls
                targetOptions={dataset.numericTargetColumns}
                selectedTarget={selectedTarget}
                horizon={horizon}
                intervalsEnabled={intervalLevels.length > 0}
                onTargetChange={setSelectedTarget}
                onHorizonChange={(value) => setHorizon(Math.max(1, Math.min(365, value || 1)))}
                onGenerate={generateForecast}
                disabled={!dataset}
                isLoading={isLoading}
              />
              <DataSummary
                dataset={dataset}
                selectedTarget={selectedTarget}
                validatedSeries={validatedSeries}
              />
            </div>

            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  icon={<LineChart className="h-5 w-5" />}
                  label="Observations"
                  value={String(validatedSeries?.points.length ?? 0)}
                  helper="Valid points kept after parsing."
                />
                <MetricCard
                  icon={<Sparkles className="h-5 w-5" />}
                  label="Forecast Horizon"
                  value={String(horizon)}
                  helper="Future steps generated locally before plotting."
                />
                <MetricCard
                  icon={<DatabaseZap className="h-5 w-5" />}
                  label="Output Tokens"
                  value={String(forecastResult?.outputTokens ?? 0)}
                  helper="Returned by the model after inference."
                />
              </div>

              <ForecastChart result={forecastResult} />

              <div className="grid gap-4 xl:grid-cols-2">
                <MessagePanel
                  title="Ready to forecast"
                  items={successHints}
                  tone="success"
                />
                <MessagePanel
                  title="Warnings"
                  items={runtimeWarnings}
                  tone="warning"
                />
              </div>

              <MessagePanel
                title="Blocking data issues"
                items={validatedSeries?.quality.blockingIssues ?? []}
                tone="danger"
              />

              <DataTablePreview dataset={dataset} />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
