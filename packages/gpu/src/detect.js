/**
 * GPU detection for Infernet Protocol.
 *
 * Returns a normalized array of GPU descriptors collected from whichever
 * vendor tooling is present on the host. Runs are best-effort: any vendor
 * whose detection tool is missing or fails is silently skipped.
 *
 * Normalized shape:
 *   {
 *     vendor:     'nvidia' | 'amd' | 'apple' | 'intel',
 *     index:      number,
 *     model:      string,
 *     vram_mb:    number | null,
 *     vram_used_mb: number | null,
 *     utilization: number | null,   // 0..100
 *     temperature_c: number | null,
 *     power_w:    number | null,
 *     driver:     string | null,
 *     cuda:       string | null,    // for NVIDIA only
 *     uuid:       string | null
 *   }
 *
 * The CLI / daemon calls `detectGpus()` and stores the result in the
 * `providers.specs.gpus` jsonb column, plus surfaces live utilization in
 * the daemon IPC `stats` snapshot.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

const EXEC_TIMEOUT_MS = 4000;

async function tryExec(bin, args) {
    try {
        const { stdout } = await pExecFile(bin, args, { timeout: EXEC_TIMEOUT_MS });
        return stdout;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// NVIDIA — nvidia-smi
// ---------------------------------------------------------------------------
async function detectNvidia() {
    // CSV for easy parsing; noheader + nounits keeps the output clean.
    const query = [
        'index', 'name', 'memory.total', 'memory.used', 'utilization.gpu',
        'temperature.gpu', 'power.draw', 'driver_version', 'uuid'
    ].join(',');
    const out = await tryExec('nvidia-smi', [
        `--query-gpu=${query}`,
        '--format=csv,noheader,nounits'
    ]);
    if (!out) return [];

    // CUDA version comes from a separate call — `nvidia-smi -q -x` returns
    // XML, but a cheaper path is to parse the plain output once. We can
    // skip it if nvidia-smi is not installed.
    const cudaOut = await tryExec('nvidia-smi', ['--query', '--display=COMPUTE']);
    let cuda = null;
    if (cudaOut) {
        const m = cudaOut.match(/CUDA Version\s*:\s*([\d.]+)/i);
        if (m) cuda = m[1];
    }

    const gpus = [];
    for (const raw of out.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split(',').map((s) => s.trim());
        if (parts.length < 9) continue;
        const [
            index, name, memTotal, memUsed, util,
            temp, power, driver, uuid
        ] = parts;
        gpus.push({
            vendor: 'nvidia',
            index: Number.parseInt(index, 10),
            model: name,
            vram_mb: toNum(memTotal),
            vram_used_mb: toNum(memUsed),
            utilization: toNum(util),
            temperature_c: toNum(temp),
            power_w: toNum(power),
            driver: driver || null,
            cuda,
            uuid: uuid || null
        });
    }
    return gpus;
}

// ---------------------------------------------------------------------------
// AMD — rocm-smi
// ---------------------------------------------------------------------------
async function detectAmd() {
    // rocm-smi supports --json but the shape varies across versions.
    const out = await tryExec('rocm-smi', ['--showproductname', '--showmeminfo', 'vram',
        '--showuse', '--showtemp', '--showpower', '--showdriverversion', '--json']);
    if (!out) return [];
    let parsed;
    try { parsed = JSON.parse(out); }
    catch { return []; }

    const gpus = [];
    let i = 0;
    for (const key of Object.keys(parsed)) {
        if (!key.startsWith('card')) continue;
        const card = parsed[key] ?? {};
        const vramTotal = parseRocmBytes(card['VRAM Total Memory (B)']);
        const vramUsed  = parseRocmBytes(card['VRAM Total Used Memory (B)']);
        gpus.push({
            vendor: 'amd',
            index: i,
            model: card['Card series'] || card['Card model'] || 'AMD GPU',
            vram_mb: vramTotal != null ? Math.round(vramTotal / (1024 * 1024)) : null,
            vram_used_mb: vramUsed != null ? Math.round(vramUsed / (1024 * 1024)) : null,
            utilization: toNum(card['GPU use (%)']),
            temperature_c: toNum(card['Temperature (Sensor edge) (C)']),
            power_w: toNum(card['Average Graphics Package Power (W)']),
            driver: card['Driver version'] ?? null,
            cuda: null,
            uuid: card['Unique ID'] ?? null
        });
        i += 1;
    }
    return gpus;
}

function parseRocmBytes(v) {
    if (v == null) return null;
    const n = Number.parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Apple Silicon / macOS — system_profiler
// ---------------------------------------------------------------------------
async function detectApple() {
    if (process.platform !== 'darwin') return [];
    const out = await tryExec('system_profiler', ['SPDisplaysDataType', '-json']);
    if (!out) return [];
    let parsed;
    try { parsed = JSON.parse(out); }
    catch { return []; }
    const items = parsed.SPDisplaysDataType ?? [];
    const gpus = [];
    items.forEach((item, i) => {
        // Apple Silicon has unified memory — report total system RAM as a
        // proxy when the card-level VRAM isn't reported.
        const vramStr = item.spdisplays_vram ?? item._spdisplays_vram ?? null;
        gpus.push({
            vendor: 'apple',
            index: i,
            model: item.sppci_model ?? item._name ?? 'Apple GPU',
            vram_mb: parseMacVram(vramStr),
            vram_used_mb: null,
            utilization: null,
            temperature_c: null,
            power_w: null,
            driver: null,
            cuda: null,
            uuid: null
        });
    });
    return gpus;
}

function parseMacVram(s) {
    if (!s) return null;
    const m = String(s).match(/([\d.]+)\s*(GB|MB)/i);
    if (!m) return null;
    const n = Number.parseFloat(m[1]);
    if (!Number.isFinite(n)) return null;
    return m[2].toUpperCase() === 'GB' ? Math.round(n * 1024) : Math.round(n);
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------
/**
 * Collect GPU descriptors from all detected vendors. Always returns an
 * array (empty if no GPU tooling is installed).
 */
export async function detectGpus() {
    const [nvidia, amd, apple] = await Promise.all([
        detectNvidia(), detectAmd(), detectApple()
    ]);
    return [...nvidia, ...amd, ...apple];
}

/**
 * Summarize detected GPUs into one line per card.
 */
export function formatGpuLine(gpu) {
    const vram = gpu.vram_mb ? `${(gpu.vram_mb / 1024).toFixed(1)} GB VRAM` : 'VRAM unknown';
    const extras = [];
    if (gpu.utilization != null) extras.push(`${gpu.utilization}% util`);
    if (gpu.temperature_c != null) extras.push(`${gpu.temperature_c}°C`);
    if (gpu.power_w != null) extras.push(`${gpu.power_w}W`);
    const suffix = extras.length ? ` (${extras.join(', ')})` : '';
    const cuda = gpu.cuda ? ` cuda=${gpu.cuda}` : '';
    return `[${gpu.vendor}:${gpu.index}] ${gpu.model} — ${vram}${cuda}${suffix}`;
}

function toNum(v) {
    if (v == null) return null;
    const n = Number.parseFloat(String(v).trim().replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
}
