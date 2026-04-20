"use client";

import { FileUp, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

interface UploadDropzoneProps {
  disabled?: boolean;
  fileName?: string | null;
  onFileSelected: (file: File) => void;
}

export default function UploadDropzone({
  disabled = false,
  fileName,
  onFileSelected,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || disabled) {
      return;
    }
    onFileSelected(file);
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.06)]">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`group flex min-h-[250px] cursor-pointer flex-col items-center justify-center rounded-[26px] border border-dashed px-8 py-10 text-center transition ${
          isDragging
            ? "border-sky-400 bg-sky-50"
            : "border-slate-200 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.05),transparent_46%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] hover:border-slate-300 hover:bg-slate-50"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm">
          {fileName ? <FileUp className="h-7 w-7" /> : <UploadCloud className="h-7 w-7" />}
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {fileName ? "Replace your dataset" : "Upload a CSV to start forecasting"}
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">
          Drag and drop a CSV, or click to browse. The app will profile your columns, use the
          first column as the time axis, and surface forecastable numeric variables automatically.
        </p>
        <div className="mt-6 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-medium tracking-[0.24em] text-slate-500 uppercase">
          {fileName ? fileName : "CSV only"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => handleFiles(event.target.files)}
          className="hidden"
        />
      </div>
    </section>
  );
}
