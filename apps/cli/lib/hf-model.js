/**
 * HuggingFace model management — download, inspect, and wire up models
 * from HuggingFace to vLLM/SGLang backends.
 *
 * `infernet model pull hf:org/repo` calls downloadHfModel().
 * The HF token is read from config.huggingface.token or HUGGINGFACE_TOKEN.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';

const HF_API = 'https://huggingface.co/api';

/** Read HF token from env → config → null */
export async function resolveHfToken() {
    if (process.env.HUGGINGFACE_TOKEN) return process.env.HUGGINGFACE_TOKEN;
    const cfg = await loadConfig().catch(() => null);
    return cfg?.huggingface?.token ?? null;
}

/** Fetch model metadata from the HF hub. */
export async function fetchHfModelInfo(repoId, token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${HF_API}/models/${repoId}`, { headers });
    if (!res.ok) {
        const msg = await res.text().catch(() => res.status);
        throw new Error(`HuggingFace API ${res.status}: ${String(msg).slice(0, 200)}`);
    }
    const data = await res.json();

    const siblings = data.siblings ?? [];
    const shards = siblings.filter(s => s.rfilename?.endsWith('.safetensors') && s.rfilename.startsWith('model-'));
    const totalBytes = siblings.reduce((a, s) => a + (s.size ?? 0), 0);
    const sizeGb = totalBytes > 0 ? +(totalBytes / 1024 ** 3).toFixed(1) : null;

    // Fetch config.json for architecture details
    let modelConfig = {};
    try {
        const cfgRes = await fetch(
            `https://huggingface.co/${repoId}/raw/main/config.json`,
            { headers }
        );
        if (cfgRes.ok) modelConfig = await cfgRes.json();
    } catch { /* best-effort */ }

    const modelType = modelConfig.model_type ?? data.config?.model_type ?? null;
    const torchDtype = modelConfig.torch_dtype ?? null;
    const numExperts = modelConfig.num_experts ?? null;

    // Infer a recommended backend
    const ollamaUnsupported = [
        'glm_moe_dsa', 'moe', 'mixtral', 'deepseek_v3', 'phi3',
        'jamba', 'dbrx', 'xverse', 'internlm2'
    ];
    const needsVllmOrSglang = modelType
        ? ollamaUnsupported.some(t => modelType.toLowerCase().includes(t))
        : shards.length > 50; // large shard count → probably too big for Ollama

    // The HF API often leaves `size` null on siblings — fall back to
    // model.safetensors.index.json which carries the authoritative
    // total_size for sharded models.
    let trueTotalGb = sizeGb;
    try {
        const idxRes = await fetch(
            `https://huggingface.co/${repoId}/resolve/main/model.safetensors.index.json`,
            { headers, redirect: 'follow' }
        );
        if (idxRes.ok) {
            const idx = await idxRes.json();
            const sz = idx?.metadata?.total_size;
            if (Number.isFinite(sz) && sz > 0) {
                trueTotalGb = +(sz / 1024 ** 3).toFixed(1);
            }
        }
    } catch { /* best-effort */ }

    // Architecture pulls for VRAM math + the info command output.
    const numLayers   = modelConfig.num_hidden_layers ?? null;
    const hiddenSize  = modelConfig.hidden_size ?? null;
    const numHeads    = modelConfig.num_attention_heads ?? null;
    const numKvHeads  = modelConfig.num_key_value_heads ?? numHeads ?? null;
    const expertsPerTok = modelConfig.num_experts_per_tok ?? null;
    const contextLen  = modelConfig.max_position_embeddings ?? null;
    const vocabSize   = modelConfig.vocab_size ?? null;
    const architectures = modelConfig.architectures ?? null;
    const isQuantized = !!modelConfig.quantization_config;
    const quantMethod = modelConfig.quantization_config?.quant_method ?? null;

    // Estimate VRAM at common precisions. Param count derived from disk
    // size + dtype byte-width when explicit param count isn't published.
    const dtypeBytes = (torchDtype === 'float32' || torchDtype === 'fp32') ? 4 : 2;
    const paramsB = trueTotalGb ? +(trueTotalGb * 1024 ** 3 / dtypeBytes / 1e9).toFixed(1) : null;
    const vramEstimateGb = paramsB ? {
        fp16: +(paramsB * 2 * 1.15).toFixed(1),    // weights + ~15% overhead
        int8: +(paramsB * 1 * 1.15).toFixed(1),
        int4: +(paramsB * 0.5 * 1.15).toFixed(1)
    } : null;

    return {
        repoId,
        modelType,
        architectures,
        torchDtype,
        shardCount: shards.length,
        sizeGb: trueTotalGb,
        paramsB,
        vramEstimateGb,
        numLayers,
        hiddenSize,
        numHeads,
        numKvHeads,
        contextLen,
        vocabSize,
        numExperts,
        expertsPerTok,
        isMoe: numExperts !== null || /moe|mixtral|bailing/i.test(modelType ?? ''),
        isQuantized,
        quantMethod,
        recommendedBackend: needsVllmOrSglang ? 'vllm_or_sglang' : 'ollama_or_vllm',
        pipeline: data.pipeline_tag ?? 'text-generation',
        license: data.cardData?.license ?? data.tags?.find(t => t.startsWith('license:'))?.replace('license:', '') ?? null,
        downloads: data.downloads ?? null,
    };
}

/** The `hf` CLI the installer puts in the vLLM venv. One place, no fallbacks. */
function hfCli() {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const base = process.env.INFERNET_HOME || `${home}/.infernet`;
    return `${base}/vllm-venv/bin/hf`;
}

/**
 * Download a HuggingFace model via `hf download`. Streams progress and returns
 * the local cache path; surfaces the CLI's stderr on failure.
 */
export async function downloadHfModel(repoId, token, { localDir = null } = {}) {
    const cli = hfCli();
    if (!existsSync(cli)) {
        throw new Error(
            `HuggingFace CLI not found at ${cli}. Re-run the installer on this NVIDIA ` +
            `host — it installs vLLM + huggingface_hub.`
        );
    }

    const args = ['download', repoId];
    if (token) args.push('--token', token);
    if (localDir) args.push('--local-dir', localDir);

    process.stdout.write(`\nDownloading ${repoId} from HuggingFace…\n`);

    return new Promise((resolve, reject) => {
        const child = spawn(cli, args, { stdio: ['ignore', 'inherit', 'pipe'] });
        let errTail = '';
        child.stderr.on('data', (d) => {
            const s = d.toString();
            process.stderr.write(s);
            errTail = (errTail + s).slice(-1200);
        });
        child.on('exit', code => {
            if (code === 0) resolve(localDir ?? defaultCachePath(repoId));
            else reject(new Error(`hf download exited ${code}${errTail.trim() ? `:\n${errTail.trim()}` : ''}`));
        });
        child.on('error', reject);
    });
}

/** Default HuggingFace cache path for a repo. */
function defaultCachePath(repoId) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
    const slug = repoId.replace('/', '--');
    return `${home}/.cache/huggingface/hub/models--${slug}/snapshots/main`;
}

/**
 * Detect which backends are currently running.
 * Returns { vllm: bool, sglang: bool }
 */
export async function detectRunningBackends() {
    const check = async (url) => {
        try {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), 800);
            const r = await fetch(url, { signal: ctrl.signal });
            return r.ok;
        } catch { return false; }
    };
    const [vllm, sglang] = await Promise.all([
        check('http://localhost:8000/v1/models'),
        check('http://localhost:30000/v1/models'),
    ]);
    return { vllm, sglang };
}
