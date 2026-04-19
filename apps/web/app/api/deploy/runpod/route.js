import { NextResponse } from "next/server";
import { runpod } from "@infernetprotocol/deploy-providers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click deploy an Infernet provider node to RunPod.
 *
 * Request body:
 *   { apiKey: string,                  // user's RunPod API key (proxied, not stored)
 *     gpuTypeId: string,
 *     name?: string,
 *     supabaseUrl: string,             // which control plane the node should register with
 *     supabaseServiceRoleKey: string,  // passed through to the pod as env
 *     role?: 'provider' | 'aggregator'
 *   }
 *
 * Response:
 *   { deploymentId, status, image }
 *
 * SECURITY: This route receives two credentials (RunPod API key +
 * Supabase service-role key). Neither is stored. The RunPod key is
 * passed to their GraphQL API; the Supabase key is passed to the pod
 * as an env var so the CLI can register itself. An IP rate limit is
 * applied to deter enumeration.
 */

const limit = rateLimit({ windowMs: 60 * 60 * 1000, max: 6 });

function err(status, error, detail) {
  const body = { error };
  if (detail !== undefined) body.detail = detail;
  return NextResponse.json(body, { status });
}

export async function POST(request) {
  const ip = getClientIp(request);
  const r = limit.check(ip);
  if (!r.ok) {
    return err(429, "Rate limit exceeded", { resetAt: new Date(r.resetAt).toISOString() });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  const {
    apiKey,
    gpuTypeId,
    name,
    supabaseUrl,
    supabaseServiceRoleKey,
    role = "provider"
  } = payload ?? {};

  if (!apiKey)                 return err(400, "apiKey is required");
  if (!gpuTypeId)              return err(400, "gpuTypeId is required");
  if (!supabaseUrl)            return err(400, "supabaseUrl is required");
  if (!supabaseServiceRoleKey) return err(400, "supabaseServiceRoleKey is required");

  if (!["provider", "aggregator"].includes(role)) {
    return err(400, "role must be 'provider' or 'aggregator'");
  }

  const deploymentName = name?.trim() || `infernet-${role}-${Date.now()}`;

  try {
    const deployment = await runpod.createDeployment({
      apiKey,
      gpuTypeId,
      name: deploymentName,
      env: {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
        INFERNET_NODE_ROLE: role,
        INFERNET_NODE_NAME: deploymentName
      }
    });
    return NextResponse.json(deployment);
  } catch (e) {
    return err(502, "RunPod deployment failed", e?.message ?? String(e));
  }
}
