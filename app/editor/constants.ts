import type { VisualizerType } from "@/app/editor/types";

export const DEFAULT_DURATION_MS = 120_000;
export const TIMELINE_WIDTH = 1000;
export const TIMELINE_HEIGHT = 120;

export const VISUALIZER_TYPE_OPTIONS: VisualizerType[] = [
  "bars",
  "symmetricBars",
  "line",
  "dots",
];

export function createDefaultClientToken() {
  return `cl_${Math.random().toString(36).slice(2, 10)}`;
}
