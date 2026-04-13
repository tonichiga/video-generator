import { NextResponse } from "next/server";

import {
  defaultEqualizerConfig,
  defaultParticleConfig,
  defaultPosterConfig,
  defaultTrackTextConfig,
} from "@/lib/domain/defaults";
import { builtInTemplates } from "@/lib/domain/templates";
import type { Project } from "@/lib/domain/types";
import { errorResponse } from "@/lib/server/errors";
import { watermarkEnabledByEnv } from "@/lib/server/env";
import { createId } from "@/lib/server/ids";
import {
  getAnalysisById,
  getAssetById,
  insertProject,
} from "@/lib/server/repository";
import { ensureStorageReady } from "@/lib/server/storage";
import {
  isValidProfile,
  parseFormat,
  parseHexColor,
  parseNumberInRange,
  parseQuality,
  parseTextAlign,
  parseVisualizerType,
} from "@/lib/server/validation";
import {
  defaultTimelineForTrack,
  parseKeyframes,
  parseTimelineState,
} from "@/lib/server/timeline-validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureStorageReady();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "PROJECT_INVALID_JSON",
      "Request body must be valid JSON",
    );
  }

  const payload =
    (body as {
      clientToken?: unknown;
      name?: unknown;
      format?: unknown;
      quality?: unknown;
      fps?: unknown;
      trackAssetId?: unknown;
      posterAssetId?: unknown;
      backgroundAssetId?: unknown;
      renderBackgroundAssetId?: unknown;
      analysisId?: unknown;
      templateId?: unknown;
      particleConfig?: unknown;
      equalizerConfig?: unknown;
      posterConfig?: unknown;
      trackTextConfig?: unknown;
      watermarkEnabled?: unknown;
      timeline?: unknown;
      keyframes?: unknown;
    }) ?? {};

  if (
    typeof payload.clientToken !== "string" ||
    payload.clientToken.length < 3
  ) {
    return errorResponse(
      400,
      "PROJECT_CLIENT_TOKEN_REQUIRED",
      "clientToken is required",
    );
  }

  if (typeof payload.name !== "string" || payload.name.trim().length < 1) {
    return errorResponse(400, "PROJECT_NAME_REQUIRED", "name is required");
  }

  const format = parseFormat(payload.format);
  const quality = parseQuality(payload.quality);

  if (!format || !quality || !isValidProfile(format, quality)) {
    return errorResponse(
      400,
      "PROJECT_INVALID_PROFILE",
      "format and quality combination is invalid",
    );
  }

  if (payload.fps !== 30) {
    return errorResponse(400, "PROJECT_FPS_INVALID", "fps must be 30 for MVP");
  }

  if (
    typeof payload.trackAssetId !== "string" ||
    typeof payload.posterAssetId !== "string"
  ) {
    return errorResponse(
      400,
      "PROJECT_ASSET_LINK_INVALID",
      "trackAssetId and posterAssetId are required",
    );
  }

  if (typeof payload.analysisId !== "string") {
    return errorResponse(
      400,
      "PROJECT_ANALYSIS_REQUIRED",
      "analysisId is required",
    );
  }

  const [trackAsset, posterAsset, analysis] = await Promise.all([
    getAssetById(payload.trackAssetId),
    getAssetById(payload.posterAssetId),
    getAnalysisById(payload.analysisId),
  ]);

  const backgroundAssetId =
    typeof payload.backgroundAssetId === "string" &&
    payload.backgroundAssetId.length > 0
      ? payload.backgroundAssetId
      : null;

  let backgroundAsset: Awaited<ReturnType<typeof getAssetById>> = null;
  if (backgroundAssetId) {
    backgroundAsset = await getAssetById(backgroundAssetId);
    if (!backgroundAsset || backgroundAsset.kind !== "poster") {
      return errorResponse(
        404,
        "PROJECT_BACKGROUND_NOT_FOUND",
        "Background asset not found",
      );
    }
  }

  const renderBackgroundAssetId =
    typeof payload.renderBackgroundAssetId === "string" &&
    payload.renderBackgroundAssetId.length > 0
      ? payload.renderBackgroundAssetId
      : null;

  let renderBackgroundAsset: Awaited<ReturnType<typeof getAssetById>> = null;
  if (renderBackgroundAssetId) {
    renderBackgroundAsset = await getAssetById(renderBackgroundAssetId);
    if (!renderBackgroundAsset || renderBackgroundAsset.kind !== "poster") {
      return errorResponse(
        404,
        "PROJECT_RENDER_BACKGROUND_NOT_FOUND",
        "Render background asset not found",
      );
    }
  }

  if (!trackAsset || trackAsset.kind !== "track") {
    return errorResponse(
      404,
      "PROJECT_TRACK_NOT_FOUND",
      "Track asset not found",
    );
  }

  if (!posterAsset || posterAsset.kind !== "poster") {
    return errorResponse(
      404,
      "PROJECT_POSTER_NOT_FOUND",
      "Poster asset not found",
    );
  }

  if (
    !analysis ||
    analysis.trackAssetId !== trackAsset.id ||
    analysis.status !== "done"
  ) {
    return errorResponse(
      400,
      "PROJECT_ANALYSIS_NOT_READY",
      "analysisId is not done for this track",
    );
  }

  const templateId =
    typeof payload.templateId === "string" ? payload.templateId : null;
  if (templateId && !builtInTemplates.some((tpl) => tpl.id === templateId)) {
    return errorResponse(
      400,
      "PROJECT_TEMPLATE_INVALID",
      "templateId is not recognized",
    );
  }

  let equalizerConfig = defaultEqualizerConfig;
  if (payload.equalizerConfig && typeof payload.equalizerConfig === "object") {
    const next = payload.equalizerConfig as Record<string, unknown>;
    const x = parseNumberInRange(next.x, 0, 1);
    const y = parseNumberInRange(next.y, 0, 1);
    const width = parseNumberInRange(next.width, 0.1, 1);
    const height = parseNumberInRange(next.height, 0.05, 0.4);
    const color = parseHexColor(next.color);
    const barCountRaw = parseNumberInRange(next.barCount, 8, 96);
    const barCount = barCountRaw === null ? null : Math.round(barCountRaw);
    const visualizerType =
      parseVisualizerType(next.visualizerType) ??
      defaultEqualizerConfig.visualizerType ??
      "bars";

    if (
      x === null ||
      y === null ||
      width === null ||
      height === null ||
      color === null
    ) {
      return errorResponse(
        400,
        "PROJECT_EQUALIZER_INVALID",
        "equalizerConfig values are invalid",
      );
    }

    equalizerConfig = {
      x,
      y,
      width,
      height,
      color,
      visualizerType,
      barCount: barCount ?? defaultEqualizerConfig.barCount,
    };
  }

  let posterConfig = defaultPosterConfig;
  if (payload.posterConfig && typeof payload.posterConfig === "object") {
    const next = payload.posterConfig as Record<string, unknown>;
    const cornerRadius = parseNumberInRange(next.cornerRadius, 0, 180);
    const blurStrength = parseNumberInRange(next.blurStrength, 0, 80);
    const backgroundDimStrength = parseNumberInRange(
      next.backgroundDimStrength,
      0,
      0.85,
    );
    const beatScaleStrength =
      next.beatScaleStrength === undefined
        ? (defaultPosterConfig.beatScaleStrength ?? 1)
        : parseNumberInRange(next.beatScaleStrength, 0, 5);
    const cameraPunchStrength =
      next.cameraPunchStrength === undefined
        ? (defaultPosterConfig.cameraPunchStrength ?? 0)
        : parseNumberInRange(next.cameraPunchStrength, 0, 3);
    const parallaxDriftStrength =
      next.parallaxDriftStrength === undefined
        ? (defaultPosterConfig.parallaxDriftStrength ?? 0)
        : parseNumberInRange(next.parallaxDriftStrength, 0, 3);
    const bannerScale =
      next.bannerScale === undefined
        ? (defaultPosterConfig.bannerScale ?? 0.56)
        : parseNumberInRange(next.bannerScale, 0.2, 0.8);
    const bannerBorderEnabled =
      next.bannerBorderEnabled === undefined
        ? (defaultPosterConfig.bannerBorderEnabled ?? true)
        : typeof next.bannerBorderEnabled === "boolean"
          ? next.bannerBorderEnabled
          : null;
    const bannerBorderColor =
      next.bannerBorderColor === undefined
        ? (defaultPosterConfig.bannerBorderColor ?? "#dceaff")
        : parseHexColor(next.bannerBorderColor);
    const bannerBorderWidth =
      next.bannerBorderWidth === undefined
        ? (defaultPosterConfig.bannerBorderWidth ?? 2)
        : parseNumberInRange(next.bannerBorderWidth, 0, 12);

    if (
      cornerRadius === null ||
      blurStrength === null ||
      backgroundDimStrength === null ||
      beatScaleStrength === null ||
      cameraPunchStrength === null ||
      parallaxDriftStrength === null ||
      bannerScale === null ||
      bannerBorderEnabled === null ||
      bannerBorderColor === null ||
      bannerBorderWidth === null
    ) {
      return errorResponse(
        400,
        "PROJECT_POSTER_CONFIG_INVALID",
        "posterConfig values are invalid",
      );
    }

    posterConfig = {
      cornerRadius,
      blurStrength,
      backgroundDimStrength,
      beatScaleStrength,
      cameraPunchStrength,
      parallaxDriftStrength,
      bannerScale,
      bannerBorderEnabled,
      bannerBorderColor,
      bannerBorderWidth,
    };
  }

  let trackTextConfig = defaultTrackTextConfig;
  if (payload.trackTextConfig && typeof payload.trackTextConfig === "object") {
    const next = payload.trackTextConfig as Record<string, unknown>;
    const artist =
      typeof next.artist === "string" ? next.artist.trim().slice(0, 120) : "";
    const songName =
      typeof next.songName === "string"
        ? next.songName.trim().slice(0, 120)
        : "";
    const color = parseHexColor(next.color);
    const x = parseNumberInRange(next.x, 0, 1);
    const y = parseNumberInRange(next.y, 0, 1);
    const size = parseNumberInRange(next.size, 14, 120);
    const gap =
      next.gap === undefined
        ? defaultTrackTextConfig.gap
        : parseNumberInRange(next.gap, 0, 120);
    const align = parseTextAlign(next.align);

    if (
      !artist ||
      !songName ||
      color === null ||
      x === null ||
      y === null ||
      size === null ||
      gap === null ||
      !align
    ) {
      return errorResponse(
        400,
        "PROJECT_TRACK_TEXT_INVALID",
        "trackTextConfig values are invalid",
      );
    }

    trackTextConfig = {
      artist,
      songName,
      color,
      x,
      y,
      size,
      gap,
      align,
    };
  }

  const now = new Date().toISOString();
  const trackDurationMs = Math.max(
    100,
    Math.round((trackAsset.durationSec ?? 120) * 1000),
  );

  const defaultTimeline = defaultTimelineForTrack(trackDurationMs);
  const timeline =
    payload.timeline === undefined
      ? defaultTimeline
      : parseTimelineState(payload.timeline, trackDurationMs, defaultTimeline);

  if (!timeline) {
    return errorResponse(
      400,
      "PROJECT_TIMELINE_INVALID",
      "timeline values are invalid",
    );
  }

  const keyframes =
    payload.keyframes === undefined
      ? []
      : parseKeyframes(payload.keyframes, {
          timeline,
          trackDurationMs,
        });

  if (!keyframes) {
    return errorResponse(
      400,
      "PROJECT_KEYFRAMES_INVALID",
      "keyframes values are invalid",
    );
  }

  const project: Project = {
    id: createId("prj"),
    clientToken: payload.clientToken,
    name: payload.name.trim(),
    format,
    quality,
    fps: 30,
    trackAssetId: trackAsset.id,
    posterAssetId: posterAsset.id,
    backgroundAssetId: backgroundAsset?.id ?? null,
    renderBackgroundAssetId: renderBackgroundAsset?.id ?? null,
    analysisId: analysis.id,
    templateId,
    particleConfig:
      (payload.particleConfig as Project["particleConfig"]) ??
      defaultParticleConfig,
    equalizerConfig,
    posterConfig,
    trackTextConfig,
    watermarkEnabled:
      typeof payload.watermarkEnabled === "boolean"
        ? payload.watermarkEnabled
        : watermarkEnabledByEnv,
    timeline,
    keyframes,
    createdAt: now,
    updatedAt: now,
  };

  await insertProject(project);

  return NextResponse.json(
    {
      projectId: project.id,
    },
    { status: 201 },
  );
}
