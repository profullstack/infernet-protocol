import { NextResponse } from "next/server";
import { handleRoute } from "@/lib/http";
import { getCurrentUser } from "@/lib/supabase/auth-server";
import { submitTrainingJob } from "@/lib/data/training-market";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/training/jobs — submit an open-market training job.
 *
 * User-authed (browser session OR CLI bearer). The submitter must
 * already have hosted the dataset somewhere reachable: dataset_base_url
 * is the public prefix; this endpoint generates one shard URL per shard
 * by appending /shard-N.jsonl.
 */
export async function POST(request) {
    return handleRoute(async () => {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "auth required" }, { status: 401 });
        }
        const body = await request.json();
        const result = await submitTrainingJob({
            submitterId: user.id,
            submitterPubkey: body.submitter_pubkey ?? null,
            name: body.name,
            baseModel: body.base_model,
            config: body.config,
            datasetBaseUrl: body.dataset_base_url,
            uploadBaseUrl: body.upload_base_url ?? null,
            numShards: body.num_shards,
            minVramGb: body.min_vram_gb ?? 16,
            pricePerShardUsd: body.price_per_shard_usd ?? 0,
            expiresAt: body.expires_at ?? null
        });
        return NextResponse.json({ data: result }, { status: 201 });
    });
}
