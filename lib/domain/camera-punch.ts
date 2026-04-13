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
const DEFAULT_AMPLITUDE = 0.018;
const DEFAULT_MAX_BOOST = 0.12;

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

    emaLow = emaLow * 0.9 + low * 0.1;
    const flux = Math.max(0, low - emaLow);
    emaFlux = emaFlux * 0.92 + flux * 0.08;

    const threshold = Math.max(0.045, emaFlux * 1.35);
    if (flux >= threshold && frameIndex - lastBeatFrame >= minIntervalFrames) {
      beatsMs.push(frameIndex * safeStepMs);
      lastBeatFrame = frameIndex;
      emaFlux = emaFlux * 0.7 + flux * 0.3;
    }
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

  let pulseTotal = 0;
  for (let index = 0; index < beatTimesMs.length; index += 1) {
    const dt = absoluteMs - beatTimesMs[index];
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

  const terms = beatTimesMs.map((beatMs) => {
    const startSec = Number((beatMs / 1000).toFixed(6));
    const endSec = Number((startSec + safeDecaySec).toFixed(6));
    const decaySec = Number(safeDecaySec.toFixed(6));

    return `between(t,${startSec},${endSec})*(1-((t-${startSec})/${decaySec}))`;
  });

  const sumExpr = terms.length === 1 ? terms[0] : `(${terms.join("+")})`;
  return `1+min(${maxBoostValue},(${sumExpr})*${factor})`;
}
