import type {
  EqualizerConfig,
  TimelineKeyframeTrack,
  TimelineState,
} from "@/lib/domain/types";
import { applyKeyframesToEqualizer, clampNumber } from "@/lib/domain/timeline";

const MIN_DURATION_MS = 100;

type SceneTimelineInput = {
  trackDurationSec: number;
  timeline?: TimelineState;
};

export type ResolvedSceneTimeline = {
  trackDurationMs: number;
  trimInMs: number;
  trimOutMs: number;
  clipDurationMs: number;
  clipStartSec: number;
  clipDurationSec: number;
};

function safeNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function resolveSceneTimeline({
  trackDurationSec,
  timeline,
}: SceneTimelineInput): ResolvedSceneTimeline {
  const trackDurationMs = Math.max(
    MIN_DURATION_MS,
    Math.round(safeNumber(trackDurationSec, 120) * 1000),
  );

  const trimInMs = clampNumber(
    Math.round(timeline?.trimInMs ?? 0),
    0,
    trackDurationMs - 1,
  );
  const trimOutMs = clampNumber(
    Math.round(timeline?.trimOutMs ?? trackDurationMs),
    trimInMs + 1,
    trackDurationMs,
  );

  const clipDurationMs = Math.max(MIN_DURATION_MS, trimOutMs - trimInMs);

  return {
    trackDurationMs,
    trimInMs,
    trimOutMs,
    clipDurationMs,
    clipStartSec: trimInMs / 1000,
    clipDurationSec: clipDurationMs / 1000,
  };
}

function resolveTrackValueAt(
  track: TimelineKeyframeTrack | undefined,
  atMs: number,
  fallback: number,
) {
  if (!track || track.points.length === 0) {
    return fallback;
  }

  const points = [...track.points].sort((a, b) => a.timeMs - b.timeMs);

  if (atMs <= points[0].timeMs) {
    return points[0].value;
  }

  const last = points[points.length - 1];
  if (atMs >= last.timeMs) {
    return last.value;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    if (atMs < from.timeMs || atMs > to.timeMs) {
      continue;
    }

    const segmentDuration = Math.max(1, to.timeMs - from.timeMs);
    const progress = clampNumber((atMs - from.timeMs) / segmentDuration, 0, 1);

    if (to.easing === "easeInOut") {
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      return from.value + (to.value - from.value) * eased;
    }

    return from.value + (to.value - from.value) * progress;
  }

  return fallback;
}

function formatNum(value: number, precision = 6) {
  return Number(value.toFixed(precision));
}

function toMsRelativeToClip(absoluteMs: number, clipTrimInMs: number) {
  return Math.max(0, absoluteMs - clipTrimInMs);
}

