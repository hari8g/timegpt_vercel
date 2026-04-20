export type CsvValue = string | null;

export type CsvRow = Record<string, CsvValue>;

export type ColumnKind = "datetime" | "numeric" | "text" | "empty" | "mixed";

export interface ColumnProfile {
  name: string;
  kind: ColumnKind;
  nonEmptyCount: number;
  numericRatio: number;
  dateRatio: number;
  sampleValues: string[];
}

export interface ParsedCsvResult {
  headers: string[];
  rows: CsvRow[];
  previewRows: CsvRow[];
  columnProfiles: ColumnProfile[];
  defaultTimeColumn: string | null;
  numericTargetColumns: string[];
  rowCount: number;
}

export interface SeriesPoint {
  timestamp: string;
  value: number;
}

export interface SeriesQualityReport {
  blockingIssues: string[];
  warnings: string[];
  missingTargetCount: number;
  duplicateTimestampCount: number;
  gapCount: number;
  sortedInput: boolean;
}

export interface ValidatedSeries {
  timeColumn: string;
  targetColumn: string;
  freq: string | null;
  inferredFrequencyLabel: string;
  points: SeriesPoint[];
  futureTimestamps: string[];
  quality: SeriesQualityReport;
}

export interface ForecastRequestInput {
  values: number[];
  freq: string;
  horizon: number;
  levels: number[];
}

export interface TimeGptApiResponse {
  input_tokens: number;
  output_tokens: number;
  finetune_tokens: number;
  mean: number[];
  intervals?: Record<string, number[]> | null;
}

export interface ForecastPoint {
  timestamp: string;
  value: number;
}

export interface ForecastResult {
  historical: ForecastPoint[];
  forecast: ForecastPoint[];
  intervals: Record<string, ForecastPoint[]>;
  inputTokens: number;
  outputTokens: number;
  finetuneTokens: number;
  requestMeta: {
    horizon: number;
    freq: string;
    model: "timegpt-1-long-horizon";
    baseUrl: string;
  };
}
