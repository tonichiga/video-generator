import { NextResponse } from "next/server";

import {
  downsampleSpectrumFrames,
  normalizeSpectrumBands,
} from "@/lib/domain/spectrum";
import { errorResponse } from "@/lib/server/errors";
import { getAnalysisById } from "@/lib/server/repository";
import { absolutePathFromRoot, readJson } from "@/lib/server/storage";

type SpectrumSeries = {
  frameStepMs: number;
  bands: number;
  values: number[][];
};

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ analysisId: string }> },
) {
  const { analysisId } = await context.params;
  const analysis = await getAnalysisById(analysisId);

  if (!analysis) {
    return errorResponse(404, "ANALYSIS_NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "done") {
    return errorResponse(409, "ANALYSIS_NOT_READY", "Analysis is not done yet");
  }

  if (!analysis.spectrumSeriesPath) {
    return errorResponse(
      404,
      "ANALYSIS_SPECTRUM_MISSING",
      "Spectrum series is missing",
    );
  }

  const searchParams = new URL(request.url).searchParams;

  const requestedBars = Number(searchParams.get("bars") ?? "36");
  const bars = Number.isFinite(requestedBars)
    ? clampNumber(Math.round(requestedBars), 8, 96)
    : 36;

  const requestedMaxFrames = Number(searchParams.get("maxFrames") ?? "7200");
  const maxFrames = Number.isFinite(requestedMaxFrames)
    ? clampNumber(Math.round(requestedMaxFrames), 120, 12000)
    : 7200;

  const spectrum = await readJson<SpectrumSeries>(
    absolutePathFromRoot(analysis.spectrumSeriesPath),
    {
      frameStepMs: analysis.frameStepMs,
      bands: analysis.bands,
      values: [],
    },
  );

  const frameStepMs = Math.max(
    1,
    Math.round(spectrum.frameStepMs || analysis.frameStepMs),
  );
  const sampledFrames = downsampleSpectrumFrames(
    spectrum.values ?? [],
    maxFrames,
  );
  const values = sampledFrames.map((row) =>
    normalizeSpectrumBands(row ?? [], bars),
  );
  const durationMs = frameStepMs * values.length;

  return NextResponse.json(
    {
      analysisId: analysis.id,
      frameStepMs,
      durationMs,
      bars,
      values,
    },
    { status: 200 },
  );
}
