import type { ParsedCsvResult } from "@/types/forecast";

interface DataTablePreviewProps {
  dataset: ParsedCsvResult;
}

export default function DataTablePreview({ dataset }: DataTablePreviewProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium tracking-[0.28em] text-slate-400 uppercase">
            Data preview
          </p>
          <h3 className="mt-2 text-xl font-semibold text-slate-900">First eight rows</h3>
        </div>
        <p className="text-xs text-slate-400">Showing a quick preview of the uploaded CSV</p>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {dataset.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {dataset.previewRows.map((row, index) => (
                <tr key={`${index}-${row[dataset.headers[0]] ?? "row"}`} className="hover:bg-slate-50">
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
