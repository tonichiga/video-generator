import path from "node:path";

export const localStorageRoot = process.env.LOCAL_STORAGE_ROOT
  ? path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_STORAGE_ROOT)
  : path.resolve(process.cwd(), "local-storage");

export const watermarkEnabledByEnv = process.env.WATERMARK_ENABLED !== "false";

export const previewTimelineV1EnabledByEnv =
  process.env.PREVIEW_TIMELINE_V1 === "true";
