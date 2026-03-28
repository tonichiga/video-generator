import type { ProjectFormat, ProjectQuality } from "@/lib/domain/types";

const trackMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
]);

const posterMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedTrackMime(mimeType: string) {
  return trackMimeTypes.has(mimeType);
}

export function isSupportedPosterMime(mimeType: string) {
  return posterMimeTypes.has(mimeType);
}

export function parseFormat(value: unknown): ProjectFormat | null {
  return value === "tiktok" || value === "youtube" ? value : null;
}

export function parseQuality(value: unknown): ProjectQuality | null {
  return value === "hd" || value === "fhd" ? value : null;
}

export function isValidProfile(
  format: ProjectFormat,
  quality: ProjectQuality,
): boolean {
  return (
    (format === "tiktok" && (quality === "hd" || quality === "fhd")) ||
    (format === "youtube" && (quality === "hd" || quality === "fhd"))
  );
}

export function parseNumberInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  if (value < min || value > max) {
    return null;
  }
  return value;
}

export function parseHexColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

export function parseVisualizerType(
  value: unknown,
): "bars" | "line" | "dots" | "symmetricBars" | null {
  if (
    value === "bars" ||
    value === "line" ||
    value === "dots" ||
    value === "symmetricBars"
  ) {
    return value;
  }
  return null;
}
