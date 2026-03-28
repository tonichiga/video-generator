import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { getRenderJobById } from "@/lib/server/repository";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/render/[renderJobId]/status">,
) {
  const { renderJobId } = await context.params;
  const job = await getRenderJobById(renderJobId);

  if (!job) {
    return errorResponse(404, "RENDER_JOB_NOT_FOUND", "Render job not found");
  }

  return NextResponse.json(
    {
      renderJobId: job.id,
      status: job.status,
      progress: job.progress,
      watermarkApplied: job.watermarkApplied,
      error:
        job.errorCode || job.errorMessage
          ? {
              code: job.errorCode,
              message: job.errorMessage,
            }
          : null,
    },
    { status: 200 },
  );
}
