import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { getProjectById, getRenderJobById } from "@/lib/server/repository";
import { cancelRenderJob } from "@/lib/server/render";

export async function POST(
  request: Request,
  context: RouteContext<"/api/render/[renderJobId]/cancel">,
) {
  const { renderJobId } = await context.params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }

  const clientToken =
    typeof (body as { clientToken?: unknown }).clientToken === "string"
      ? (body as { clientToken: string }).clientToken
      : null;

  const job = await getRenderJobById(renderJobId);
  if (!job) {
    return errorResponse(404, "RENDER_JOB_NOT_FOUND", "Render job not found");
  }

  const project = await getProjectById(job.projectId);
  if (!project) {
    return errorResponse(404, "RENDER_PROJECT_NOT_FOUND", "Project not found");
  }

  if (!clientToken || clientToken !== project.clientToken) {
    return errorResponse(403, "RENDER_FORBIDDEN", "clientToken mismatch");
  }

  const result = await cancelRenderJob(renderJobId);
  if (!result.found) {
    return errorResponse(404, "RENDER_JOB_NOT_FOUND", "Render job not found");
  }

  return NextResponse.json(
    {
      renderJobId,
      canceled: !result.finished,
      alreadyFinished: result.finished,
    },
    { status: 200 },
  );
}
