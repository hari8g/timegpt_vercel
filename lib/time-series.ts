"use client";

import type { CsvRow, SeriesPoint, ValidatedSeries } from "@/types/forecast";

interface BuildSeriesOptions {
  rows: CsvRow[];
  timeColumn: string;
  targetColumn: string;
  horizon: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNumericValue(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatIso(date: Date) {
  return date.toISOString();
}

function sameDayOfMonthStep(current: Date, next: Date) {
  const expected = new Date(current);
  expected.setUTCMonth(expected.getUTCMonth() + 1);
  return (
    expected.getUTCFullYear() === next.getUTCFullYear() &&
    expected.getUTCMonth() === next.getUTCMonth() &&
    expected.getUTCDate() === next.getUTCDate()
  );
}

function lastDayOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function sameMonthEndStep(current: Date, next: Date) {
  const currentIsMonthEnd = current.getUTCDate() === lastDayOfMonth(current);
  const nextIsMonthEnd = next.getUTCDate() === lastDayOfMonth(next);
  if (!currentIsMonthEnd || !nextIsMonthEnd) {
    return false;
  }

  const expected = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 2, 0));
  return expected.getTime() === next.getTime();
}

function inferFrequency(dates: Date[]) {
  if (dates.length < 2) {
    return { freq: null, label: "Need at least 2 points" };
  }

  const monthly = dates.slice(0, -1).every((date, index) => {
    const next = dates[index + 1];
    return sameDayOfMonthStep(date, next) || sameMonthEndStep(date, next);
  });

  if (monthly) {
    const startsOnFirst = dates.every((date) => date.getUTCDate() === 1);
    return {
      freq: startsOnFirst ? "MS" : "M",
      label: startsOnFirst ? "Monthly (month start)" : "Monthly (month end)",
    };
  }

  const diffs = dates.slice(0, -1).map((date, index) => dates[index + 1].getTime() - date.getTime());
  const mode = [...diffs].sort((a, b) => {
    const countA = diffs.filter((value) => value === a).length;
    const countB = diffs.filter((value) => value === b).length;
    return countB - countA;
  })[0];

  const exactMatches = diffs.filter((value) => value === mode).length;
  const isConsistent = exactMatches >= Math.max(1, Math.floor(diffs.length * 0.7));

  if (!isConsistent) {
    return { freq: null, label: "Irregular" };
  }

  if (mode === WEEK) {
    return { freq: "W", label: "Weekly" };
  }
  if (mode === DAY) {
    return { freq: "D", label: "Daily" };
  }
  if (mode === HOUR) {
    return { freq: "H", label: "Hourly" };
  }
  if (mode === MINUTE) {
    return { freq: "min", label: "Minutely" };
  }
  if (mode % DAY === 0) {
    return { freq: `${mode / DAY}D`, label: `Every ${mode / DAY} days` };
  }
  if (mode % HOUR === 0) {
    return { freq: `${mode / HOUR}H`, label: `Every ${mode / HOUR} hours` };
  }
  if (mode % MINUTE === 0) {
    return { freq: `${mode / MINUTE}min`, label: `Every ${mode / MINUTE} minutes` };
  }

  return { freq: null, label: "Irregular" };
}

function addStep(date: Date, freq: string) {
  const next = new Date(date);

  if (freq === "MS" || freq === "M") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (freq === "MS") {
      next.setUTCDate(1);
    } else {
      next.setUTCDate(lastDayOfMonth(next));
    }
    return next;
  }

  if (freq === "W") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (freq === "D") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (freq === "H") {
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  if (freq === "min") {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    return next;
  }

  const numericPart = Number.parseInt(freq, 10);
  if (Number.isFinite(numericPart)) {
    if (freq.endsWith("D")) {
      next.setUTCDate(next.getUTCDate() + numericPart);
      return next;
    }
    if (freq.endsWith("H")) {
      next.setUTCHours(next.getUTCHours() + numericPart);
      return next;
    }
    if (freq.endsWith("min")) {
      next.setUTCMinutes(next.getUTCMinutes() + numericPart);
      return next;
    }
  }

  throw new Error("Unable to generate future timestamps for this inferred frequency.");
}

export function buildValidatedSeries({
  rows,
  timeColumn,
  targetColumn,
  horizon,
}: BuildSeriesOptions): ValidatedSeries {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const parsedRows: Array<SeriesPoint & { date: Date }> = [];
  let missingTargetCount = 0;
  let invalidDateCount = 0;

  for (const row of rows) {
    const date = parseTimestamp(row[timeColumn] ?? null);
    const value = parseNumericValue(row[targetColumn] ?? null);

    if (!date) {
      invalidDateCount += 1;
      continue;
    }

    if (value === null) {
      missingTargetCount += 1;
      continue;
    }

    parsedRows.push({
      timestamp: formatIso(date),
      value,
      date,
    });
  }

  if (parsedRows.length < 3) {
    blockingIssues.push("The selected variable needs at least 3 valid observations to forecast.");
  }
  if (invalidDateCount > 0) {
    blockingIssues.push(`${invalidDateCount} rows could not be parsed as dates from the first column.`);
  }
  if (missingTargetCount > 0) {
    blockingIssues.push(`${missingTargetCount} rows have missing or non-numeric target values.`);
  }

  const sortedRows = [...parsedRows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const sortedInput = sortedRows.every((row, index) => row === parsedRows[index]);
  if (!sortedInput && sortedRows.length > 0) {
    warnings.push("The dataset was not sorted chronologically. The app reordered it before forecasting.");
  }

  let duplicateTimestampCount = 0;
  const dedupedRows: typeof sortedRows = [];
  const seen = new Set<number>();

  for (const row of sortedRows) {
    const key = row.date.getTime();
    if (seen.has(key)) {
      duplicateTimestampCount += 1;
      continue;
    }
    seen.add(key);
    dedupedRows.push(row);
  }

  if (duplicateTimestampCount > 0) {
    blockingIssues.push(`${duplicateTimestampCount} duplicate timestamps were found in the time column.`);
  }

  const dates = dedupedRows.map((row) => row.date);
  const { freq, label } = inferFrequency(dates);

  if (!freq) {
    blockingIssues.push(
      "The app could not infer a regular frequency from the selected time series. Use evenly spaced timestamps.",
    );
  }

  let gapCount = 0;
  if (freq) {
    for (let index = 0; index < dates.length - 1; index += 1) {
      const expectedNext = addStep(dates[index], freq);
      if (expectedNext.getTime() !== dates[index + 1].getTime()) {
        gapCount += 1;
      }
    }
  }

  if (gapCount > 0) {
    warnings.push(
      `${gapCount} spacing irregularities were detected. Nixtla recommends cleaning gaps before forecasting.`,
    );
  }

  const futureTimestamps: string[] = [];
  if (freq && dedupedRows.length > 0 && horizon > 0) {
    let cursor = dedupedRows[dedupedRows.length - 1].date;
    for (let index = 0; index < horizon; index += 1) {
      cursor = addStep(cursor, freq);
      futureTimestamps.push(formatIso(cursor));
    }
  }

  return {
    timeColumn,
    targetColumn,
    freq,
    inferredFrequencyLabel: label,
    points: dedupedRows.map(({ timestamp, value }) => ({ timestamp, value })),
    futureTimestamps,
    quality: {
      blockingIssues,
      warnings,
      missingTargetCount,
      duplicateTimestampCount,
      gapCount,
      sortedInput,
    },
  };
}
