import {
  getDefaultTimeline,
  timelineParameterRanges,
} from "@/lib/domain/timeline";
import type {
  TimelineKeyframeEasing,
  TimelineKeyframeParameter,
  TimelineKeyframeTrack,
  TimelineState,
} from "@/lib/domain/types";
import { parseNumberInRange } from "@/lib/server/validation";

const validParameters = new Set<TimelineKeyframeParameter>([
  "equalizer.width",
  "equalizer.height",
  "equalizer.y",
]);

const validEasing = new Set<TimelineKeyframeEasing>(["linear", "easeInOut"]);

function parseOptionalRoundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = parseNumberInRange(value, min, max);
  if (parsed === null) {
    return null;
  }

  return Math.round(parsed);
}

export function parseTimelineState(
  value: unknown,
  trackDurationMs: number,
  fallback: TimelineState,
): TimelineState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const next = value as Record<string, unknown>;

  const zoom =
    next.zoom === undefined
      ? fallback.zoom
      : parseNumberInRange(next.zoom, 0.5, 8);
  const scroll =
    next.scroll === undefined
      ? fallback.scroll
      : parseNumberInRange(next.scroll, 0, 1);

  const trimInMs =
    next.trimInMs === undefined
      ? fallback.trimInMs
      : parseOptionalRoundedNumber(next.trimInMs, 0, trackDurationMs - 1);

  const trimOutMs =
    next.trimOutMs === undefined
      ? fallback.trimOutMs
      : parseOptionalRoundedNumber(next.trimOutMs, 1, trackDurationMs);

  if (
    zoom === null ||
    scroll === null ||
    trimInMs === null ||
    trimOutMs === null
  ) {
    return null;
  }

  if (trimInMs >= trimOutMs) {
    return null;
  }

  let playheadMs = fallback.playheadMs;
  if (next.playheadMs !== undefined) {
    const parsedPlayhead = parseOptionalRoundedNumber(
      next.playheadMs,
      trimInMs,
      trimOutMs,
    );
    if (parsedPlayhead === null) {
      return null;
    }
    playheadMs = parsedPlayhead;
  }

  return {
    zoom,
    scroll,
    trimInMs,
    trimOutMs,
    playheadMs,
  };
}

export function defaultTimelineForTrack(
  trackDurationMs: number,
): TimelineState {
  return getDefaultTimeline(trackDurationMs);
}

export function parseKeyframes(
  value: unknown,
  options: {
    timeline: TimelineState;
    trackDurationMs: number;
  },
): TimelineKeyframeTrack[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length > 16) {
    return null;
  }

  const minTime = Math.max(0, options.timeline.trimInMs);
  const maxTime = Math.min(options.trackDurationMs, options.timeline.trimOutMs);

  const tracks: TimelineKeyframeTrack[] = [];

  for (const trackRaw of value) {
    if (!trackRaw || typeof trackRaw !== "object") {
      return null;
    }

    const track = trackRaw as Record<string, unknown>;
    if (typeof track.parameter !== "string") {
      return null;
    }

    if (!validParameters.has(track.parameter as TimelineKeyframeParameter)) {
      return null;
    }

    if (!Array.isArray(track.points)) {
      return null;
    }

    if (track.points.length > 200) {
      return null;
    }

    const range =
      timelineParameterRanges[track.parameter as TimelineKeyframeParameter];

    const points = track.points
      .map((pointRaw) => {
        if (!pointRaw || typeof pointRaw !== "object") {
          return null;
        }

        const point = pointRaw as Record<string, unknown>;

        const timeMs = parseOptionalRoundedNumber(
          point.timeMs,
          minTime,
          maxTime,
        );
        const valueAtTime = parseNumberInRange(
          point.value,
          range.min,
          range.max,
        );
        const easing =
          typeof point.easing === "string" &&
          validEasing.has(point.easing as TimelineKeyframeEasing)
            ? (point.easing as TimelineKeyframeEasing)
            : null;

        if (timeMs === null || valueAtTime === null || easing === null) {
          return null;
        }

        return {
          timeMs,
          value: valueAtTime,
          easing,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.timeMs - b.timeMs);

    if (points.length !== track.points.length) {
      return null;
    }

    const dedupedPoints = points.filter(
      (item, index) => index === 0 || item.timeMs !== points[index - 1].timeMs,
    );

    tracks.push({
      parameter: track.parameter as TimelineKeyframeParameter,
      points: dedupedPoints,
    });
  }

  return tracks;
}
