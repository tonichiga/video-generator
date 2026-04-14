import { clampNumber } from "@/lib/domain/timeline";

type BeatStrobeSoftInput = {
  timeMs: number;
  strength: number;
  lowBandEnergy: number;
};

export function getBeatStrobeSoftAmountAtMs(input: BeatStrobeSoftInput) {
  const { timeMs, strength, lowBandEnergy } = input;

  const safeStrength = clampNumber(strength, 0, 3);
  if (safeStrength <= 0) {
    return 0;
  }

  const gatedEnergy = clampNumber((lowBandEnergy - 0.1) / 0.9, 0, 1);
  const pulse = Math.pow(gatedEnergy, 0.9);
  const t = Math.max(0, timeMs) / 1000;
  const wobble = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 19.0 + 0.4));

  // Soft strobe: keep opacity subtle to avoid hard flashes.
  return clampNumber(pulse * wobble * safeStrength * 0.22, 0, 0.45);
}
