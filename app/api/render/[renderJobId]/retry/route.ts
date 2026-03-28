import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { renderWatermarkConfig } from "@/lib/server/env";
import { createId } from "@/lib/server/ids";
import {
  getProjectById,
  getRenderJobById,
  insertRenderJob,
  updateRenderJobById,
} from "@/lib/server/repository";
import { runRenderJob } from "@/lib/server/render";

export async function POST(
  request: Request,
  context: RouteContext<"/api/render/[renderJobId]/retry">,
) {
  const { renderJobId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "RETRY_INVALID_JSON",
      "Request body must be valid JSON",
    );
  }

  const clientToken = (body as { clientToken?: unknown }).clientToken;
  if (typeof clientToken !== "string") {
    return errorResponse(
      400,
      "RETRY_CLIENT_TOKEN_REQUIRED",
      "clientToken is required",
    );
  }

  const sourceJob = await getRenderJobById(renderJobId);
  if (!sourceJob) {
    return errorResponse(404, "RENDER_JOB_NOT_FOUND", "Render job not found");
  }

  const project = await getProjectById(sourceJob.projectId);
  if (!project) {
    return errorResponse(404, "RENDER_PROJECT_NOT_FOUND", "Project not found");
  }

  if (project.clientToken !== clientToken) {
    return errorResponse(403, "RENDER_FORBIDDEN", "clientToken mismatch");
  }

  const nextRenderJobId = createId("job");
  const watermarkApplied =
    project.watermarkEnabled && renderWatermarkConfig.enabled;
  await insertRenderJob({
    id: nextRenderJobId,
    projectId: sourceJob.projectId,
    status: "queued",
    progress: 0,
    outputAssetId: null,
    outputPath: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    watermarkApplied,
    createdAt: new Date().toISOString(),
  });

  void runRenderJob({ renderJobId: nextRenderJobId }).catch((error) => {
    console.error("[render] retry bootstrap failed", {
      renderJobId: nextRenderJobId,
      sourceRenderJobId: renderJobId,
      error,
    });
    void updateRenderJobById(nextRenderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "RENDER_BOOTSTRAP_FAILED",
      errorMessage:
        error instanceof Error ? error.message : "Render job bootstrap failed",
      finishedAt: new Date().toISOString(),
    });
  });

  return NextResponse.json(
    {
      renderJobId: nextRenderJobId,
      status: "queued",
      retriedFrom: renderJobId,
    },
    { status: 202 },
  );
}
