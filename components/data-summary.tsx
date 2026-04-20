import type { ParsedCsvResult, ValidatedSeries } from "@/types/forecast";

interface DataSummaryProps {
  dataset: ParsedCsvResult;
  selectedTarget: string | null;
  validatedSeries: ValidatedSeries | null;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-medium tracking-[0.24em] text-slate-400 uppercase">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function DataSummary({
  dataset,
  selectedTarget,
  validatedSeries,
}: DataSummaryProps) {
  const compactProfiles = dataset.columnProfiles.slice(0, 4);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
            Series summary
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">Detected structure</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            A compact view of the uploaded dataset and the columns most relevant to forecasting.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Rows" value={Intl.NumberFormat().format(dataset.rowCount)} />
        <StatCard label="Columns" value={String(dataset.headers.length)} />
        <StatCard label="Target Options" value={String(dataset.numericTargetColumns.length)} />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1">
            Time: {dataset.defaultTimeColumn ?? "Not detected"}
          </span>
          {selectedTarget ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1">
              Target: {selectedTarget}
            </span>
          ) : null}
          {validatedSeries?.freq ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1">
              Frequency: {validatedSeries.inferredFrequencyLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {compactProfiles.map((profile) => (
          <div
            key={profile.name}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{profile.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {profile.nonEmptyCount} non-empty values · kind: {profile.kind}
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  Numeric {Math.round(profile.numericRatio * 100)}%
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  Date {Math.round(profile.dateRatio * 100)}%
                </span>
              </div>
            </div>
            {profile.sampleValues.length > 0 ? (
              <p className="mt-2 line-clamp-1 text-xs leading-5 text-slate-400">
                Sample: {profile.sampleValues.join(", ")}
              </p>
            ) : null}
          </div>
        ))}

        {dataset.columnProfiles.length > compactProfiles.length ? (
          <p className="text-xs text-slate-400">
            Showing {compactProfiles.length} of {dataset.columnProfiles.length} columns here. Full data remains available in the preview table below.
          </p>
        ) : null}
      </div>
    </section>
  );
}
