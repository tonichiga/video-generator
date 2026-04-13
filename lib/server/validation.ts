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

  const raw = value.trim();

  const hexMatch = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(raw);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;

    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
  }

  const rgbaMatch =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(
      raw,
    );
  if (!rgbaMatch) {
    return null;
  }

  const r = Number(rgbaMatch[1]);
  const g = Number(rgbaMatch[2]);
  const b = Number(rgbaMatch[3]);
  const a = rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]);

  if (
    !Number.isFinite(r) ||
    !Number.isFinite(g) ||
    !Number.isFinite(b) ||
    !Number.isFinite(a)
  ) {
    return null;
  }

  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    return null;
  }

  if (a < 0 || a > 1) {
    return null;
  }

  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`;
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

export function parseTextAlign(
  value: unknown,
): "left" | "center" | "right" | null {
  if (value === "left" || value === "center" || value === "right") {
    return value;
  }

  return null;
}
