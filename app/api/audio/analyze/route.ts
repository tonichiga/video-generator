import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { createId } from "@/lib/server/ids";
import { runAudioAnalysisJob } from "@/lib/server/audio-analysis";
import { getAssetById, insertAnalysis } from "@/lib/server/repository";
import { ensureStorageReady } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureStorageReady();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "ANALYZE_INVALID_JSON",
      "Request body must be valid JSON",
    );
  }

  const {
    trackAssetId,
    bands = 64,
    frameStepMs = 33,
  } = (body as {
    trackAssetId?: unknown;
    bands?: unknown;
    frameStepMs?: unknown;
  }) ?? {};

  if (typeof trackAssetId !== "string") {
    return errorResponse(
      400,
      "ANALYZE_TRACK_REQUIRED",
      "trackAssetId is required",
    );
  }

  if (typeof bands !== "number" || bands < 8 || bands > 128) {
    return errorResponse(
      400,
      "ANALYZE_BANDS_INVALID",
      "bands must be a number between 8 and 128",
    );
  }

  if (
    typeof frameStepMs !== "number" ||
    frameStepMs < 16 ||
    frameStepMs > 200
  ) {
    return errorResponse(
      400,
      "ANALYZE_FRAME_STEP_INVALID",
      "frameStepMs must be a number between 16 and 200",
    );
  }

  const trackAsset = await getAssetById(trackAssetId);
  if (!trackAsset || trackAsset.kind !== "track") {
    return errorResponse(
      404,
      "ANALYZE_TRACK_NOT_FOUND",
      "Track asset not found",
    );
  }

  const analysisId = createId("an");
  await insertAnalysis({
    id: analysisId,
    trackAssetId,
    status: "processing",
    sampleRate: 44100,
    frameStepMs,
    bands,
    envelopeSeriesPath: "",
    spectrumSeriesPath: "",
    createdAt: new Date().toISOString(),
  });

  // Kick off async MVP job generation without blocking response.
  void runAudioAnalysisJob(analysisId);

  return NextResponse.json(
    {
      analysisId,
      status: "processing",
    },
    { status: 202 },
  );
}
