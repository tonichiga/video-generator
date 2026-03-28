import { NextResponse } from "next/server";

import { previewTimelineV1EnabledByEnv } from "@/lib/server/env";

export async function GET() {
  return NextResponse.json(
    {
      flags: {
        preview_timeline_v1: previewTimelineV1EnabledByEnv,
      },
    },
    { status: 200 },
  );
}
