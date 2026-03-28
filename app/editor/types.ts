import type {
  TimelineKeyframeParameter,
  TimelineKeyframeTrack,
  TimelineState,
} from "@/lib/domain/types";

export type { TimelineKeyframeParameter, TimelineKeyframeTrack, TimelineState };

export type Format = "tiktok" | "youtube";
export type Quality = "hd" | "fhd";
export type VisualizerType = "bars" | "line" | "dots" | "symmetricBars";

export type TemplateItem = {
  id: string;
  name: string;
  category: string;
  defaultPalette: string[];
  equalizerConfig: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    visualizerType?: VisualizerType;
    barCount?: number;
  };
  posterConfig: {
    cornerRadius: number;
    blurStrength: number;
  };
};

export type WaveformResponse = {
  analysisId: string;
  frameStepMs: number;
  durationMs: number;
  values: number[];
};

export type SpectrumResponse = {
  analysisId: string;
  frameStepMs: number;
  durationMs: number;
  bars: number;
  values: number[][];
};

export type EqualizerConfigPayload = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visualizerType: VisualizerType;
  barCount: number;
};

export type PosterConfigPayload = {
  cornerRadius: number;
  blurStrength: number;
};

export type ProjectPersistencePayload = {
  clientToken: string;
  templateId: string | null;
  backgroundAssetId: string | null;
  equalizerConfig: EqualizerConfigPayload;
  particleConfig: {
    preset: "off";
    density: number;
    speed: number;
  };
  posterConfig: PosterConfigPayload;
  timeline: TimelineState;
  keyframes: TimelineKeyframeTrack[];
};

export type CreateProjectPayload = ProjectPersistencePayload & {
  name: string;
  format: Format;
  quality: Quality;
  fps: number;
  trackAssetId: string;
  posterAssetId: string;
  analysisId: string;
};

export type LoadProjectResponse = {
  name: string;
  format: Format;
  quality: Quality;
  trackAssetId: string;
  posterAssetId: string;
  backgroundAssetId?: string | null;
  analysisId: string;
  templateId: string | null;
  equalizerConfig: {
    color: string;
    width: number;
    height: number;
    y: number;
    visualizerType?: VisualizerType;
    barCount?: number;
  };
  posterConfig?: {
    cornerRadius?: number;
    blurStrength?: number;
  };
  timeline?: TimelineState | null;
  keyframes?: TimelineKeyframeTrack[];
};
