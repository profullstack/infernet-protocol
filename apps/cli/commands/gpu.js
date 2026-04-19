/**
 * `infernet gpu` — inspect local GPUs.
 *
 * Subcommands:
 *   list   Print detected GPUs (default if no subcommand).
 *   json   Print raw JSON array (useful for debugging / scripting).
 */

import { detectGpus, formatGpuLine } from '@infernet/gpu';

const HELP = `infernet gpu — inspect local GPUs

Usage:
  infernet gpu [list|json] [flags]

Subcommands:
  list    Print detected GPUs (default)
  json    Print raw JSON array

Flags:
  --help  Show this help
`;

export default async function gpu(args) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    const sub = args.positional[0] ?? 'list';
    const gpus = await detectGpus();

    if (sub === 'json') {
        process.stdout.write(JSON.stringify(gpus, null, 2) + '\n');
        return 0;
    }

    if (gpus.length === 0) {
        process.stdout.write('No GPUs detected (nvidia-smi / rocm-smi / system_profiler produced no results).\n');
        process.stdout.write('This node will be registered as CPU-only.\n');
        return 0;
    }

    process.stdout.write(`Detected ${gpus.length} GPU(s):\n`);
    for (const g of gpus) {
        process.stdout.write(`  ${formatGpuLine(g)}\n`);
    }
    return 0;
}

export { HELP };