function buildAnimatedValueExpression(input: {
  track: TimelineKeyframeTrack | undefined;
  clipTrimInMs: number;
  clipDurationMs: number;
  fallbackValue: number;
  minValue: number;
  maxValue: number;
}) {
  const {
    track,
    clipTrimInMs,
    clipDurationMs,
    fallbackValue,
    minValue,
    maxValue,
  } = input;

  const initialValue = clampNumber(
    resolveTrackValueAt(track, clipTrimInMs, fallbackValue),
    minValue,
    maxValue,
  );

  if (!track || track.points.length === 0) {
    return {
      expression: `${formatNum(initialValue)}`,
      initialValue,
    };
  }

  const inClip = track.points
    .filter((point) => point.timeMs >= clipTrimInMs)
    .filter((point) => point.timeMs <= clipTrimInMs + clipDurationMs)
    .sort((a, b) => a.timeMs - b.timeMs);

  if (inClip.length === 0) {
    return {
      expression: `${formatNum(initialValue)}`,
      initialValue,
    };
  }

  const points = [
    {
      timeMs: clipTrimInMs,
      value: initialValue,
      easing: "linear" as const,
    },
    ...inClip,
  ]
    .filter(
      (point, index, arr) =>
        index === 0 || point.timeMs !== arr[index - 1].timeMs,
    )
    .map((point) => ({
      timeMs: toMsRelativeToClip(point.timeMs, clipTrimInMs),
      value: clampNumber(point.value, minValue, maxValue),
      easing: point.easing,
    }));

  if (points.length <= 1) {
    return {
      expression: `${formatNum(initialValue)}`,
      initialValue,
    };
  }

  let expression = `${formatNum(points[points.length - 1].value)}`;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const from = points[index];
    const to = points[index + 1];
    const startSec = formatNum(from.timeMs / 1000);
    const endSec = formatNum(to.timeMs / 1000);
    const spanSec = formatNum(Math.max(0.001, endSec - startSec));

    const linearProgress = `clip((t-${startSec})/${spanSec},0,1)`;
    const easedProgress =
      to.easing === "easeInOut"
        ? `if(lt(${linearProgress},0.5),4*pow(${linearProgress},3),1-pow(-2*${linearProgress}+2,3)/2)`
        : linearProgress;

    const segmentExpr = `${formatNum(from.value)}+(${formatNum(to.value)}-${formatNum(from.value)})*${easedProgress}`;
    expression = `if(lt(t,${endSec}),${segmentExpr},${expression})`;
  }

  return {
    expression,
    initialValue,
  };
}

export type EqualizerFfmpegExpressions = {
  widthPxExpr: string;
  heightPxExpr: string;
  yPxExpr: string;
  initial: EqualizerConfig;
};

export function buildEqualizerFfmpegExpressions(input: {
  equalizerConfig: EqualizerConfig;
  keyframes: TimelineKeyframeTrack[];
  timeline: ResolvedSceneTimeline;
  frameWidth: number;
  frameHeight: number;
}) {
  const { equalizerConfig, keyframes, timeline, frameWidth, frameHeight } =
    input;

  const keyframeAtTrim = applyKeyframesToEqualizer(
    equalizerConfig,
    keyframes,
    timeline.trimInMs,
  );

  const widthTrack = keyframes.find(
    (item) => item.parameter === "equalizer.width",
  );
  const heightTrack = keyframes.find(
    (item) => item.parameter === "equalizer.height",
  );
  const yTrack = keyframes.find((item) => item.parameter === "equalizer.y");

  const widthExpression = buildAnimatedValueExpression({
    track: widthTrack,
    clipTrimInMs: timeline.trimInMs,
    clipDurationMs: timeline.clipDurationMs,
    fallbackValue: keyframeAtTrim.width,
    minValue: 0.1,
    maxValue: 1,
  });

  const heightExpression = buildAnimatedValueExpression({
    track: heightTrack,
    clipTrimInMs: timeline.trimInMs,
    clipDurationMs: timeline.clipDurationMs,
    fallbackValue: keyframeAtTrim.height,
    minValue: 0.05,
    maxValue: 0.4,
  });

  const yExpression = buildAnimatedValueExpression({
    track: yTrack,
    clipTrimInMs: timeline.trimInMs,
    clipDurationMs: timeline.clipDurationMs,
    fallbackValue: keyframeAtTrim.y,
    minValue: 0,
    maxValue: 1,
  });

  const widthPxExpr = `max(80,round(${widthExpression.expression}*${frameWidth}))`;
  const heightPxExpr = `max(32,round(${heightExpression.expression}*${frameHeight}))`;
  const yCenterPxExpr = `round(${yExpression.expression}*${frameHeight})`;
  const yPxExpr = `max(0,min(${frameHeight}-${heightPxExpr},${yCenterPxExpr}-round(${heightPxExpr}/2)))`;

  return {
    widthPxExpr,
    heightPxExpr,
    yPxExpr,
    initial: keyframeAtTrim,
  } satisfies EqualizerFfmpegExpressions;
}
