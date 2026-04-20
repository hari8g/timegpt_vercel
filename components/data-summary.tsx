import type { ParsedCsvResult, ValidatedSeries } from "@/types/forecast";

interface DataSummaryProps {
  dataset: ParsedCsvResult;
  selectedTarget: string | null;
  validatedSeries: ValidatedSeries | null;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
      <p className="text-[11px] font-medium tracking-[0.24em] text-slate-400 uppercase">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export default function DataSummary({
  dataset,
  selectedTarget,
  validatedSeries,
}: DataSummaryProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-cyan-200 uppercase">
            Dataset profile
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">Auto-detected schema</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            The first column is treated as the time series index by default. Numeric columns become
            forecast candidates.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Rows" value={Intl.NumberFormat().format(dataset.rowCount)} />
        <StatCard label="Columns" value={String(dataset.headers.length)} />
        <StatCard label="Target Options" value={String(dataset.numericTargetColumns.length)} />
      </div>

      <div className="mt-6 rounded-2xl border border-white/8 bg-slate-950/35 p-4">
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1">
            Time: {dataset.defaultTimeColumn ?? "Not detected"}
          </span>
          {selectedTarget ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">
              Target: {selectedTarget}
            </span>
          ) : null}
          {validatedSeries?.freq ? (
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-1">
              Frequency: {validatedSeries.inferredFrequencyLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {dataset.columnProfiles.map((profile) => (
          <div
            key={profile.name}
            className="rounded-2xl border border-white/8 bg-black/15 p-4 text-sm text-slate-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{profile.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {profile.nonEmptyCount} non-empty values · kind: {profile.kind}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full bg-white/8 px-3 py-1">
                  Numeric {Math.round(profile.numericRatio * 100)}%
                </span>
                <span className="rounded-full bg-white/8 px-3 py-1">
                  Date {Math.round(profile.dateRatio * 100)}%
                </span>
              </div>
            </div>
            {profile.sampleValues.length > 0 ? (
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">
                Sample: {profile.sampleValues.join(", ")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
