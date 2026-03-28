import {
  DEFAULT_DURATION_MS,
  TIMELINE_HEIGHT,
  TIMELINE_WIDTH,
} from "@/app/editor/constants";
import type { TimelineState } from "@/app/editor/types";
import { clampNumber, getDefaultTimeline } from "@/lib/domain/timeline";

export function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function waveformPath(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const centerY = TIMELINE_HEIGHT / 2;
  const usableHeight = TIMELINE_HEIGHT * 0.82;
  const maxIndex = Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = (index / maxIndex) * TIMELINE_WIDTH;
      const y = centerY - clampNumber(value, 0, 1) * (usableHeight / 2);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function visualizerLinePath(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const maxIndex = Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = (index / maxIndex) * 100;
      const y = 100 - clampNumber(value, 0.02, 1) * 92;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function visualizerSymmetricBarHeight(value: number) {
  return `${Math.max(6, Math.round(value * 46))}%`;
}

export function normalizeTimeline(
  input: TimelineState | null | undefined,
  durationMs: number,
): TimelineState {
  const boundedDuration = Math.max(
    100,
    Math.round(durationMs || DEFAULT_DURATION_MS),
  );
  const fallback = getDefaultTimeline(boundedDuration);

  if (!input) {
    return fallback;
  }

  const trimInMs = clampNumber(
    Math.round(input.trimInMs),
    0,
    boundedDuration - 1,
  );
  const trimOutMs = clampNumber(
    Math.round(input.trimOutMs),
    trimInMs + 1,
    boundedDuration,
  );

  return {
    zoom: clampNumber(input.zoom, 0.5, 8),
    scroll: clampNumber(input.scroll, 0, 1),
    trimInMs,
    trimOutMs,
    playheadMs:
      typeof input.playheadMs === "number"
        ? clampNumber(Math.round(input.playheadMs), trimInMs, trimOutMs)
        : trimInMs,
  };
}
