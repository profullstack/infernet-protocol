import { NextResponse } from "next/server";

export async function handleRoute(handler) {
  try {
    return await handler();
  } catch (error) {
    const status = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error"
      },
      { status }
    );
  }
}
