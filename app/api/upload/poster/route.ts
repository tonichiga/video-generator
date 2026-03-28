import path from "node:path";

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { createId } from "@/lib/server/ids";
import { checksumOf, getPosterDimensions } from "@/lib/server/media";
import { insertAsset } from "@/lib/server/repository";
import {
  ensureStorageReady,
  getStorageDirs,
  relativePathFromRoot,
  writeBuffer,
} from "@/lib/server/storage";
import { isSupportedPosterMime } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureStorageReady();

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return errorResponse(
      400,
      "UPLOAD_FILE_REQUIRED",
      "Multipart field 'file' is required",
    );
  }

  if (!isSupportedPosterMime(file.type)) {
    return errorResponse(
      415,
      "UPLOAD_UNSUPPORTED_MIME",
      "Unsupported poster MIME type",
      {
        mimeType: file.type,
      },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return errorResponse(400, "UPLOAD_EMPTY_FILE", "Uploaded file is empty");
  }

  const dimensions = await getPosterDimensions(buffer).catch(() => null);
  if (!dimensions) {
    return errorResponse(
      400,
      "UPLOAD_INVALID_IMAGE",
      "Could not read image metadata",
    );
  }

  const ext = path.extname(file.name) || ".bin";
  const assetId = createId("ast_poster");
  const filePath = path.join(
    getStorageDirs().uploadsPoster,
    `${assetId}${ext}`,
  );
  await writeBuffer(filePath, buffer);

  const asset = {
    id: assetId,
    kind: "poster" as const,
    filePath,
    mimeType: file.type,
    size: buffer.length,
    durationSec: null,
    width: dimensions.width,
    height: dimensions.height,
    checksum: checksumOf(buffer),
    createdAt: new Date().toISOString(),
  };

  await insertAsset(asset);

  return NextResponse.json(
    {
      assetId: asset.id,
      mimeType: asset.mimeType,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      path: relativePathFromRoot(asset.filePath),
    },
    { status: 201 },
  );
}
