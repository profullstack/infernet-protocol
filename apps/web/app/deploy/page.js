import DeployView from "./deploy-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Deploy a GPU — Infernet Protocol",
  description:
    "Launch an Infernet provider node on a rented cloud GPU in one click. No SSH, no package managers — your pod boots, registers, and starts earning."
};

export default function DeployPage() {
  return (
    <>
      <DeployView />
    </>
  );
}
