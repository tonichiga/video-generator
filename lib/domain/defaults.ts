import type {
  EqualizerConfig,
  ParticleConfig,
  PosterConfig,
  TrackTextConfig,
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
  barCount: 36,
};

export const defaultPosterConfig: PosterConfig = {
  cornerRadius: 20,
  blurStrength: 20,
  backgroundDimStrength: 0.48,
  beatScaleStrength: 1,
};

export const defaultTrackTextConfig: TrackTextConfig = {
  artist: "Unknown Artist",
  songName: "Untitled Track",
  color: "#FFFFFF",
  x: 0.5,
  y: 0.82,
  size: 34,
  gap: 10,
  align: "center",
};
