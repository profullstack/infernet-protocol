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
    gpu_model: row.gpu_model || "unknown",
    price_display: mapCurrency(row.price),
    reputation: row.reputation ?? "—"
  };
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
    .select("id,name,status,gpu_model,price,reputation,created_at")
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
  const [nodes, providers, jobs, models] = await Promise.all([
    getNodes({ limit: 100 }),
    getProviders({ limit: 100 }),
    getJobs({ limit: 100 }),
    getModels({ limit: 100 })
  ]);

  return {
    cards: [
      {
        label: "Nodes",
        value: nodes.length,
        note: `${nodes.filter((node) => node.status === "available").length} available`
      },
      {
        label: "Providers",
        value: providers.length,
        note: `${providers.filter((provider) => provider.status === "available").length} ready`
      },
      {
        label: "Jobs",
        value: jobs.length,
        note: `${jobs.filter((job) => job.status === "pending").length} pending`
      },
      {
        label: "Models",
        value: models.length,
        note: `${models.filter((model) => model.visibility === "public").length} public`
      }
    ]
  };
}

export const __testables__ = {
  mapCurrency,
  mapJob,
  mapModel,
  mapNode,
  mapProvider,
  withLimit
};
