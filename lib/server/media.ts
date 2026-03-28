import { createHash } from "node:crypto";

import { parseBuffer } from "music-metadata";
import sharp from "sharp";

export async function getTrackDurationSec(
  fileBuffer: Buffer,
  mimeType: string,
) {
  const metadata = await parseBuffer(fileBuffer, mimeType, { duration: true });
  if (!metadata.format.duration) {
    return null;
  }
  return Number(metadata.format.duration.toFixed(2));
}

export async function getPosterDimensions(fileBuffer: Buffer) {
  const metadata = await sharp(fileBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    return null;
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

export function checksumOf(fileBuffer: Buffer) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}
