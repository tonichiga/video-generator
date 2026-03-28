import { NextResponse } from "next/server";

import { builtInTemplates } from "@/lib/domain/templates";

export async function GET() {
  return NextResponse.json(
    {
      items: builtInTemplates.map((tpl) => ({
        id: tpl.id,
        name: tpl.name,
        category: tpl.category,
        defaultPalette: tpl.defaultPalette,
        equalizerConfig: tpl.equalizerConfig,
        particleConfig: tpl.particleConfig,
        posterConfig: tpl.posterConfig,
      })),
    },
    { status: 200 },
  );
}
