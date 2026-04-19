/**
 * `infernet update`
 *
 * Re-scans local GPU capability and re-sends it through the signed
 * register endpoint (which is an upsert). Useful after changing price,
 * moving the node to a new IP, or swapping GPUs.
 */

import register from './register.js';

const HELP = `infernet update — push current node state to the control plane

Usage:
  infernet update [flags]

Flags:
  --address <host>    Public address to advertise
  --port <n>          Public port to advertise
  --gpu-model <name>  GPU model (providers only)
  --price <n>         Price offer (providers only)
  --no-advertise      Don't send address / port
  --help              Show this help
`;

export default async function update(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }
    // `register` is an upsert on the server; reuse it to keep one payload
    // shape and one sanitization path.
    return register(args, ctx);
}

export { HELP };
