import { clampNumber } from "@/lib/domain/timeline";

export function normalizeSpectrumBands(row: number[], targetBars: number) {
  if (targetBars <= 0) {
    return [];
  }

  if (row.length === 0) {
    return Array.from({ length: targetBars }).map(() => 0);
  }

  if (row.length === targetBars) {
    return row.map((value) => clampNumber(value, 0, 1));
  }

  const stride = row.length / targetBars;
  const next: number[] = [];

  for (let index = 0; index < targetBars; index += 1) {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));

    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor < end && cursor < row.length; cursor += 1) {
      sum += row[cursor] ?? 0;
      count += 1;
    }

    next.push(count > 0 ? clampNumber(sum / count, 0, 1) : 0);
  }

  return next;
}

export function downsampleSpectrumFrames(
  values: number[][],
  maxFrames: number,
) {
  if (values.length <= maxFrames) {
    return values;
  }

  const stride = values.length / maxFrames;
  const next: number[][] = [];

  for (let index = 0; index < maxFrames; index += 1) {
    const sourceIndex = Math.min(values.length - 1, Math.floor(index * stride));
    next.push(values[sourceIndex]);
  }

  return next;
}

export function spectrumFrameIndexAtMs(
  timeMs: number,
  frameStepMs: number,
  framesLength: number,
) {
  if (framesLength <= 0) {
    return 0;
  }

  const safeStep = Math.max(1, Math.round(frameStepMs));
  return clampNumber(Math.floor(timeMs / safeStep), 0, framesLength - 1);
}
