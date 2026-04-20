import type { ParsedCsvResult } from "@/types/forecast";

interface DataTablePreviewProps {
  dataset: ParsedCsvResult;
}

export default function DataTablePreview({ dataset }: DataTablePreviewProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-[0_16px_60px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-cyan-200 uppercase">
            Data preview
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">First eight rows</h3>
        </div>
        <p className="text-xs text-slate-400">Showing a quick preview of the uploaded CSV</p>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left text-sm">
            <thead className="bg-white/8 text-slate-300">
              <tr>
                {dataset.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 bg-slate-950/30 text-slate-200">
              {dataset.previewRows.map((row, index) => (
                <tr key={`${index}-${row[dataset.headers[0]] ?? "row"}`}>
                  {dataset.headers.map((header) => (
                    <td key={header} className="max-w-[220px] truncate px-4 py-3">
                      {row[header] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
