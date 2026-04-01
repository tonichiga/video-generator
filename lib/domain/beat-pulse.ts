import { clampNumber } from "@/lib/domain/timeline";

export type BeatPulseState = {
  smoothedEnergy: number;
  scale: number;
};

type BeatPulseOptions = {
  strength?: number;
};

export function createInitialBeatPulseState(): BeatPulseState {
  return {
    smoothedEnergy: 0.06,
    scale: 1,
  };
}

export function getNextBeatPulseState(
  previous: BeatPulseState,
  bars: number[],
  options?: BeatPulseOptions,
): BeatPulseState {
  if (bars.length === 0) {
    return {
      smoothedEnergy: previous.smoothedEnergy * 0.96,
      scale: previous.scale + (1 - previous.scale) * 0.18,
    };
  }

  const bassCount = Math.max(2, Math.round(bars.length * 0.24));
  let bassSum = 0;
  let fullSum = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const value = clampNumber(bars[index] ?? 0, 0, 1);
    const weighted = Math.pow(value, 1.18);
    fullSum += weighted;

    if (index < bassCount) {
      bassSum += Math.pow(value, 1.34);
    }
  }

  const bassEnergy = bassSum / bassCount;
  const fullEnergy = fullSum / bars.length;
  const targetEnergy = clampNumber(bassEnergy * 0.72 + fullEnergy * 0.28, 0, 1);

  const energyAttack = 0.6;
  const energyRelease = 0.18;
  const energyMix =
    targetEnergy >= previous.smoothedEnergy ? energyAttack : energyRelease;
  const smoothedEnergy = clampNumber(
    previous.smoothedEnergy +
      (targetEnergy - previous.smoothedEnergy) * energyMix,
    0,
    1,
  );

  const transient = Math.max(0, targetEnergy - previous.smoothedEnergy);
  const drive = clampNumber(smoothedEnergy * 0.86 + transient * 1.38, 0, 1);
  const strength = clampNumber(options?.strength ?? 1, 0, 5);
  const maxBoost = clampNumber(0.085 * strength, 0, 0.24);
  const targetScale = 1 + Math.pow(drive, 0.92) * maxBoost;

  const scaleAttack = 0.48;
  const scaleRelease = 0.2;
  const scaleMix = targetScale >= previous.scale ? scaleAttack : scaleRelease;
  const scale = clampNumber(
    previous.scale + (targetScale - previous.scale) * scaleMix,
    1,
    1 + maxBoost,
  );

  return {
    smoothedEnergy,
    scale,
  };
}
