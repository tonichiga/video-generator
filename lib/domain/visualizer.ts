import type { ParticleConfig } from "@/lib/domain/types";

export function getVisualizerBarCount(
  preset: ParticleConfig["preset"],
  category: string,
) {
  if (preset === "geometric" || category === "tech") {
    return 32;
  }
  if (preset === "fire") {
    return 40;
  }
  if (preset === "off") {
    return 24;
  }
  return 36;
}
