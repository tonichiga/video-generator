import { clampNumber } from "@/lib/domain/timeline";

type LowEndShakeInput = {
  timeMs: number;
  strength: number;
  lowBandEnergy: number;
  baseHeightPx: number;
};

export function getLowEndShakeOffsetAtMs(input: LowEndShakeInput) {
  const { timeMs, strength, lowBandEnergy, baseHeightPx } = input;

  const safeStrength = clampNumber(strength, 0, 3);
  if (safeStrength <= 0) {
    return { x: 0, y: 0 };
  }

  const gatedEnergy = clampNumber((lowBandEnergy - 0.08) / 0.92, 0, 1);
  const drive = Math.pow(gatedEnergy, 0.82);
  const mix = clampNumber(drive * safeStrength, 0, 3);

  if (mix <= 0.001) {
    return { x: 0, y: 0 };
  }

  const safeHeight = Math.max(240, baseHeightPx);
  const maxAmplitudePx = Math.max(2, safeHeight * 0.0032);
  const amplitudePx = clampNumber(
    maxAmplitudePx * (mix / 3),
    0,
    maxAmplitudePx,
  );

  const t = Math.max(0, timeMs) / 1000;
  const wobbleX =
    Math.sin(t * 46.0 + 0.7) * 0.68 + Math.sin(t * 79.0 + 1.9) * 0.32;
  const wobbleY =
    Math.cos(t * 42.0 + 0.3) * 0.62 + Math.sin(t * 73.0 + 2.4) * 0.38;

  return {
    x: wobbleX * amplitudePx,
    y: wobbleY * amplitudePx * 0.82,
  };
}
