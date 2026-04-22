"use client";

import type { CsvRow, InterpolationMethod, SeriesPoint, ValidatedSeries } from "@/types/forecast";

interface BuildSeriesOptions {
  rows: CsvRow[];
  timeColumn: string;
  targetColumn: string;
  horizon: number;
  interpolationMethod: InterpolationMethod;
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

function interpolateValues(
  values: Array<number | null>,
  method: InterpolationMethod,
): { values: Array<number | null>; interpolatedCount: number } {
  if (method === "none") {
    return { values, interpolatedCount: 0 };
  }

  const result = [...values];
  let interpolatedCount = 0;

  if (method === "forward-fill") {
    let lastValue: number | null = null;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] !== null) {
        lastValue = result[index];
        continue;
      }
      if (lastValue !== null) {
        result[index] = lastValue;
        interpolatedCount += 1;
      }
    }
    return { values: result, interpolatedCount };
  }

  if (method === "backward-fill") {
    let nextValue: number | null = null;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (result[index] !== null) {
        nextValue = result[index];
        continue;
      }
      if (nextValue !== null) {
        result[index] = nextValue;
        interpolatedCount += 1;
      }
    }
    return { values: result, interpolatedCount };
  }

  for (let index = 0; index < result.length; index += 1) {
    if (result[index] !== null) {
      continue;
    }

    let left = index - 1;
    while (left >= 0 && result[left] === null) {
      left -= 1;
    }

    let right = index + 1;
    while (right < result.length && result[right] === null) {
      right += 1;
    }

    const leftValue = left >= 0 ? result[left] : null;
    const rightValue = right < result.length ? result[right] : null;

    if (leftValue !== null && rightValue !== null) {
      const span = right - left;
      const step = (rightValue - leftValue) / span;
      result[index] = leftValue + step * (index - left);
      interpolatedCount += 1;
    }
  }

  return { values: result, interpolatedCount };
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
  interpolationMethod,
}: BuildSeriesOptions): ValidatedSeries {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const parsedRows: Array<{ date: Date; value: number | null }> = [];
  let missingTargetCountBeforeInterpolation = 0;
  let invalidDateCount = 0;

  for (const row of rows) {
    const date = parseTimestamp(row[timeColumn] ?? null);
    const value = parseNumericValue(row[targetColumn] ?? null);

    if (!date) {
      invalidDateCount += 1;
      continue;
    }

    parsedRows.push({
      value,
      date,
    });
    if (value === null) {
      missingTargetCountBeforeInterpolation += 1;
    }
  }

  if (parsedRows.length < 3) {
    blockingIssues.push("The selected variable needs at least 3 valid observations to forecast.");
  }
  if (invalidDateCount > 0) {
    blockingIssues.push(`${invalidDateCount} rows could not be parsed as dates from the first column.`);
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

  const baseValues = dedupedRows.map((row) => row.value);
  const interpolationResult = interpolateValues(baseValues, interpolationMethod);
  const finalizedRows = dedupedRows.map((row, index) => ({
    date: row.date,
    value: interpolationResult.values[index],
  }));

  const missingTargetCount = finalizedRows.filter((row) => row.value === null).length;
  if (missingTargetCount > 0) {
    blockingIssues.push(
      `${missingTargetCount} rows still have missing target values after applying ${interpolationMethod} interpolation.`,
    );
  }

  if (interpolationResult.interpolatedCount > 0) {
    warnings.push(
      `${interpolationResult.interpolatedCount} missing values were filled using ${interpolationMethod} interpolation.`,
    );
  } else if (missingTargetCountBeforeInterpolation > 0 && interpolationMethod !== "none") {
    warnings.push(
      `No values could be filled with ${interpolationMethod} interpolation. Try a different interpolation method.`,
    );
  }

  const usableRows: Array<SeriesPoint & { date: Date }> = finalizedRows
    .filter((row): row is { date: Date; value: number } => row.value !== null)
    .map((row) => ({
      date: row.date,
      timestamp: formatIso(row.date),
      value: row.value,
    }));

  if (usableRows.length < 3) {
    blockingIssues.push("The selected variable needs at least 3 usable observations after cleaning.");
  }

  const dates = usableRows.map((row) => row.date);
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
  if (freq && usableRows.length > 0 && horizon > 0) {
    let cursor = usableRows[usableRows.length - 1].date;
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
    points: usableRows.map(({ timestamp, value }) => ({ timestamp, value })),
    futureTimestamps,
    quality: {
      blockingIssues,
      warnings,
      missingTargetCount,
      duplicateTimestampCount,
      gapCount,
      sortedInput,
      interpolatedCount: interpolationResult.interpolatedCount,
      interpolationMethod,
    },
  };
}
