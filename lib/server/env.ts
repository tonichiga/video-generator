import path from "node:path";

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function parseNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export const localStorageRoot = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_STORAGE_ROOT)
  : path.resolve(process.cwd(), "local-storage");

const legacyWatermarkEnabled = parseBooleanEnv(
  process.env.WATERMARK_ENABLED,
  true,
);

export const renderWatermarkConfig = {
  enabled: parseBooleanEnv(
    process.env.RENDER_WATERMARK_ENABLED,
    legacyWatermarkEnabled,
  ),
  text:
    process.env.RENDER_WATERMARK_TEXT?.trim() || "Made with Video Generator",
  fontSize: parseNumberEnv(process.env.RENDER_WATERMARK_FONT_SIZE, 16, 10, 72),
};

export const watermarkEnabledByEnv = renderWatermarkConfig.enabled;

export const previewTimelineV1EnabledByEnv =
  process.env.PREVIEW_TIMELINE_V1 === "true";
