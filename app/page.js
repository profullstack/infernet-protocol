import DashboardShell from "@/components/dashboard-shell";
import OverviewGrid from "@/components/overview-grid";
import ResourceTable from "@/components/resource-table";
import {
  getAggregators,
  getClients,
  getDashboardOverview,
  getJobs,
  getModels,
  getNodes,
  getProviders
} from "@/lib/data/infernet";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [overview, nodes, jobs, providers, models, clients, aggregators] = await Promise.all([
    getDashboardOverview(),
    getNodes({ limit: 6 }),
    getJobs({ limit: 6 }),
    getProviders({ limit: 6 }),
    getModels({ limit: 6 }),
    getClients({ limit: 6 }),
    getAggregators({ limit: 6 })
  ]);

  return (
    <DashboardShell
      eyebrow="Server-managed control plane"
      title="Infernet orchestration on Next.js + Supabase"
      description="All data fetching is executed on the server. The browser only talks to Next.js routes and rendered server components."
    >
      <OverviewGrid cards={overview.cards} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ResourceTable
          title="Active nodes"
          description="Nodes exposed through server-side Supabase queries."
          columns={[
            { key: "name", label: "Node" },
            { key: "role", label: "Role" },
            { key: "status", label: "Status" },
            { key: "location", label: "Location" }
          ]}
          rows={nodes}
          emptyMessage="No nodes found."
        />
        <ResourceTable
          title="Queued jobs"
          description="Jobs are read through route-backed services."
          columns={[
            { key: "title", label: "Job" },
            { key: "status", label: "Status" },
            { key: "model_name", label: "Model" },
            { key: "payment_offer", label: "Offer" }
          ]}
          rows={jobs}
          emptyMessage="No jobs found."
        />
        <ResourceTable
          title="Providers"
          description="Providers available to schedule work."
          columns={[
            { key: "name", label: "Provider" },
            { key: "status", label: "Status" },
            { key: "gpu_model", label: "GPU" },
            { key: "price_display", label: "Price" }
          ]}
          rows={providers}
          emptyMessage="No providers found."
        />
        <ResourceTable
          title="Models"
          description="Model registry from Supabase."
          columns={[
            { key: "name", label: "Model" },
            { key: "family", label: "Family" },
            { key: "context_length", label: "Context" },
            { key: "visibility", label: "Visibility" }
          ]}
          rows={models}
          emptyMessage="No models found."
        />
        <ResourceTable
          title="Clients"
          description="Consumers using the control plane APIs."
          columns={[
            { key: "name", label: "Client" },
            { key: "status", label: "Status" },
            { key: "budget_usd", label: "Budget" }
          ]}
          rows={clients}
          emptyMessage="No clients found."
        />
        <ResourceTable
          title="Aggregators"
          description="Aggregators coordinating distributed work."
          columns={[
            { key: "name", label: "Aggregator" },
            { key: "status", label: "Status" },
            { key: "active_jobs", label: "Active jobs" }
          ]}
          rows={aggregators}
          emptyMessage="No aggregators found."
        />
      </div>
    </DashboardShell>
  );
}
