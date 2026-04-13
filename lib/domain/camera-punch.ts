import { clampNumber } from "@/lib/domain/timeline";
import { normalizeSpectrumBands } from "@/lib/domain/spectrum";

type CameraPunchBeatInput = {
  spectrumValues: number[][];
  frameStepMs: number;
  barCount: number;
  minIntervalMs?: number;
};

type CameraPunchScaleInput = {
  absoluteMs: number;
  beatTimesMs: number[];
  strength: number;
  decayMs?: number;
  amplitude?: number;
  maxBoost?: number;
};

type CameraPunchExpressionInput = {
  beatTimesMs: number[];
  strength: number;
  decayMs?: number;
  amplitude?: number;
  maxBoost?: number;
};

const DEFAULT_DECAY_MS = 360;
const DEFAULT_AMPLITUDE = 0.032;
const DEFAULT_MAX_BOOST = 0.18;
const MAX_CAMERA_PUNCH_TERMS = 72;

function compactCameraPunchBeatTimes(
  beatTimesMs: number[],
  decayMs: number,
  maxTerms = MAX_CAMERA_PUNCH_TERMS,
) {
  const sortedUniqueBeats = Array.from(new Set(beatTimesMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (sortedUniqueBeats.length === 0) {
    return [] as number[];
  }

  const minGapMs = Math.max(120, Math.round(decayMs * 0.45));
  const compactBeats: number[] = [];
  for (let index = 0; index < sortedUniqueBeats.length; index += 1) {
    const beatMs = sortedUniqueBeats[index];
    const previous = compactBeats[compactBeats.length - 1];
    if (previous === undefined || beatMs - previous >= minGapMs) {
      compactBeats.push(beatMs);
    }
  }

  if (compactBeats.length <= maxTerms) {
    return compactBeats;
  }

  const stride = Math.ceil(compactBeats.length / maxTerms);
  return compactBeats.filter((_, index) => index % stride === 0);
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[index] ?? 0;
  }

  return total / values.length;
}

export function detectCameraPunchBeatsMs(input: CameraPunchBeatInput) {
  const { spectrumValues, frameStepMs, barCount, minIntervalMs = 220 } = input;

  if (spectrumValues.length === 0 || barCount <= 0) {
    return [] as number[];
  }

  const safeStepMs = Math.max(1, Math.round(frameStepMs));
  const safeBars = Math.max(8, Math.round(barCount));
  const lowBandCount = Math.max(3, Math.round(safeBars * 0.2));
  const minIntervalFrames = Math.max(1, Math.round(minIntervalMs / safeStepMs));

  let emaLow = 0.06;
  let emaFlux = 0.02;
  let lastBeatFrame = -minIntervalFrames;
  const beatsMs: number[] = [];
  const lowSeries: number[] = [];

  for (
    let frameIndex = 0;
    frameIndex < spectrumValues.length;
    frameIndex += 1
  ) {
    const frame = normalizeSpectrumBands(
      spectrumValues[frameIndex] ?? [],
      safeBars,
    );
    const low = average(frame.slice(0, lowBandCount));
    lowSeries.push(low);

    emaLow = emaLow * 0.9 + low * 0.1;
    const flux = Math.max(0, low - emaLow);
    emaFlux = emaFlux * 0.92 + flux * 0.08;

    const threshold = Math.max(0.018, emaFlux * 1.12);
    if (flux >= threshold && frameIndex - lastBeatFrame >= minIntervalFrames) {
      beatsMs.push(frameIndex * safeStepMs);
      lastBeatFrame = frameIndex;
      emaFlux = emaFlux * 0.7 + flux * 0.3;
    }
  }

  if (beatsMs.length >= 4) {
    return beatsMs;
  }

  // Fallback for tracks with weak low-band transients: take local maxima per window.
  const fallbackBeatsMs: number[] = [];
  const avgLow = average(lowSeries);
  const minPeak = Math.max(0.05, avgLow * 1.05);

  for (
    let windowStart = 0;
    windowStart < lowSeries.length;
    windowStart += minIntervalFrames
  ) {
    const windowEnd = Math.min(
      lowSeries.length,
      windowStart + minIntervalFrames,
    );
    let bestIndex = -1;
    let bestValue = -1;

    for (let index = windowStart; index < windowEnd; index += 1) {
      const value = lowSeries[index] ?? 0;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    }

    if (bestIndex >= 0 && bestValue >= minPeak) {
      fallbackBeatsMs.push(bestIndex * safeStepMs);
    }
  }

  if (fallbackBeatsMs.length > 0) {
    return fallbackBeatsMs;
  }

  return beatsMs;
}

export function cameraPunchScaleAtMs(input: CameraPunchScaleInput) {
  const {
    absoluteMs,
    beatTimesMs,
    strength,
    decayMs = DEFAULT_DECAY_MS,
    amplitude = DEFAULT_AMPLITUDE,
    maxBoost = DEFAULT_MAX_BOOST,
  } = input;

  if (beatTimesMs.length === 0 || strength <= 0) {
    return 1;
  }

  const safeStrength = clampNumber(strength, 0, 5);
  const safeDecayMs = Math.max(80, decayMs);
  const compactBeats = compactCameraPunchBeatTimes(
    beatTimesMs,
    safeDecayMs,
    MAX_CAMERA_PUNCH_TERMS,
  );

  if (compactBeats.length === 0 || !Number.isFinite(safeStrength)) {
    return 1;
  }

  let pulseTotal = 0;
  for (let index = 0; index < compactBeats.length; index += 1) {
    const dt = absoluteMs - compactBeats[index];
    if (dt < 0 || dt > safeDecayMs) {
      continue;
    }

    pulseTotal += 1 - dt / safeDecayMs;
  }

  const boost = Math.min(maxBoost, pulseTotal * amplitude * safeStrength);
  return clampNumber(1 + boost, 1, 1 + maxBoost);
}

export function buildCameraPunchScaleExpression(
  input: CameraPunchExpressionInput,
) {
  const {
    beatTimesMs,
    strength,
    decayMs = DEFAULT_DECAY_MS,
    amplitude = DEFAULT_AMPLITUDE,
    maxBoost = DEFAULT_MAX_BOOST,
  } = input;

  const safeStrength = clampNumber(strength, 0, 5);
  if (safeStrength <= 0 || beatTimesMs.length === 0) {
    return "1";
  }

  const safeDecaySec = Math.max(0.08, decayMs / 1000);
  const factor = Number((amplitude * safeStrength).toFixed(6));
  const maxBoostValue = Number(maxBoost.toFixed(6));

  const beatsForExpression = compactCameraPunchBeatTimes(
    beatTimesMs,
    decayMs,
    MAX_CAMERA_PUNCH_TERMS,
  );

  if (beatsForExpression.length === 0) {
    return "1";
  }

  const terms = beatsForExpression.map((beatMs) => {
    const startSec = Number((beatMs / 1000).toFixed(6));
    const endSec = Number((startSec + safeDecaySec).toFixed(6));
    const decaySec = Number(safeDecaySec.toFixed(6));

    return `between(t,${startSec},${endSec})*(1-((t-${startSec})/${decaySec}))`;
  });

  const sumExpr = terms.length === 1 ? terms[0] : `(${terms.join("+")})`;
  return `1+min(${maxBoostValue},(${sumExpr})*${factor})`;
}
