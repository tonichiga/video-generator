import type { ProjectFormat, ProjectQuality } from "@/lib/domain/types";

export type VideoProfile = {
  width: number;
  height: number;
  fps: 30;
};

const profiles: Record<ProjectFormat, Record<ProjectQuality, VideoProfile>> = {
  tiktok: {
    hd: { width: 720, height: 1280, fps: 30 },
    fhd: { width: 1080, height: 1920, fps: 30 },
  },
  youtube: {
    hd: { width: 1280, height: 720, fps: 30 },
    fhd: { width: 1920, height: 1080, fps: 30 },
  },
};

export function getVideoProfile(
  format: ProjectFormat,
  quality: ProjectQuality,
): VideoProfile {
  return profiles[format][quality];
}
