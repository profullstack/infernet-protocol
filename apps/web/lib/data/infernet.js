import "server-only";
import { getEnv } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function withLimit(query, limit) {
  const pageSize = getEnv().pageSize;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : pageSize;
  return query.limit(Math.min(safeLimit, 100));
}

function mapCurrency(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `$${Number(value).toFixed(4)}`;
}

function mapNode(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    location: row.location || row.region || "unknown",
    capacity: row.capacity || row.compute_capacity || "—"
  };
}

function mapProvider(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    gpu_summary: summarizeGpu(row),
    cpu_summary: summarizeCpu(row.specs),
    fabric: summarizeFabric(row.specs),
    price_display: mapCurrency(row.price),
    reputation: row.reputation ?? "—"
  };
}

function summarizeGpu(row) {
  const specs = row.specs && typeof row.specs === "object" ? row.specs : {};
  if (Array.isArray(specs.gpus) && specs.gpus.length > 0) {
    const first = specs.gpus[0];
    const more = specs.gpus.length > 1 ? ` +${specs.gpus.length - 1}` : "";
    return `${first.model ?? first.vendor ?? "GPU"}${more}`;
  }
  return row.gpu_model || "—";
}

function summarizeCpu(specs) {
  if (!specs || typeof specs !== "object" || !specs.cpu) return "—";
  const c = specs.cpu;
  const parts = [];
  if (c.vendor) parts.push(c.vendor);
  if (c.arch) parts.push(c.arch);
  if (Number.isFinite(c.cores)) parts.push(`${c.cores} cores`);
  return parts.join(" · ") || "—";
}

function summarizeFabric(specs) {
  if (!specs || typeof specs !== "object" || !specs.interconnects) return "—";
  const ic = specs.interconnects;
  const flags = [];
  if (ic.nvlink?.available) flags.push("NVLink");
  if (ic.xgmi?.available) flags.push("xGMI");
  if (ic.infiniband?.available) flags.push("IB");
  if (ic.efa?.available) flags.push("EFA");
  if (flags.length === 0) return ic.rdma_capable ? "RDMA" : "—";
  return flags.join(" · ");
}

function mapJob(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    model_name: row.model_name || row.models?.name || "unassigned",
    payment_offer: mapCurrency(row.payment_offer),
    client_name: row.client_name || row.clients?.name || "unknown"
  };
}

function mapModel(row) {
  return {
    id: row.id,
    name: row.name,
    family: row.family || "custom",
    context_length: row.context_length ?? "—",
    visibility: row.visibility || "private"
  };
}

export async function runQuery(builder, emptyValue = []) {
  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message);
  }
  return data ?? emptyValue;
}

export async function getNodes({ limit, status } = {}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("nodes")
    .select("id,name,role,status,location,region,capacity,compute_capacity,created_at")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const rows = await runQuery(withLimit(query, limit));
  return rows.map(mapNode);
}

export async function getProviders({ limit, status } = {}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("providers")
    .select("id,name,status,gpu_model,price,reputation,specs,created_at")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const rows = await runQuery(withLimit(query, limit));
  return rows.map(mapProvider);
}

export async function getJobs({ limit, status } = {}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select("id,title,status,payment_offer,model_name,client_name,created_at")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const rows = await runQuery(withLimit(query, limit));
  return rows.map(mapJob);
}

export async function getModels({ limit } = {}) {
  const supabase = getSupabaseServerClient();
  const rows = await runQuery(
    withLimit(
      supabase
        .from("models")
        .select("id,name,family,context_length,visibility,created_at")
        .order("created_at", { ascending: false }),
      limit
    )
  );

  return rows.map(mapModel);
}

export async function getClients({ limit } = {}) {
  const supabase = getSupabaseServerClient();
  const rows = await runQuery(
    withLimit(
      supabase
        .from("clients")
        .select("id,name,status,budget_usd,created_at")
        .order("created_at", { ascending: false }),
      limit
    )
  );
  return rows.map((row) => ({
    ...row,
    budget_usd: mapCurrency(row.budget_usd)
  }));
}

export async function getAggregators({ limit } = {}) {
  const supabase = getSupabaseServerClient();
  return runQuery(
    withLimit(
      supabase
        .from("aggregators")
        .select("id,name,status,active_jobs,created_at")
        .order("created_at", { ascending: false }),
      limit
    )
  );
}

export async function getDashboardOverview() {
  const supabase = getSupabaseServerClient();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Provider rows include the specs jsonb so we can count distinct
  // served_models across the network — that's what the public /chat
  // playground actually needs to know is online.
  const [{ data: providersAll, error: pErr }, jobs] = await Promise.all([
    supabase.from("providers").select("status, last_seen, specs"),
    getJobs({ limit: 100 })
  ]);
  if (pErr) throw new Error(pErr.message);
  const providers = providersAll ?? [];

  const onlineProviders = providers.filter(
    (p) => p.status === "available" && p.last_seen && p.last_seen >= tenMinAgo
  );

  // Distinct models advertised across providers' specs.served_models.
  const modelSet = new Set();
  for (const p of providers) {
    const served = Array.isArray(p?.specs?.served_models) ? p.specs.served_models : [];
    for (const m of served) {
      if (typeof m === "string" && m) modelSet.add(m);
    }
  }

  const pendingJobs = jobs.filter((j) => j.status === "pending").length;

  return {
    cards: [
      {
        label: "Online nodes",
        value: onlineProviders.length,
        note: `of ${providers.length} registered`
      },
      {
        label: "Models served",
        value: modelSet.size,
        note: modelSet.size === 0
          ? "no models advertised"
          : [...modelSet].slice(0, 3).join(", ") + (modelSet.size > 3 ? "…" : "")
      },
      {
        label: "Jobs",
        value: jobs.length,
        note: `${pendingJobs} pending`
      },
      {
        label: "Last heartbeat",
        value: onlineProviders[0]?.last_seen ? relativeAgo(onlineProviders[0].last_seen) : "—",
        note: onlineProviders[0]?.last_seen ?? "no heartbeats yet"
      }
    ]
  };
}

function relativeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export const __testables__ = {
  mapCurrency,
  mapJob,
  mapModel,
  mapNode,
  mapProvider,
  withLimit
};
