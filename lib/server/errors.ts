import { NextResponse } from "next/server";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const payload: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  return NextResponse.json(payload, { status });
}
