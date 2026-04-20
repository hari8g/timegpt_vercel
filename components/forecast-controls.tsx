interface ForecastControlsProps {
  targetOptions: string[];
  selectedTarget: string;
  horizon: number;
  intervalsEnabled: boolean;
  onTargetChange: (value: string) => void;
  onHorizonChange: (value: number) => void;
  onGenerate: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export default function ForecastControls({
  targetOptions,
  selectedTarget,
  horizon,
  intervalsEnabled,
  onTargetChange,
  onHorizonChange,
  onGenerate,
  disabled = false,
  isLoading = false,
}: ForecastControlsProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
      <div>
        <p className="text-[11px] font-medium tracking-[0.28em] text-cyan-200 uppercase">
          Forecast controls
        </p>
        <h3 className="mt-2 text-xl font-semibold text-white">Choose the variable to forecast</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          The app keeps the first CSV column as the time index and sends only the selected numeric
          target to the long-horizon TimeGPT endpoint.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-medium tracking-[0.22em] text-slate-400 uppercase">
            Forecast target
          </span>
          <select
            value={selectedTarget}
            onChange={(event) => onTargetChange(event.target.value)}
            disabled={disabled || targetOptions.length === 0}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          >
            {targetOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-medium tracking-[0.22em] text-slate-400 uppercase">
            Forecast horizon
          </span>
          <input
            type="number"
            min={1}
            max={365}
            value={horizon}
            onChange={(event) => onHorizonChange(Number(event.target.value))}
            disabled={disabled}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
          />
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-white/8 bg-slate-950/35 p-4 text-sm text-slate-300">
        {intervalsEnabled
          ? "Prediction intervals are requested at 80% and 95%, and the model is fixed to timegpt-1-long-horizon."
          : "Short histories can still forecast, but the app will skip interval bands until the series has enough samples."}
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={disabled || isLoading || targetOptions.length === 0}
        className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Generating forecast..." : "Generate forecast"}
      </button>
    </section>
  );
}
