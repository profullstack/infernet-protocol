import { NextResponse } from "next/server";
import { runpod } from "@infernet/deploy-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy — list the RunPod GPU types visible to the user's API key.
 * The key is provided once per request and never persisted.
 *
 * Request headers:
 *   x-runpod-api-key: <user's RunPod API key>
 */
export async function GET(request) {
  const apiKey = request.headers.get("x-runpod-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing x-runpod-api-key header" }, { status: 400 });
  }

  try {
    const gpuTypes = await runpod.listGpuTypes(apiKey);
    return NextResponse.json({ gpuTypes });
  } catch (err) {
    return NextResponse.json(
      { error: "RunPod GPU listing failed", detail: err?.message ?? String(err) },
      { status: 502 }
    );
  }
}
