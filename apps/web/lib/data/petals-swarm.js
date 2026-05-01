import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * IPIP-0031: read view of the public Petals swarm.
 *
 * Aggregates providers whose specs.petals_models is non-empty into a
 * "model → node count" map for the dashboard badge + `infernet
 * inference list` CLI surface.
 *
 * Returns:
 *   {
 *     models: [
 *       { model, node_count, providers: [{ id, name, public_key }] }
 *     ],
 *     total_nodes: number,
 *     total_models: number
 *   }
 */
export async function listPetalsSwarm({ minStatus = "available" } = {}) {
    const supabase = getSupabaseServerClient();
    const { data: rows } = await supabase
        .from("providers")
        .select("id, name, public_key, status, specs")
        .eq("status", minStatus)
        .limit(500);

    const byModel = new Map(); // model → { providers: [{...}] }
    for (const r of rows ?? []) {
        const models = r.specs?.petals_models ?? [];
        if (!Array.isArray(models) || models.length === 0) continue;
        for (const m of models) {
            if (typeof m !== "string" || !m) continue;
            if (!byModel.has(m)) byModel.set(m, { providers: [] });
            byModel.get(m).providers.push({
                id: r.id,
                name: r.name,
                public_key: r.public_key
            });
        }
    }

    const models = Array.from(byModel.entries())
        .map(([model, v]) => ({ model, node_count: v.providers.length, providers: v.providers }))
        .sort((a, b) => b.node_count - a.node_count);

    return {
        models,
        total_nodes: new Set((rows ?? [])
            .filter((r) => Array.isArray(r.specs?.petals_models) && r.specs.petals_models.length > 0)
            .map((r) => r.id)).size,
        total_models: models.length
    };
}
