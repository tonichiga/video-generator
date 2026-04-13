export type ProjectFormat = "tiktok" | "youtube";

export type ProjectQuality = "hd" | "fhd";

export type AssetKind = "track" | "poster" | "render";

export type RenderJobStatus =
  | "queued"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

export interface ParticleConfig {
  preset:
    | "off"
    | "neon"
    | "dust"
    | "stardust"
    | "pulse"
    | "retro"
    | "fire"
    | "geometric";
  density: number;
  speed: number;
}

export interface EqualizerConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visualizerType?: "bars" | "line" | "dots" | "symmetricBars";
  barCount?: number;
}

export interface PosterConfig {
  cornerRadius: number;
  blurStrength: number;
  backgroundDimStrength: number;
  beatScaleStrength?: number;
  cameraPunchStrength?: number;
  parallaxDriftStrength?: number;
  bannerScale?: number;
  bannerBorderEnabled?: boolean;
  bannerBorderColor?: string;
  bannerBorderWidth?: number;
}

export interface TrackTextConfig {
  artist: string;
  songName: string;
  color: string;
  x: number;
  y: number;
  size: number;
  gap: number;
  align: "left" | "center" | "right";
}

export type TimelineKeyframeParameter =
  | "equalizer.width"
  | "equalizer.height"
  | "equalizer.y";

export type TimelineKeyframeEasing = "linear" | "easeInOut";

export interface TimelineKeyframePoint {
  timeMs: number;
  value: number;
  easing: TimelineKeyframeEasing;
}

export interface TimelineKeyframeTrack {
  parameter: TimelineKeyframeParameter;
  points: TimelineKeyframePoint[];
}

export interface TimelineState {
  zoom: number;
  scroll: number;
  trimInMs: number;
  trimOutMs: number;
  playheadMs?: number;
}

export interface Project {
  id: string;
  clientToken: string;
  name: string;
  format: ProjectFormat;
  quality: ProjectQuality;
  fps: 30;
  particleConfig: ParticleConfig;
  equalizerConfig: EqualizerConfig;
  posterConfig: PosterConfig;
  trackTextConfig: TrackTextConfig;
  watermarkEnabled: boolean;
  templateId: string | null;
  trackAssetId: string;
  posterAssetId: string;
  backgroundAssetId: string | null;
  renderBackgroundAssetId: string | null;
  analysisId: string;
  timeline?: TimelineState;
  keyframes?: TimelineKeyframeTrack[];
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  filePath: string;
  mimeType: string;
  size: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  checksum: string;
  createdAt: string;
}

export interface AudioAnalysis {
  id: string;
  trackAssetId: string;
  status: "processing" | "done" | "failed";
  sampleRate: number;
  frameStepMs: number;
  bands: number;
  envelopeSeriesPath: string;
  spectrumSeriesPath: string;
  createdAt: string;
}

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderJobStatus;
  progress: number;
  outputAssetId: string | null;
  outputPath: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  watermarkApplied: boolean;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  particleConfig: ParticleConfig;
  equalizerConfig: EqualizerConfig;
  posterConfig: PosterConfig;
  defaultPalette: string[];
  isBuiltIn: boolean;
}
