import DashboardShell from "@/components/dashboard-shell";
import ResourceTable from "@/components/resource-table";
import { getGpuFleet } from "@/lib/data/infernet";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "GPU fleet — Infernet",
  description: "Live snapshot of every GPU model contributing to the Infernet network."
};

export default async function GpuPage() {
  const fleet = await getGpuFleet();
  const totalGpus = fleet.reduce((acc, g) => acc + g.count, 0);
  const totalProviders = fleet.reduce((acc, g) => acc + g.providers, 0);

  return (
    <DashboardShell
      eyebrow="GPU fleet"
      title="GPUs on the network"
      description={
        totalGpus > 0
          ? `${totalGpus} GPUs across ${totalProviders} provider slots in the last 10 min.`
          : "No live GPU providers in the last 10 min."
      }
    >
      <ResourceTable
        title="By model"
        description="Aggregated from each provider's last register / heartbeat. Rows are deduped by (vendor, model, VRAM tier)."
        emptyMessage="No live GPU providers right now. Run `infernet setup` and join the network."
        columns={[
          { key: "vendor", label: "Vendor" },
          { key: "model", label: "Model" },
          { key: "vram_tier", label: "VRAM tier" },
          { key: "count", label: "GPUs" },
          { key: "providers", label: "Providers" },
          { key: "freshest_seen", label: "Last seen" }
        ]}
        rows={fleet}
      />
    </DashboardShell>
  );
}
