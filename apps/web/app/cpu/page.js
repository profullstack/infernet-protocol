import DashboardShell from "@/components/dashboard-shell";
import ResourceTable from "@/components/resource-table";
import { getCpuFleet } from "@/lib/data/infernet";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CPU fleet — Infernet",
  description: "Live snapshot of every CPU class contributing to the Infernet network."
};

export default async function CpuPage() {
  const fleet = await getCpuFleet();
  const totalProviders = fleet.reduce((acc, c) => acc + c.providers, 0);
  const totalCores = fleet.reduce((acc, c) => acc + c.total_cores, 0);
  const totalRam = fleet.reduce((acc, c) => acc + c.total_ram_gb, 0);

  return (
    <DashboardShell
      eyebrow="CPU fleet"
      title="CPUs on the network"
      description={
        totalProviders > 0
          ? `${totalProviders} live providers — ${totalCores} cores / ${totalRam} GB RAM in the last 10 min.`
          : "No live providers in the last 10 min."
      }
    >
      <ResourceTable
        title="By class"
        description="Grouped by (vendor, arch, RAM tier). Cores and RAM are summed across providers in the same class."
        emptyMessage="No CPU telemetry yet. Operators on recent CLI versions advertise a CPU summary at register time."
        columns={[
          { key: "vendor", label: "Vendor" },
          { key: "arch", label: "Arch" },
          { key: "ram_tier", label: "RAM tier" },
          { key: "providers", label: "Providers" },
          { key: "total_cores", label: "Total cores" },
          { key: "total_ram_gb", label: "Total RAM (GB)" },
          { key: "freshest_seen", label: "Last seen" }
        ]}
        rows={fleet}
      />
    </DashboardShell>
  );
}
