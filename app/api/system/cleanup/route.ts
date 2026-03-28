import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/server/errors";
import { cleanupOldArtifacts } from "@/lib/server/cleanup";
import { ensureStorageReady } from "@/lib/server/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureStorageReady();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // allow empty body
  }

  const retentionHours =
    typeof (body as { retentionHours?: unknown }).retentionHours === "number"
      ? (body as { retentionHours: number }).retentionHours
      : 72;

  if (retentionHours < 1 || retentionHours > 24 * 60) {
    return errorResponse(
      400,
      "CLEANUP_RETENTION_INVALID",
      "retentionHours must be between 1 and 1440",
    );
  }

  const result = await cleanupOldArtifacts(retentionHours);

  return NextResponse.json(
    {
      deletedFiles: result.deletedFiles,
      freedBytes: result.freedBytes,
      retentionHours,
    },
    { status: 200 },
  );
}
