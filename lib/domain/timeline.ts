import type {
  EqualizerConfig,
  TimelineKeyframeTrack,
  TimelineState,
} from "@/lib/domain/types";

const MIN_TRACK_DURATION_MS = 100;

export const timelineParameterRanges = {
  "equalizer.width": { min: 0.1, max: 1 },
  "equalizer.height": { min: 0.05, max: 0.4 },
  "equalizer.y": { min: 0, max: 1 },
} as const;

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getDefaultTimeline(trackDurationMs: number): TimelineState {
  const boundedDuration = Math.max(
    MIN_TRACK_DURATION_MS,
    Math.round(trackDurationMs),
  );

  return {
    zoom: 1,
    scroll: 0,
    trimInMs: 0,
    trimOutMs: boundedDuration,
    playheadMs: 0,
  };
}

export function clampTimeline(
  timeline: TimelineState,
  trackDurationMs: number,
): TimelineState {
  const boundedDuration = Math.max(
    MIN_TRACK_DURATION_MS,
    Math.round(trackDurationMs),
  );

  const trimInMs = clampNumber(
    Math.round(timeline.trimInMs),
    0,
    boundedDuration - 1,
  );
  const trimOutMs = clampNumber(
    Math.round(timeline.trimOutMs),
    trimInMs + 1,
    boundedDuration,
  );

  return {
    zoom: clampNumber(timeline.zoom, 0.5, 8),
    scroll: clampNumber(timeline.scroll, 0, 1),
    trimInMs,
    trimOutMs,
    playheadMs:
      typeof timeline.playheadMs === "number"
        ? clampNumber(Math.round(timeline.playheadMs), trimInMs, trimOutMs)
        : undefined,
  };
}

function easeInOutCubic(value: number) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easedProgress(value: number, easing: "linear" | "easeInOut") {
  if (easing === "easeInOut") {
    return easeInOutCubic(value);
  }
  return value;
}

function interpolateValue(
  from: number,
  to: number,
  progress: number,
  easing: "linear" | "easeInOut",
) {
  const normalized = easedProgress(clampNumber(progress, 0, 1), easing);
  return from + (to - from) * normalized;
}

function interpolateTrack(
  track: TimelineKeyframeTrack,
  atTimeMs: number,
): number | null {
  if (track.points.length === 0) {
    return null;
  }

  const points = [...track.points].sort((a, b) => a.timeMs - b.timeMs);

  if (atTimeMs <= points[0].timeMs) {
    return points[0].value;
  }

  const last = points[points.length - 1];
  if (atTimeMs >= last.timeMs) {
    return last.value;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (atTimeMs < from.timeMs || atTimeMs > to.timeMs) {
      continue;
    }

    const segmentDuration = Math.max(1, to.timeMs - from.timeMs);
    const progress = (atTimeMs - from.timeMs) / segmentDuration;
    return interpolateValue(from.value, to.value, progress, to.easing);
  }

  return last.value;
}

export function applyKeyframesToEqualizer(
  baseConfig: EqualizerConfig,
  keyframes: TimelineKeyframeTrack[],
  atTimeMs: number,
): EqualizerConfig {
  let nextConfig: EqualizerConfig = {
    ...baseConfig,
  };

  for (const track of keyframes) {
    const interpolated = interpolateTrack(track, atTimeMs);
    if (interpolated === null) {
      continue;
    }

    const range = timelineParameterRanges[track.parameter];
    const clamped = clampNumber(interpolated, range.min, range.max);

    if (track.parameter === "equalizer.width") {
      nextConfig = {
        ...nextConfig,
        width: clamped,
      };
      continue;
    }

    if (track.parameter === "equalizer.height") {
      nextConfig = {
        ...nextConfig,
        height: clamped,
      };
      continue;
    }

    nextConfig = {
      ...nextConfig,
      y: clamped,
    };
  }

  return nextConfig;
}

export function downsampleWaveform(
  values: number[],
  targetLength: number,
): number[] {
  if (values.length <= targetLength) {
    return values;
  }

  const bins = Math.max(16, Math.round(targetLength));
  const stride = values.length / bins;
  const result: number[] = [];

  for (let index = 0; index < bins; index += 1) {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));

    let sum = 0;
    let count = 0;
    for (
      let cursor = start;
      cursor < end && cursor < values.length;
      cursor += 1
    ) {
      sum += values[cursor];
      count += 1;
    }

    result.push(count > 0 ? Number((sum / count).toFixed(4)) : 0);
  }

  return result;
}
