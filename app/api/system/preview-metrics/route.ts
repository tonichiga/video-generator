import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
      },
      { status: 400 },
    );
  }

  console.info("[preview-metrics]", body);

  return NextResponse.json(
    {
      ok: true,
    },
    { status: 202 },
  );
}
