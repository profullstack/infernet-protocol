/**
 * `infernet update` — push current capability/status to the control plane.
 *
 * This is the lightweight verb: re-detect specs (CPU, GPUs, interconnects,
 * served models) and re-upload them. The CLI binary itself is not touched.
 *
 * For a binary upgrade (re-run the curl installer end-to-end), see
 * `infernet upgrade`.
 */

import register from './register.js';
import upgrade from './upgrade.js';

const HELP = `infernet update — push current capability/status to the control plane

Usage:
  infernet update [flags]

Flags:
  --binary             Re-run the curl installer instead (alias for \`infernet upgrade\`).
  --address <host>     Public address to advertise (passed to register).
  --port <n>           Public port to advertise (passed to register).
  --gpu-model <name>   GPU model override (providers only).
  --price <n>          Price offer (providers only).
  --no-advertise       Don't send address / port.
  --help               Show this help.

What it does:
  Re-runs \`infernet register\` so the CLI re-uploads its freshly-detected
  specs (CPU, GPUs, interconnects, served models). The binary itself is
  not touched.

  To pull the latest CLI from infernetprotocol.com/install.sh, run:
    infernet upgrade
`;

export default async function update(args, ctx) {
    if (args.has('help') || args.has('h')) {
        process.stdout.write(HELP);
        return 0;
    }

    // Back-compat: older docs / muscle memory used `infernet update` as
    // the binary upgrade verb. Keep it routable via --binary.
    if (args.has('binary')) {
        return upgrade(args, ctx);
    }

    return register(args, ctx);
}

export { HELP };
