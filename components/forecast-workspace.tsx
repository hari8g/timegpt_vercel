"use client";

import { AlertTriangle, DatabaseZap, LineChart, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import DataSummary from "@/components/data-summary";
import ForecastChart from "@/components/forecast-chart";
import ForecastControls from "@/components/forecast-controls";
import UploadDropzone from "@/components/upload-dropzone";
import { parseCsvFile } from "@/lib/csv";
import { requestForecast, DEFAULT_BASE_URL, DEFAULT_MODEL_NAME } from "@/lib/timegpt-client";
import { buildValidatedSeries } from "@/lib/time-series";
import type {
  FinetuneLoss,
  ForecastModel,
  ForecastResult,
  InterpolationMethod,
  ParsedCsvResult,
  ValidatedSeries,
} from "@/types/forecast";

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
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3 text-slate-500">
        {icon}
        <span className="text-[11px] font-medium tracking-[0.28em] uppercase text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-4 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function InlinePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium tracking-[0.18em] text-slate-500 uppercase">
      {children}
    </span>
  );
}

function MessagePanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "warning" | "danger";
}) {
  if (items.length === 0) {
    return null;
  }

  const styles = {
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];
  const Icon = AlertTriangle;

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
  interface EvalMetrics {
    mae: number;
    rmse: number;
    windows: number;
    points: number;
    note?: string;
  }

  const [fileName, setFileName] = useState<string | null>(null);
  const [dataset, setDataset] = useState<ParsedCsvResult | null>(null);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [horizon, setHorizon] = useState(24);
  const [selectedModel, setSelectedModel] = useState<ForecastModel>(DEFAULT_MODEL_NAME);
  const [interpolationMethod, setInterpolationMethod] = useState<InterpolationMethod>("none");
  const [cleanExFirst, setCleanExFirst] = useState(true);
  const [finetuneSteps, setFinetuneSteps] = useState(0);
  const [finetuneDepth, setFinetuneDepth] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [finetuneLoss, setFinetuneLoss] = useState<FinetuneLoss>("default");
  const [previousTuning, setPreviousTuning] = useState<{
    steps: number;
    depth: 1 | 2 | 3 | 4 | 5;
    loss: FinetuneLoss;
  } | null>(null);
  const [tuningFeedback, setTuningFeedback] = useState<string | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [comparisonForecastResult, setComparisonForecastResult] = useState<ForecastResult | null>(null);
  const [bestTuning, setBestTuning] = useState<{
    steps: number;
    depth: 1 | 2 | 3 | 4 | 5;
    loss: FinetuneLoss;
    mae: number;
    rmse: number;
  } | null>(null);
  const [lockBestTuning, setLockBestTuning] = useState(false);
  const [crossValidationMetrics, setCrossValidationMetrics] = useState<EvalMetrics | null>(null);
  const [latestImprovement, setLatestImprovement] = useState<{
    maeDelta: number;
    rmseDelta: number;
    maePct: number;
    rmsePct: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function clampDepth(value: number): 1 | 2 | 3 | 4 | 5 {
    if (value <= 1) {
      return 1;
    }
    if (value >= 5) {
      return 5;
    }
    return value as 1 | 2 | 3 | 4 | 5;
  }

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
        interpolationMethod,
      })
    );
  }, [dataset, horizon, interpolationMethod, selectedTarget]);

  const intervalsAvailable = useMemo(() => {
    if (!validatedSeries || validatedSeries.points.length < 61) {
      return false;
    }

    return true;
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

  const finetuneRecommendation = useMemo(() => {
    if (!crossValidationMetrics || !crossValidationMetrics.windows) {
      return null;
    }
    const { mae, rmse } = crossValidationMetrics;
    if (!Number.isFinite(mae) || !Number.isFinite(rmse)) {
      return null;
    }

    let recommendedSteps = finetuneSteps;
    let recommendedDepth: 1 | 2 | 3 | 4 | 5 = finetuneDepth;
    let rationale = "Use small fine-tuning adjustments and monitor MAE/RMSE after each run.";

    if (latestImprovement && (latestImprovement.maeDelta > 0 || latestImprovement.rmseDelta > 0)) {
      recommendedSteps = Math.max(0, finetuneSteps - 5);
      recommendedDepth = clampDepth(finetuneDepth - 1);
      rationale =
        "The last tuning attempt increased error. Roll back to a lighter setup before trying again.";
    } else if (rmse > 1.5 || mae > 1) {
      recommendedSteps = Math.min(80, finetuneSteps + 8);
      recommendedDepth = clampDepth(finetuneDepth + 1);
      rationale = "Error is high. Increase tuning gradually (not aggressively) to avoid overfitting.";
    } else if (rmse > 0.8 || mae > 0.5) {
      recommendedSteps = Math.min(60, finetuneSteps + 4);
      recommendedDepth = clampDepth(Math.min(4, finetuneDepth + 1));
      rationale = "Error is moderate. Apply a small increment and compare the next RMSE/MAE.";
    } else if (rmse <= 0.4 && mae <= 0.25) {
      recommendedSteps = Math.max(0, finetuneSteps - 2);
      recommendedDepth = clampDepth(finetuneDepth);
      rationale = "Error is already low. Keep tuning light to preserve generalization.";
    }

    return {
      steps: recommendedSteps,
      depth: recommendedDepth,
      rationale,
    };
  }, [crossValidationMetrics, finetuneDepth, finetuneSteps, latestImprovement]);

  const displayedCvMetrics = useMemo(() => {
    if (bestTuning && crossValidationMetrics) {
      return {
        mae: bestTuning.mae,
        rmse: bestTuning.rmse,
        windows: crossValidationMetrics.windows,
        points: crossValidationMetrics.points,
        source: "best" as const,
      };
    }

    if (crossValidationMetrics?.windows) {
      return {
        mae: crossValidationMetrics.mae,
        rmse: crossValidationMetrics.rmse,
        windows: crossValidationMetrics.windows,
        points: crossValidationMetrics.points,
        source: "latest" as const,
      };
    }

    return null;
  }, [bestTuning, crossValidationMetrics]);

  const forecastNarrative = useMemo(() => {
    if (!forecastResult || !validatedSeries || forecastResult.forecast.length === 0) {
      return null;
    }

    const firstForecast = forecastResult.forecast[0]?.value ?? 0;
    const lastForecast = forecastResult.forecast[forecastResult.forecast.length - 1]?.value ?? 0;
    const delta = lastForecast - firstForecast;
    const direction =
      delta > 0 ? "upward trend" : delta < 0 ? "downward trend" : "flat trend";
    const pctChange = firstForecast !== 0 ? (delta / Math.abs(firstForecast)) * 100 : 0;

    const intervalEntries = Object.entries(forecastResult.intervals);
    let uncertaintyText =
      "Prediction uncertainty is not available for this run because the interval band could not be computed.";
    if (intervalEntries.length > 0) {
      const lower = intervalEntries.find(([key]) => key.toLowerCase().includes("lo-95"))?.[1];
      const upper = intervalEntries.find(([key]) => key.toLowerCase().includes("hi-95"))?.[1];
      if (lower && upper && lower.length > 0 && upper.length > 0) {
        const avgBand =
          upper.reduce((sum, point, idx) => sum + Math.abs(point.value - (lower[idx]?.value ?? point.value)), 0) /
          upper.length;
        uncertaintyText = `The 95% confidence band suggests an average spread of about ${avgBand.toFixed(
          3,
        )} units around the forecast path.`;
      }
    }

    const cvText =
      displayedCvMetrics
        ? `Backtesting over ${displayedCvMetrics.windows} rolling window(s) shows ${
            displayedCvMetrics.source === "best" ? "best-so-far" : "latest"
          } MAE ${displayedCvMetrics.mae.toFixed(4)} and RMSE ${displayedCvMetrics.rmse.toFixed(4)}.`
        : "Cross-validation metrics are not yet available for this run.";

    const improvementText = latestImprovement
      ? `After applying the recommendation, MAE changed by ${latestImprovement.maeDelta.toFixed(
          4,
        )} (${latestImprovement.maePct.toFixed(2)}%) and RMSE changed by ${latestImprovement.rmseDelta.toFixed(
          4,
        )} (${latestImprovement.rmsePct.toFixed(2)}%). Negative values indicate improvement.`
      : "Apply a recommendation to track MAE/RMSE improvement between runs.";

    return {
      summary: `The model forecasts a ${direction} across the next ${forecastResult.requestMeta.horizon} periods (${pctChange.toFixed(
        2,
      )}% change from the first to last predicted point).`,
      context: `The forecast uses ${forecastResult.requestMeta.model} on ${validatedSeries.points.length} cleaned observations at ${validatedSeries.inferredFrequencyLabel.toLowerCase()} frequency.`,
      uncertaintyText,
      cvText,
      improvementText,
    };
  }, [displayedCvMetrics, forecastResult, latestImprovement, validatedSeries]);

  async function handleFileSelected(file: File) {
    setErrorMessage(null);
    setForecastResult(null);
    setComparisonForecastResult(null);
    setDataset(null);
    setSelectedTarget("");
    setCrossValidationMetrics(null);
    setLatestImprovement(null);
    setTuningFeedback(null);
    setPreviousTuning(null);
    setBestTuning(null);
    setLockBestTuning(false);
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

  async function evaluateCrossValidation(
    series: ValidatedSeries,
    tuning: { steps: number; depth: 1 | 2 | 3 | 4 | 5; loss: FinetuneLoss },
  ): Promise<EvalMetrics> {
    const points = series.points;
    const maxWindows = 3;

    if (points.length < horizon * 2 + 5) {
      return {
        mae: Number.NaN,
        rmse: Number.NaN,
        windows: 0,
        points: 0,
        note: "Need more history for cross-validation (at least ~2 horizons plus context).",
      };
    }

    const possibleWindows = Math.floor((points.length - horizon) / horizon);
    const windows = Math.max(1, Math.min(maxWindows, possibleWindows));

    const errors: number[] = [];
    let evaluatedPoints = 0;

    for (let back = windows; back >= 1; back -= 1) {
      const splitIndex = points.length - back * horizon;
      const train = points.slice(0, splitIndex);
      const test = points.slice(splitIndex, splitIndex + horizon);

      if (train.length < 3 || test.length === 0) {
        continue;
      }

      const cvForecast = await requestForecast({
        values: train.map((point) => point.value),
        historyTimestamps: train.map((point) => point.timestamp),
        futureTimestamps: test.map((point) => point.timestamp),
        freq: series.freq ?? "D",
        horizon: test.length,
        levels: [],
        model: selectedModel,
        cleanExFirst,
        finetuneSteps: tuning.steps,
        finetuneDepth: tuning.depth,
        finetuneLoss: tuning.loss,
      });

      cvForecast.forecast.forEach((predictedPoint, index) => {
        const actual = test[index]?.value;
        if (typeof actual === "number" && Number.isFinite(actual)) {
          errors.push(predictedPoint.value - actual);
          evaluatedPoints += 1;
        }
      });
    }

    if (errors.length === 0) {
      return {
        mae: Number.NaN,
        rmse: Number.NaN,
        windows: 0,
        points: 0,
        note: "Cross-validation could not be computed for this dataset.",
      };
    }

    const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
    const rmse = Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length);

    return {
      mae,
      rmse,
      windows,
      points: evaluatedPoints,
    };
  }

  async function runForecastWithTuning(tuning: {
    steps: number;
    depth: 1 | 2 | 3 | 4 | 5;
    loss: FinetuneLoss;
    baseline?: EvalMetrics | null;
    baselineForecast?: ForecastResult | null;
  }) {
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
        levels: intervalsAvailable ? [95] : [],
        model: selectedModel,
        cleanExFirst,
        finetuneSteps: tuning.steps,
        finetuneDepth: tuning.depth,
        finetuneLoss: tuning.loss,
      });

      setForecastResult(result);
      setComparisonForecastResult(tuning.baselineForecast ?? null);
      const newMetrics = await evaluateCrossValidation(validatedSeries, tuning);
      setCrossValidationMetrics(newMetrics);

      if (
        newMetrics.windows > 0 &&
        Number.isFinite(newMetrics.mae) &&
        Number.isFinite(newMetrics.rmse)
      ) {
        setBestTuning((existing) => {
          if (!existing) {
            return {
              steps: tuning.steps,
              depth: tuning.depth,
              loss: tuning.loss,
              mae: newMetrics.mae,
              rmse: newMetrics.rmse,
            };
          }
          const better =
            newMetrics.rmse < existing.rmse ||
            (newMetrics.rmse === existing.rmse && newMetrics.mae < existing.mae);
          if (!better) {
            return existing;
          }
          return {
            steps: tuning.steps,
            depth: tuning.depth,
            loss: tuning.loss,
            mae: newMetrics.mae,
            rmse: newMetrics.rmse,
          };
        });
      }

      if (
        tuning.baseline &&
        tuning.baseline.windows > 0 &&
        newMetrics.windows > 0 &&
        Number.isFinite(tuning.baseline.mae) &&
        Number.isFinite(tuning.baseline.rmse) &&
        Number.isFinite(newMetrics.mae) &&
        Number.isFinite(newMetrics.rmse)
      ) {
        const maeDelta = newMetrics.mae - tuning.baseline.mae;
        const rmseDelta = newMetrics.rmse - tuning.baseline.rmse;
        const maePct = tuning.baseline.mae !== 0 ? (maeDelta / tuning.baseline.mae) * 100 : 0;
        const rmsePct = tuning.baseline.rmse !== 0 ? (rmseDelta / tuning.baseline.rmse) * 100 : 0;

        setLatestImprovement({
          maeDelta,
          rmseDelta,
          maePct,
          rmsePct,
        });

        if (maeDelta > 0 || rmseDelta > 0) {
          setTuningFeedback(
            "This tuning run increased MAE/RMSE. Try reverting to the previous settings or use a lighter tuning increment.",
          );
        } else {
          setTuningFeedback(
            "Great — this tuning run improved MAE/RMSE. You can keep these settings or fine-tune further in small increments.",
          );
        }
      } else {
        setLatestImprovement(null);
        setTuningFeedback(null);
      }
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

  async function generateForecast() {
    if (lockBestTuning && bestTuning) {
      setFinetuneSteps(bestTuning.steps);
      setFinetuneDepth(bestTuning.depth);
      setFinetuneLoss(bestTuning.loss);
      await runForecastWithTuning({
        steps: bestTuning.steps,
        depth: bestTuning.depth,
        loss: bestTuning.loss,
      });
      return;
    }

    await runForecastWithTuning({
      steps: finetuneSteps,
      depth: finetuneDepth,
      loss: finetuneLoss,
    });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="rounded-[36px] border border-slate-200 bg-white px-6 py-8 shadow-[0_28px_90px_rgba(15,23,42,0.06)] sm:px-8 lg:px-10">
          <div className="flex flex-col gap-6">
            <div className="max-w-3xl">
              <p className="text-[11px] font-medium tracking-[0.36em] text-slate-400 uppercase">
                TimeGPT Forecast Studio
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-[3.25rem]">
                Transform your time series into clear, decision-ready forecasts.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                Upload your CSV, choose the target signal, and let TimeGPT generate a refined
                forecast with interpretable confidence bands, backtest metrics, and tuning guidance.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <InlinePill>Model: {selectedModel}</InlinePill>
              <InlinePill>Endpoint: {DEFAULT_BASE_URL}</InlinePill>
              <InlinePill>Interpolation: {interpolationMethod}</InlinePill>
            </div>
          </div>
        </section>

        <div className="mt-8">
          <UploadDropzone fileName={fileName} onFileSelected={handleFileSelected} disabled={isLoading} />
        </div>

        {errorMessage ? (
          <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-900">
            {errorMessage}
          </div>
        ) : null}

        {dataset ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
              <ForecastControls
                targetOptions={dataset.numericTargetColumns}
                selectedTarget={selectedTarget}
                horizon={horizon}
                selectedModel={selectedModel}
                interpolationMethod={interpolationMethod}
                cleanExFirst={cleanExFirst}
                intervalsEnabled={intervalsAvailable}
                onTargetChange={setSelectedTarget}
                onHorizonChange={(value) => setHorizon(Math.max(1, Math.min(365, value || 1)))}
                onModelChange={setSelectedModel}
                onInterpolationMethodChange={setInterpolationMethod}
                onCleanExFirstChange={setCleanExFirst}
                onGenerate={generateForecast}
                disabled={!dataset}
                isLoading={isLoading}
              />
              <DataSummary
                dataset={dataset}
                selectedTarget={selectedTarget}
                validatedSeries={validatedSeries}
              />
            </aside>

            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  icon={<LineChart className="h-5 w-5" />}
                  label="Observations"
                  value={String(validatedSeries?.points.length ?? 0)}
                  helper="Usable history retained after validation."
                />
                <MetricCard
                  icon={<Sparkles className="h-5 w-5" />}
                  label="Model mode"
                  value={selectedModel === "timegpt-1" ? "Short-term" : "Long-term"}
                  helper="Switch between short-term and long-horizon forecasting."
                />
                <MetricCard
                  icon={<DatabaseZap className="h-5 w-5" />}
                  label="Output Tokens"
                  value={String(forecastResult?.outputTokens ?? 0)}
                  helper="Returned by the model after the latest forecast."
                />
              </div>

              <ForecastChart result={forecastResult} comparisonResult={comparisonForecastResult} />

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
                  Fine-tuning setup
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  Configure fine-tuning before evaluation
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Increase fine-tune steps gradually and monitor RMSE. Larger steps can improve fit
                  but may overfit noisy datasets.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">
                      Finetune steps
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={finetuneSteps}
                      onChange={(event) =>
                        setFinetuneSteps(Math.max(0, Number(event.target.value) || 0))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">
                      Finetune depth
                    </span>
                    <select
                      value={finetuneDepth}
                      onChange={(event) =>
                        setFinetuneDepth(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300"
                    >
                      {[1, 2, 3, 4, 5].map((depth) => (
                        <option key={depth} value={depth}>
                          {depth}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium tracking-[0.18em] text-slate-400 uppercase">
                      Finetune loss
                    </span>
                    <select
                      value={finetuneLoss}
                      onChange={(event) => setFinetuneLoss(event.target.value as FinetuneLoss)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300"
                    >
                      {["default", "mae", "mse", "rmse", "mape", "smape"].map((loss) => (
                        <option key={loss} value={loss}>
                          {loss}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {finetuneRecommendation ? (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                    <p className="text-[11px] font-medium tracking-[0.2em] text-sky-700 uppercase">
                      Recommended from MAE/RMSE
                    </p>
                    <p className="mt-2 text-sm text-sky-900">
                      Suggested `finetune_steps`: <strong>{finetuneRecommendation.steps}</strong> and
                      `finetune_depth`: <strong>{finetuneRecommendation.depth}</strong>.
                    </p>
                    <p className="mt-2 text-sm text-sky-900">{finetuneRecommendation.rationale}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        setPreviousTuning({
                          steps: finetuneSteps,
                          depth: finetuneDepth,
                          loss: finetuneLoss,
                        });
                        const baseline = crossValidationMetrics;
                        const baselineForecast = forecastResult;
                        setFinetuneSteps(finetuneRecommendation.steps);
                        setFinetuneDepth(finetuneRecommendation.depth);
                        await runForecastWithTuning({
                          steps: finetuneRecommendation.steps,
                          depth: finetuneRecommendation.depth,
                          loss: finetuneLoss,
                          baseline,
                          baselineForecast,
                        });
                      }}
                      disabled={isLoading}
                      className="mt-3 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "Applying..." : "Apply recommendation"}
                    </button>
                    {previousTuning ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const baseline = crossValidationMetrics;
                          const baselineForecast = forecastResult;
                          setFinetuneSteps(previousTuning.steps);
                          setFinetuneDepth(previousTuning.depth);
                          setFinetuneLoss(previousTuning.loss);
                          await runForecastWithTuning({
                            steps: previousTuning.steps,
                            depth: previousTuning.depth,
                            loss: previousTuning.loss,
                            baseline,
                            baselineForecast,
                          });
                        }}
                        disabled={isLoading}
                        className="ml-2 mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Revert previous tuning
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {tuningFeedback ? (
                  <p className="mt-3 text-sm text-slate-700">{tuningFeedback}</p>
                ) : null}

                {bestTuning ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    Best-so-far: steps <strong>{bestTuning.steps}</strong>, depth{" "}
                    <strong>{bestTuning.depth}</strong>, loss <strong>{bestTuning.loss}</strong>,
                    RMSE <strong>{bestTuning.rmse.toFixed(4)}</strong>, MAE{" "}
                    <strong>{bestTuning.mae.toFixed(4)}</strong>.
                  </div>
                ) : null}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
                  Cross-validation evaluation
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  Best MAE and RMSE backtest metrics
                </h3>
                <label className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span>Lock to best-so-far tuning (this session)</span>
                  <input
                    type="checkbox"
                    checked={lockBestTuning}
                    onChange={(event) => setLockBestTuning(event.target.checked)}
                    className="h-4 w-4 accent-slate-900"
                  />
                </label>
                {displayedCvMetrics ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        MAE {displayedCvMetrics.source === "best" ? "(best)" : "(latest)"}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {displayedCvMetrics.mae.toFixed(4)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">
                        RMSE {displayedCvMetrics.source === "best" ? "(best)" : "(latest)"}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {displayedCvMetrics.rmse.toFixed(4)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Windows</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {displayedCvMetrics.windows}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Evaluated points</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {displayedCvMetrics.points}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    {crossValidationMetrics?.note ??
                      "Run a forecast to compute rolling cross-validation metrics."}
                  </p>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
                  Prediction interpretation
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  What this forecast means
                </h3>
                {forecastNarrative ? (
                  <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
                    <p>{forecastNarrative.summary}</p>
                    <p>{forecastNarrative.context}</p>
                    <p>{forecastNarrative.uncertaintyText}</p>
                    <p>{forecastNarrative.cvText}</p>
                    <p>{forecastNarrative.improvementText}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Generate a forecast to see a plain-language interpretation of trend, uncertainty,
                    and backtest quality.
                  </p>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
                <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
                  Predicted values table
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  Predicted target with forecast timestamps
                </h3>
                {forecastResult ? (
                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-4 py-3 font-medium">Timestamp</th>
                            <th className="px-4 py-3 font-medium">Predicted value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                          {forecastResult.forecast.map((point) => (
                            <tr key={point.timestamp}>
                              <td className="px-4 py-3 whitespace-nowrap">{point.timestamp}</td>
                              <td className="px-4 py-3">{point.value.toFixed(6)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Generate a forecast to display predicted values and aligned future timestamps.
                  </p>
                )}
              </section>

              <div className="grid gap-4">
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
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
