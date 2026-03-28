import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import {
  getAssetById,
  getProjectById,
  updateProjectById,
} from "@/lib/server/repository";
import {
  defaultTimelineForTrack,
  parseKeyframes,
  parseTimelineState,
} from "@/lib/server/timeline-validation";
import {
  parseHexColor,
  parseNumberInRange,
  parseVisualizerType,
} from "@/lib/server/validation";

async function loadProject(projectId: string) {
  const project = await getProjectById(projectId);
  if (!project) {
    return {
      error: errorResponse(404, "PROJECT_NOT_FOUND", "Project not found"),
    };
  }
  return { project };
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]">,
) {
  const { projectId } = await context.params;
  const url = new URL(request.url);
  const clientToken = url.searchParams.get("clientToken");

  const loaded = await loadProject(projectId);
  if (loaded.error) {
    return loaded.error;
  }

  if (!clientToken || clientToken !== loaded.project.clientToken) {
    return errorResponse(403, "PROJECT_FORBIDDEN", "clientToken mismatch");
  }

  return NextResponse.json(
    {
      projectId: loaded.project.id,
      clientToken: loaded.project.clientToken,
      name: loaded.project.name,
      format: loaded.project.format,
      quality: loaded.project.quality,
      fps: loaded.project.fps,
      trackAssetId: loaded.project.trackAssetId,
      posterAssetId: loaded.project.posterAssetId,
      analysisId: loaded.project.analysisId,
      templateId: loaded.project.templateId,
      particleConfig: loaded.project.particleConfig,
      equalizerConfig: loaded.project.equalizerConfig,
      posterConfig: loaded.project.posterConfig,
      watermarkEnabled: loaded.project.watermarkEnabled,
      timeline: loaded.project.timeline ?? null,
      keyframes: loaded.project.keyframes ?? [],
      updatedAt: loaded.project.updatedAt,
    },
    { status: 200 },
  );
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]">,
) {
  const { projectId } = await context.params;

  const loaded = await loadProject(projectId);
  if (loaded.error) {
    return loaded.error;
  }

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
      equalizerConfig?: unknown;
      particleConfig?: unknown;
      posterConfig?: unknown;
      templateId?: unknown;
      watermarkEnabled?: unknown;
      timeline?: unknown;
      keyframes?: unknown;
    }) ?? {};

  if (
    typeof payload.clientToken !== "string" ||
    payload.clientToken !== loaded.project.clientToken
  ) {
    return errorResponse(403, "PROJECT_FORBIDDEN", "clientToken mismatch");
  }

  const patch: Partial<typeof loaded.project> = {};

  if (typeof payload.name === "string" && payload.name.trim().length > 0) {
    patch.name = payload.name.trim();
  }

  if (typeof payload.templateId === "string" || payload.templateId === null) {
    patch.templateId = payload.templateId;
  }

  if (typeof payload.watermarkEnabled === "boolean") {
    patch.watermarkEnabled = payload.watermarkEnabled;
  }

  const trackAsset = await getAssetById(loaded.project.trackAssetId);
  if (!trackAsset || trackAsset.kind !== "track") {
    return errorResponse(
      400,
      "PROJECT_TRACK_NOT_FOUND",
      "Track asset not found for timeline validation",
    );
  }

  const trackDurationMs = Math.max(
    100,
    Math.round((trackAsset.durationSec ?? 120) * 1000),
  );

  const defaultTimeline =
    loaded.project.timeline ?? defaultTimelineForTrack(trackDurationMs);

  let effectiveTimeline = defaultTimeline;

  if (payload.timeline !== undefined) {
    const timeline = parseTimelineState(
      payload.timeline,
      trackDurationMs,
      defaultTimeline,
    );

    if (!timeline) {
      return errorResponse(
        400,
        "PROJECT_TIMELINE_INVALID",
        "timeline values are invalid",
      );
    }

    patch.timeline = timeline;
    effectiveTimeline = timeline;
  }

  if (payload.keyframes !== undefined) {
    const keyframes = parseKeyframes(payload.keyframes, {
      timeline: effectiveTimeline,
      trackDurationMs,
    });

    if (!keyframes) {
      return errorResponse(
        400,
        "PROJECT_KEYFRAMES_INVALID",
        "keyframes values are invalid",
      );
    }

    patch.keyframes = keyframes;
  }

  if (payload.equalizerConfig && typeof payload.equalizerConfig === "object") {
    const next = payload.equalizerConfig as Record<string, unknown>;
    const x = parseNumberInRange(next.x, 0, 1);
    const y = parseNumberInRange(next.y, 0, 1);
    const width = parseNumberInRange(next.width, 0.1, 1);
    const height = parseNumberInRange(next.height, 0.05, 0.4);
    const color = parseHexColor(next.color);
    const visualizerType =
      parseVisualizerType(next.visualizerType) ??
      loaded.project.equalizerConfig.visualizerType ??
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

    patch.equalizerConfig = {
      x,
      y,
      width,
      height,
      color,
      visualizerType,
    };
  }

  if (payload.particleConfig && typeof payload.particleConfig === "object") {
    patch.particleConfig =
      payload.particleConfig as typeof loaded.project.particleConfig;
  }

  if (payload.posterConfig && typeof payload.posterConfig === "object") {
    patch.posterConfig =
      payload.posterConfig as typeof loaded.project.posterConfig;
  }

  const updated = await updateProjectById(projectId, patch);
  if (!updated) {
    return errorResponse(404, "PROJECT_NOT_FOUND", "Project not found");
  }

  return NextResponse.json(
    {
      projectId: updated.id,
      updated: true,
    },
    { status: 200 },
  );
}
