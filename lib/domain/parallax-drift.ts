import { clampNumber } from "@/lib/domain/timeline";

type DriftOffset = {
  x: number;
  y: number;
};

type BackgroundParallaxAtMsInput = {
  timeMs: number;
  strength: number;
  baseWidthPx: number;
  baseHeightPx: number;
};

type BackgroundParallaxExprInput = {
  strength: number;
  baseWidthPx: number;
  baseHeightPx: number;
};

const WAVE_X = "(sin(t*0.62)+0.45*sin(t*1.17+1.1))";
const WAVE_Y = "(cos(t*0.53+0.8)+0.35*sin(t*0.97+2.2))";
const WAVE_X_PEAK = 1.45;
const WAVE_Y_PEAK = 1.35;

type DriftModel = {
  amplitudeX: number;
  amplitudeY: number;
  maxOffsetX: number;
  maxOffsetY: number;
  zoomScale: number;
};

function getDriftModel(
  strength: number,
  baseWidthPx: number,
  baseHeightPx: number,
): DriftModel {
  const safeStrength = clampNumber(strength, 0, 3);
  const safeWidth = Math.max(120, baseWidthPx);
  const safeHeight = Math.max(120, baseHeightPx);
  const baseSize = Math.min(safeWidth, safeHeight);

  const amplitudeBase = baseSize * 0.0095 * safeStrength;
  const amplitudeX = Number(amplitudeBase.toFixed(4));
  const amplitudeY = Number((amplitudeBase * 0.86).toFixed(4));

  const requiredOffsetX = amplitudeX * WAVE_X_PEAK + 2;
  const requiredOffsetY = amplitudeY * WAVE_Y_PEAK + 2;

  const zoomByX = 1 + (2 * requiredOffsetX) / safeWidth;
  const zoomByY = 1 + (2 * requiredOffsetY) / safeHeight;
  const zoomScale = Number(
    clampNumber(Math.max(1.02, zoomByX, zoomByY), 1.02, 1.16).toFixed(5),
  );

  const maxOffsetX = Math.max(0, (safeWidth * (zoomScale - 1)) / 2 - 1);
  const maxOffsetY = Math.max(0, (safeHeight * (zoomScale - 1)) / 2 - 1);

  return {
    amplitudeX,
    amplitudeY,
    maxOffsetX,
    maxOffsetY,
    zoomScale,
  };
}

function getDriftWaveX(timeSec: number) {
  return Math.sin(timeSec * 0.62) + 0.45 * Math.sin(timeSec * 1.17 + 1.1);
}

function getDriftWaveY(timeSec: number) {
  return Math.cos(timeSec * 0.53 + 0.8) + 0.35 * Math.sin(timeSec * 0.97 + 2.2);
}

export function getParallaxBackgroundDriftAtMs(
  input: BackgroundParallaxAtMsInput,
) {
  const timeSec = Math.max(0, input.timeMs) / 1000;
  const model = getDriftModel(
    input.strength,
    input.baseWidthPx,
    input.baseHeightPx,
  );

  const rawX = model.amplitudeX * getDriftWaveX(timeSec);
  const rawY = model.amplitudeY * getDriftWaveY(timeSec);

  const x = clampNumber(rawX, -model.maxOffsetX, model.maxOffsetX);
  const y = clampNumber(rawY, -model.maxOffsetY, model.maxOffsetY);

  return {
    offset: {
      x: Number(x.toFixed(4)),
      y: Number(y.toFixed(4)),
    } as DriftOffset,
    zoomScale: model.zoomScale,
  };
}

export function buildParallaxBackgroundCropExpressions(
  input: BackgroundParallaxExprInput,
) {
  const model = getDriftModel(
    input.strength,
    input.baseWidthPx,
    input.baseHeightPx,
  );

  const amplitudeX = Number(model.amplitudeX.toFixed(4));
  const amplitudeY = Number(model.amplitudeY.toFixed(4));
  const maxOffsetX = Number(model.maxOffsetX.toFixed(4));
  const maxOffsetY = Number(model.maxOffsetY.toFixed(4));

  if (amplitudeX <= 0 || amplitudeY <= 0) {
    return {
      zoomScale: model.zoomScale,
      x: "(in_w-out_w)/2",
      y: "(in_h-out_h)/2",
    };
  }

  return {
    zoomScale: model.zoomScale,
    x: `(in_w-out_w)/2+clip(${amplitudeX}*${WAVE_X},-${maxOffsetX},${maxOffsetX})`,
    y: `(in_h-out_h)/2+clip(${amplitudeY}*${WAVE_Y},-${maxOffsetY},${maxOffsetY})`,
  };
}
