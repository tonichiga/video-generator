import type {
  EqualizerConfig,
  ParticleConfig,
  PosterConfig,
} from "@/lib/domain/types";

export const defaultParticleConfig: ParticleConfig = {
  preset: "neon",
  density: 0.55,
  speed: 0.5,
};

export const defaultEqualizerConfig: EqualizerConfig = {
  x: 0.5,
  y: 0.8,
  width: 0.7,
  height: 0.18,
  color: "#FFFFFF",
  visualizerType: "bars",
};

export const defaultPosterConfig: PosterConfig = {
  cornerRadius: 20,
  blurStrength: 20,
};
