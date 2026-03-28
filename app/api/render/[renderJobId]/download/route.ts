import path from "node:path";
import fs from "node:fs/promises";

import { errorResponse } from "@/lib/server/errors";
import { getAssetById, getRenderJobById } from "@/lib/server/repository";
import { getStorageDirs } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/render/[renderJobId]/download">,
) {
  const { renderJobId } = await context.params;
  const job = await getRenderJobById(renderJobId);

  if (!job) {
    return errorResponse(404, "RENDER_JOB_NOT_FOUND", "Render job not found");
  }

  if (job.status !== "done" || !job.outputAssetId) {
    return errorResponse(
      409,
      "RENDER_NOT_READY",
      "Render job is not finished yet",
    );
  }

  const asset = await getAssetById(job.outputAssetId);
  if (!asset) {
    return errorResponse(
      404,
      "RENDER_OUTPUT_NOT_FOUND",
      "Render output asset not found",
    );
  }

  const absolutePath = path.isAbsolute(asset.filePath)
    ? asset.filePath
    : path.join(getStorageDirs().renders, asset.filePath);

  const fileBuffer = await fs.readFile(absolutePath).catch(() => null);
  if (!fileBuffer) {
    return errorResponse(
      404,
      "RENDER_OUTPUT_NOT_FOUND",
      "Render file missing on disk",
    );
  }

  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename=\"${renderJobId}.mp4\"`,
      "Cache-Control": "no-store",
    },
  });
}
