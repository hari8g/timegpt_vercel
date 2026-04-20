"use client";

import Papa from "papaparse";

import type { ColumnKind, ColumnProfile, CsvRow, CsvValue, ParsedCsvResult } from "@/types/forecast";

const SAMPLE_LIMIT = 5;

function normalizeHeader(header: string, index: number) {
  const trimmed = header.trim();
  return trimmed.length > 0 ? trimmed : `column_${index + 1}`;
}

function normalizeCell(value: unknown): CsvValue {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isNumericValue(value: string | null) {
  if (value === null) {
    return false;
  }

  const normalized = value.replaceAll(",", "");
  return normalized.length > 0 && Number.isFinite(Number(normalized));
}

function isDateValue(value: string | null) {
  if (value === null) {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

function detectColumnKind(nonEmptyCount: number, numericRatio: number, dateRatio: number): ColumnKind {
  if (nonEmptyCount === 0) {
    return "empty";
  }

  if (dateRatio >= 0.8) {
    return "datetime";
  }

  if (numericRatio >= 0.9) {
    return "numeric";
  }

  if (numericRatio === 0 && dateRatio === 0) {
    return "text";
  }

  return "mixed";
}

function buildColumnProfiles(headers: string[], rows: CsvRow[]): ColumnProfile[] {
  return headers.map((header) => {
    let nonEmptyCount = 0;
    let numericCount = 0;
    let dateCount = 0;
    const samples: string[] = [];

    for (const row of rows) {
      const value = row[header];
      if (value === null) {
        continue;
      }

      nonEmptyCount += 1;
      if (samples.length < SAMPLE_LIMIT) {
        samples.push(value);
      }
      if (isNumericValue(value)) {
        numericCount += 1;
      }
      if (isDateValue(value)) {
        dateCount += 1;
      }
    }

    const numericRatio = nonEmptyCount > 0 ? numericCount / nonEmptyCount : 0;
    const dateRatio = nonEmptyCount > 0 ? dateCount / nonEmptyCount : 0;

    return {
      name: header,
      kind: detectColumnKind(nonEmptyCount, numericRatio, dateRatio),
      nonEmptyCount,
      numericRatio,
      dateRatio,
      sampleValues: samples,
    };
  });
}

export async function parseCsvFile(file: File): Promise<ParsedCsvResult> {
  const text = await file.text();

  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "Unable to parse the CSV file.");
  }

  const rawRows = result.data.filter((row) =>
    Object.values(row).some((value) => normalizeCell(value) !== null),
  );

  const headers = (result.meta.fields ?? []).map(normalizeHeader);

  if (headers.length === 0) {
    throw new Error("The CSV file does not contain any columns.");
  }

  const rows = rawRows.map((row) => {
    const normalizedEntries = headers.map((header) => [header, normalizeCell(row[header])] as const);
    return Object.fromEntries(normalizedEntries) as CsvRow;
  });

  if (rows.length === 0) {
    throw new Error("The CSV file does not contain any data rows.");
  }

  const columnProfiles = buildColumnProfiles(headers, rows);
  const defaultTimeColumn = headers[0] ?? null;
  const numericTargetColumns = columnProfiles
    .filter((profile) => profile.name !== defaultTimeColumn && profile.numericRatio >= 0.9)
    .map((profile) => profile.name);

  return {
    headers,
    rows,
    previewRows: rows.slice(0, 8),
    columnProfiles,
    defaultTimeColumn,
    numericTargetColumns,
    rowCount: rows.length,
  };
}
