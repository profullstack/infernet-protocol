import DeployView from "./deploy-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deploy a GPU — Infernet Protocol",
  description:
    "Launch an Infernet provider node on a rented cloud GPU in one click. No SSH, no package managers — your pod boots, registers, and starts earning."
};

export default function DeployPage() {
  // Configure your RunPod template once via env var on the control
  // plane. When set, the page renders a "Deploy on RunPod" button
  // that pre-fills the bearer + model in RunPod's deploy form.
  const runpodTemplateId = process.env.RUNPOD_TEMPLATE_ID ?? null;
  return <DeployView runpodTemplateId={runpodTemplateId} />;
}
