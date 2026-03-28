import { NextResponse } from "next/server";

import { downsampleWaveform } from "@/lib/domain/timeline";
import { errorResponse } from "@/lib/server/errors";
import { getAnalysisById } from "@/lib/server/repository";
import { absolutePathFromRoot, readJson } from "@/lib/server/storage";

type EnvelopeSeries = {
  frameStepMs: number;
  values: number[];
};

export async function GET(
  request: Request,
  context: RouteContext<"/api/audio/analyze/[analysisId]/waveform">,
) {
  const { analysisId } = await context.params;
  const analysis = await getAnalysisById(analysisId);

  if (!analysis) {
    return errorResponse(404, "ANALYSIS_NOT_FOUND", "Analysis not found");
  }

  if (analysis.status !== "done") {
    return errorResponse(409, "ANALYSIS_NOT_READY", "Analysis is not done yet");
  }

  if (!analysis.envelopeSeriesPath) {
    return errorResponse(
      404,
      "ANALYSIS_ENVELOPE_MISSING",
      "Envelope series is missing",
    );
  }

  const binsParam = new URL(request.url).searchParams.get("bins");
  const requestedBins = binsParam ? Number(binsParam) : 720;
  const bins = Number.isFinite(requestedBins)
    ? Math.max(64, Math.min(2400, Math.round(requestedBins)))
    : 720;

  const envelope = await readJson<EnvelopeSeries>(
    absolutePathFromRoot(analysis.envelopeSeriesPath),
    {
      frameStepMs: analysis.frameStepMs,
      values: [],
    },
  );

  const values = downsampleWaveform(envelope.values ?? [], bins);
  const durationMs = Math.round(
    (envelope.values?.length ?? 0) * envelope.frameStepMs,
  );

  return NextResponse.json(
    {
      analysisId: analysis.id,
      frameStepMs: envelope.frameStepMs,
      durationMs,
      values,
    },
    { status: 200 },
  );
}
