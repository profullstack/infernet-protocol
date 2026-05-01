/**
 * Shared vLLM bootstrap helper — used by every DeployProvider that
 * supports cloud-init / SSH bootstrap (TensorDock, Lambda, Vast,
 * DigitalOcean). RunPod uses a vLLM-ready Docker image instead, so
 * it only consumes the health-check helpers from here.
 *
 * Spec: IPIP-0019 §9.
 */

const DEFAULT_PORT = 8000;
const DEFAULT_INSTALLER =
    process.env.INFERNET_INSTALLER_URL
    ?? "https://infernetprotocol.com/install.sh";

/**
 * Compose the `vllm serve …` command line from a config object.
 * Returns a single-line string suitable for an ExecStart= entry.
 */
export function composeServeCommand(config = {}) {
    const {
        model, port = DEFAULT_PORT,
        servedModelName, maxModelLen, tensorParallelSize,
        gpuMemoryUtilization, quantization, dtype
    } = config;

    if (!model) throw new Error("vllm: model is required");

    const args = [
        `vllm serve ${shellQuote(model)}`,
        `--host 0.0.0.0`,
        `--port ${port}`
    ];
    if (servedModelName) args.push(`--served-model-name ${shellQuote(servedModelName)}`);
    if (maxModelLen)     args.push(`--max-model-len ${Number(maxModelLen)}`);
    if (tensorParallelSize) args.push(`--tensor-parallel-size ${Number(tensorParallelSize)}`);
    if (gpuMemoryUtilization) args.push(`--gpu-memory-utilization ${Number(gpuMemoryUtilization)}`);
    if (quantization && quantization !== "none") args.push(`--quantization ${shellQuote(quantization)}`);
    if (dtype && dtype !== "auto") args.push(`--dtype ${shellQuote(dtype)}`);

    return args.join(" ");
}

/**
 * Compose the cloud-init shell script that installs vLLM and runs it
 * as a systemd service, then runs the Infernet daemon pointing at the
 * local vLLM endpoint.
 *
 * @param {object} opts
 * @param {object} opts.infernetEnv  env vars exported before the installer
 * @param {object} opts.vllmConfig   passed to composeServeCommand
 * @returns {string} bash script
 */
export function composeInstallScript({ infernetEnv = {}, vllmConfig = {} }) {
    const port = vllmConfig.port ?? DEFAULT_PORT;
    const serveCmd = composeServeCommand(vllmConfig);
    const exports = Object.entries({
        ...infernetEnv,
        INFERNET_ENGINE_URL: `http://127.0.0.1:${port}/v1`,
        INFERNET_ENGINE: "vllm"
    })
        .map(([k, v]) => `export ${k}=${shellQuote(String(v))}`)
        .join("\n");

    return [
        "#!/bin/bash",
        "set -eux",
        "",
        "# --- export config ---",
        exports,
        "",
        "# --- install vLLM in /opt/vllm (isolated venv) ---",
        "apt-get update -y || true",
        "DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip python3-venv curl ca-certificates",
        "python3 -m venv /opt/vllm",
        "/opt/vllm/bin/pip install --upgrade pip",
        "/opt/vllm/bin/pip install vllm",
        "",
        "# --- write systemd unit so vLLM restarts on reboot ---",
        "cat > /etc/systemd/system/vllm.service <<'UNIT'",
        "[Unit]",
        "Description=vLLM OpenAI-compatible inference server",
        "After=network-online.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        `ExecStart=/opt/vllm/bin/${serveCmd}`,
        "Restart=on-failure",
        "RestartSec=10",
        "",
        "[Install]",
        "WantedBy=multi-user.target",
        "UNIT",
        "",
        "systemctl daemon-reload",
        "systemctl enable --now vllm.service",
        "",
        "# --- install + start the Infernet daemon (talks to local vLLM) ---",
        `curl -fsSL ${DEFAULT_INSTALLER} | bash`,
        "infernet register || true",
        "infernet start || true"
    ].join("\n");
}

/**
 * Build the `/v1/models` health-check URL for a node.
 */
export function vllmHealthCheckUrl(host, port = DEFAULT_PORT) {
    if (!host) throw new Error("vllm: host required");
    const cleanHost = host.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
    return `http://${cleanHost}:${port}/v1/models`;
}

/**
 * Poll the vLLM health endpoint until 200 or timeout.
 * Returns { ok, lastErr, healthEndpoint }.
 */
export async function pollVllmHealth(host, {
    port = DEFAULT_PORT,
    timeoutMs = 5 * 60 * 1000,
    intervalMs = 10 * 1000
} = {}) {
    const healthEndpoint = vllmHealthCheckUrl(host, port);
    const deadline = Date.now() + timeoutMs;
    let lastErr = null;
    while (Date.now() < deadline) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(healthEndpoint, { signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) return { ok: true, healthEndpoint };
            lastErr = `HTTP ${res.status}`;
        } catch (err) {
            lastErr = err?.message ?? String(err);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { ok: false, lastErr, healthEndpoint };
}

/** Single-quote a string for safe inclusion in a bash script. */
function shellQuote(s) {
    return `'${String(s).replace(/'/g, "'\\''")}'`;
}
