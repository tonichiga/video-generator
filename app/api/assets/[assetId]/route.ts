import fs from "node:fs/promises";

import { errorResponse } from "@/lib/server/errors";
import { getAssetById } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/assets/[assetId]">,
) {
  const { assetId } = await context.params;
  const asset = await getAssetById(assetId);

  if (!asset) {
    return errorResponse(404, "ASSET_NOT_FOUND", "Asset not found");
  }

  const buffer = await fs.readFile(asset.filePath).catch(() => null);
  if (!buffer) {
    return errorResponse(404, "ASSET_FILE_MISSING", "Asset file is missing");
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
