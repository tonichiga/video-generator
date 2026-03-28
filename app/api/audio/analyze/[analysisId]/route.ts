import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { getAnalysisById } from "@/lib/server/repository";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/audio/analyze/[analysisId]">,
) {
  const { analysisId } = await context.params;
  const analysis = await getAnalysisById(analysisId);

  if (!analysis) {
    return errorResponse(404, "ANALYSIS_NOT_FOUND", "Analysis not found");
  }

  return NextResponse.json(
    {
      analysisId: analysis.id,
      status: analysis.status,
      bands: analysis.bands,
      frameStepMs: analysis.frameStepMs,
      spectrumSeriesPath: analysis.spectrumSeriesPath,
      envelopeSeriesPath: analysis.envelopeSeriesPath,
    },
    { status: 200 },
  );
}
