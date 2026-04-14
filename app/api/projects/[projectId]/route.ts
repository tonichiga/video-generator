import { NextResponse } from "next/server";

import {
  defaultEqualizerConfig,
  defaultPosterConfig,
  defaultTrackTextConfig,
} from "@/lib/domain/defaults";
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
  parseTextAlign,
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
      backgroundAssetId: loaded.project.backgroundAssetId ?? null,
      renderBackgroundAssetId: loaded.project.renderBackgroundAssetId ?? null,
      analysisId: loaded.project.analysisId,
      templateId: loaded.project.templateId,
      particleConfig: loaded.project.particleConfig,
      equalizerConfig: loaded.project.equalizerConfig,
      posterConfig: loaded.project.posterConfig,
      trackTextConfig: {
        ...defaultTrackTextConfig,
        ...(loaded.project.trackTextConfig ?? {}),
      },
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
      trackTextConfig?: unknown;
      backgroundAssetId?: unknown;
      renderBackgroundAssetId?: unknown;
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

  if (payload.backgroundAssetId !== undefined) {
    if (payload.backgroundAssetId === null) {
      patch.backgroundAssetId = null;
    } else if (
      typeof payload.backgroundAssetId === "string" &&
      payload.backgroundAssetId.length > 0
    ) {
      const backgroundAsset = await getAssetById(payload.backgroundAssetId);
      if (!backgroundAsset || backgroundAsset.kind !== "poster") {
        return errorResponse(
          404,
          "PROJECT_BACKGROUND_NOT_FOUND",
          "Background asset not found",
        );
      }

      patch.backgroundAssetId = backgroundAsset.id;
    } else {
      return errorResponse(
        400,
        "PROJECT_BACKGROUND_INVALID",
        "backgroundAssetId must be null or a non-empty string",
      );
    }
  }

  if (payload.renderBackgroundAssetId !== undefined) {
    if (payload.renderBackgroundAssetId === null) {
      patch.renderBackgroundAssetId = null;
    } else if (
      typeof payload.renderBackgroundAssetId === "string" &&
      payload.renderBackgroundAssetId.length > 0
    ) {
      const renderBackgroundAsset = await getAssetById(
        payload.renderBackgroundAssetId,
      );
      if (!renderBackgroundAsset || renderBackgroundAsset.kind !== "poster") {
        return errorResponse(
          404,
          "PROJECT_RENDER_BACKGROUND_NOT_FOUND",
          "Render background asset not found",
        );
      }

      patch.renderBackgroundAssetId = renderBackgroundAsset.id;
    } else {
      return errorResponse(
        400,
        "PROJECT_RENDER_BACKGROUND_INVALID",
        "renderBackgroundAssetId must be null or a non-empty string",
      );
    }
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
    const glowStrength =
      next.glowStrength === undefined
        ? (loaded.project.equalizerConfig.glowStrength ??
          defaultEqualizerConfig.glowStrength ??
          0.9)
        : parseNumberInRange(next.glowStrength, 0, 6);
    const glowColor =
      next.glowColor === undefined
        ? (loaded.project.equalizerConfig.glowColor ??
          defaultEqualizerConfig.glowColor ??
          "#7fd2ff")
        : parseHexColor(next.glowColor);
    const glowSpread =
      next.glowSpread === undefined
        ? (loaded.project.equalizerConfig.glowSpread ??
          defaultEqualizerConfig.glowSpread ??
          1)
        : parseNumberInRange(next.glowSpread, 0, 4);
    const barCountRaw = parseNumberInRange(next.barCount, 8, 96);
    const barCount = barCountRaw === null ? null : Math.round(barCountRaw);
    const visualizerType =
      parseVisualizerType(next.visualizerType) ??
      loaded.project.equalizerConfig.visualizerType ??
      "bars";

    if (
      x === null ||
      y === null ||
      width === null ||
      height === null ||
      color === null ||
      glowStrength === null ||
      glowColor === null ||
      glowSpread === null
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
      glowStrength,
      glowColor,
      glowSpread,
      visualizerType,
      barCount: barCount ?? loaded.project.equalizerConfig.barCount ?? 36,
    };
  }

  if (payload.particleConfig && typeof payload.particleConfig === "object") {
    patch.particleConfig =
      payload.particleConfig as typeof loaded.project.particleConfig;
  }

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
        ? (loaded.project.posterConfig.beatScaleStrength ??
          defaultPosterConfig.beatScaleStrength ??
          1)
        : parseNumberInRange(next.beatScaleStrength, 0, 5);
    const beatStrobeSoftStrength =
      next.beatStrobeSoftStrength === undefined
        ? (loaded.project.posterConfig.beatStrobeSoftStrength ??
          defaultPosterConfig.beatStrobeSoftStrength ??
          0)
        : parseNumberInRange(next.beatStrobeSoftStrength, 0, 3);
    const beatStrobeSoftColor =
      next.beatStrobeSoftColor === undefined
        ? (loaded.project.posterConfig.beatStrobeSoftColor ??
          defaultPosterConfig.beatStrobeSoftColor ??
          "#ffffff")
        : parseHexColor(next.beatStrobeSoftColor);
    const cameraPunchStrength =
      next.cameraPunchStrength === undefined
        ? (loaded.project.posterConfig.cameraPunchStrength ??
          defaultPosterConfig.cameraPunchStrength ??
          0)
        : parseNumberInRange(next.cameraPunchStrength, 0, 3);
    const lowEndShakeStrength =
      next.lowEndShakeStrength === undefined
        ? (loaded.project.posterConfig.lowEndShakeStrength ??
          defaultPosterConfig.lowEndShakeStrength ??
          0)
        : parseNumberInRange(next.lowEndShakeStrength, 0, 3);
    const parallaxDriftStrength =
      next.parallaxDriftStrength === undefined
        ? (loaded.project.posterConfig.parallaxDriftStrength ??
          defaultPosterConfig.parallaxDriftStrength ??
          0)
        : parseNumberInRange(next.parallaxDriftStrength, 0, 3);
    const bannerScale =
      next.bannerScale === undefined
        ? (loaded.project.posterConfig.bannerScale ??
          defaultPosterConfig.bannerScale ??
          0.56)
        : parseNumberInRange(next.bannerScale, 0.2, 0.8);
    const bannerBorderEnabled =
      next.bannerBorderEnabled === undefined
        ? (loaded.project.posterConfig.bannerBorderEnabled ??
          defaultPosterConfig.bannerBorderEnabled ??
          true)
        : typeof next.bannerBorderEnabled === "boolean"
          ? next.bannerBorderEnabled
          : null;
    const bannerBorderColor =
      next.bannerBorderColor === undefined
        ? (loaded.project.posterConfig.bannerBorderColor ??
          defaultPosterConfig.bannerBorderColor ??
          "#dceaff")
        : parseHexColor(next.bannerBorderColor);
    const bannerBorderWidth =
      next.bannerBorderWidth === undefined
        ? (loaded.project.posterConfig.bannerBorderWidth ??
          defaultPosterConfig.bannerBorderWidth ??
          2)
        : parseNumberInRange(next.bannerBorderWidth, 0, 12);

    if (
      cornerRadius === null ||
      blurStrength === null ||
      backgroundDimStrength === null ||
      beatScaleStrength === null ||
      beatStrobeSoftStrength === null ||
      beatStrobeSoftColor === null ||
      cameraPunchStrength === null ||
      lowEndShakeStrength === null ||
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

    patch.posterConfig = {
      cornerRadius,
      blurStrength,
      backgroundDimStrength,
      beatScaleStrength,
      beatStrobeSoftStrength,
      beatStrobeSoftColor,
      cameraPunchStrength,
      lowEndShakeStrength,
      parallaxDriftStrength,
      bannerScale,
      bannerBorderEnabled,
      bannerBorderColor,
      bannerBorderWidth,
    };
  } else if (payload.posterConfig === null) {
    patch.posterConfig = defaultPosterConfig;
  }

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

    patch.trackTextConfig = {
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
