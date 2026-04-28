import DashboardShell from "@/components/dashboard-shell";
import OverviewGrid from "@/components/overview-grid";
import ResourceTable from "@/components/resource-table";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import AutoRefresh from "@/components/auto-refresh";
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
    <>
    <SiteHeader />
    <DashboardShell
      eyebrow="Network status"
      title="Infernet network status"
      description="Live snapshot of nodes, jobs, providers, models, clients, and aggregators on the network."
    >
      <div className="flex justify-end"><AutoRefresh intervalMs={10000} /></div>
      <OverviewGrid cards={overview.cards} />
      <div className="grid gap-6 xl:grid-cols-2">
        <ResourceTable
          title="Queued jobs"
          description="Jobs in the queue right now."
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
            { key: "gpu_summary", label: "GPU" },
            { key: "cpu_summary", label: "CPU" },
            { key: "fabric", label: "Fabric" },
            { key: "price_display", label: "Price" }
          ]}
          rows={providers}
          emptyMessage="No providers found."
        />
        <ResourceTable
          title="Models"
          description="Available models."
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
          description="Clients using the control plane."
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
    <SiteFooter />
    </>
  );
}
