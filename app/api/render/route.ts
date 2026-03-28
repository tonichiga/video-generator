import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { createId } from "@/lib/server/ids";
import {
  getLatestActiveRenderJobByProjectId,
  getProjectById,
  insertRenderJob,
} from "@/lib/server/repository";
import { runRenderJob } from "@/lib/server/render";
import { ensureStorageReady } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureStorageReady();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "RENDER_INVALID_JSON", "Request body must be valid JSON");
  }

  const payload =
    (body as {
      projectId?: unknown;
      clientToken?: unknown;
      forceRestart?: unknown;
    }) ?? {};

  if (typeof payload.projectId !== "string" || typeof payload.clientToken !== "string") {
    return errorResponse(400, "RENDER_PARAMS_INVALID", "projectId and clientToken are required");
  }

  const project = await getProjectById(payload.projectId);
  if (!project) {
    return errorResponse(404, "RENDER_PROJECT_NOT_FOUND", "Project not found");
  }

  if (project.clientToken !== payload.clientToken) {
    return errorResponse(403, "RENDER_FORBIDDEN", "clientToken mismatch");
  }

  const forceRestart = payload.forceRestart === true;
  if (!forceRestart) {
    const activeJob = await getLatestActiveRenderJobByProjectId(project.id);
    if (activeJob) {
      return NextResponse.json(
        {
          renderJobId: activeJob.id,
          status: activeJob.status,
          reused: true,
        },
        { status: 202 },
      );
    }
  }

  const renderJobId = createId("job");
  await insertRenderJob({
    id: renderJobId,
    projectId: project.id,
    status: "queued",
    progress: 0,
    outputAssetId: null,
    outputPath: null,
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
    watermarkApplied: project.watermarkEnabled,
    createdAt: new Date().toISOString(),
  });

  void runRenderJob({ renderJobId });

  return NextResponse.json(
    {
      renderJobId,
      status: "queued",
      reused: false,
    },
    { status: 202 },
  );
}
