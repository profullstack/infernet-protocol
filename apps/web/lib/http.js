import { NextResponse } from "next/server";

export async function handleRoute(handler) {
  try {
    return await handler();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected server error"
      },
      { status: 500 }
    );
  }
}
