import path from "node:path";

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { createId } from "@/lib/server/ids";
import { checksumOf, getTrackDurationSec } from "@/lib/server/media";
import { insertAsset } from "@/lib/server/repository";
import {
  ensureStorageReady,
  getStorageDirs,
  relativePathFromRoot,
  writeBuffer,
} from "@/lib/server/storage";
import { isSupportedTrackMime } from "@/lib/server/validation";

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

  if (!isSupportedTrackMime(file.type)) {
    return errorResponse(
      415,
      "UPLOAD_UNSUPPORTED_MIME",
      "Unsupported track MIME type",
      {
        mimeType: file.type,
      },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    return errorResponse(400, "UPLOAD_EMPTY_FILE", "Uploaded file is empty");
  }

  const durationSec = await getTrackDurationSec(buffer, file.type).catch(
    () => null,
  );
  if (!durationSec) {
    return errorResponse(
      400,
      "UPLOAD_INVALID_AUDIO",
      "Could not read track metadata",
    );
  }

  const ext = path.extname(file.name) || ".bin";
  const assetId = createId("ast_track");
  const filePath = path.join(getStorageDirs().uploadsTrack, `${assetId}${ext}`);
  await writeBuffer(filePath, buffer);

  const asset = {
    id: assetId,
    kind: "track" as const,
    filePath,
    mimeType: file.type,
    size: buffer.length,
    durationSec,
    width: null,
    height: null,
    checksum: checksumOf(buffer),
    createdAt: new Date().toISOString(),
  };

  await insertAsset(asset);

  return NextResponse.json(
    {
      assetId: asset.id,
      mimeType: asset.mimeType,
      size: asset.size,
      durationSec: asset.durationSec,
      path: relativePathFromRoot(asset.filePath),
    },
    { status: 201 },
  );
}
