import { NextResponse } from "next/server";

import {
  defaultEqualizerConfig,
  defaultParticleConfig,
  defaultPosterConfig,
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
      analysisId?: unknown;
      templateId?: unknown;
      particleConfig?: unknown;
      equalizerConfig?: unknown;
      posterConfig?: unknown;
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
    analysisId: analysis.id,
    templateId,
    particleConfig:
      (payload.particleConfig as Project["particleConfig"]) ??
      defaultParticleConfig,
    equalizerConfig,
    posterConfig:
      (payload.posterConfig as Project["posterConfig"]) ?? defaultPosterConfig,
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
