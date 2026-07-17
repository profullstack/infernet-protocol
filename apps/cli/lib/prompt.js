/**
 * Interactive prompt helper using readline/promises.
 *
 * Exports `question(prompt, options)` where options = { default?, secret? }.
 * Secret mode writes ANSI "conceal" (\x1b[8m) before reading and resets
 * after — not a true TTY password read, but adequate to avoid shoulder-surfing.
 */

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * @param {string} prompt
 * @param {{ default?: string, secret?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function question(prompt, options = {}) {
    const { default: defaultValue, secret = false } = options;

    const suffix = defaultValue ? ` [${secret ? '****' : defaultValue}]` : '';
    const full = `${prompt}${suffix}: `;

    // Non-interactive stdin (piped `curl | sh` install, `--yes` automation,
    // CI, nohup): there's no terminal to read an answer from. Creating a
    // readline with terminal:true and awaiting rl.question() here NEVER
    // resolves at EOF — the await hangs, the event loop drains, and Node
    // exits 0 mid-function, so callers like `init` silently skip saveConfig
    // and write no config at all. Echo the prompt + chosen default and
    // return it immediately instead.
    if (!stdin.isTTY) {
        stdout.write(
            defaultValue !== undefined
                ? `${full}${secret ? '****' : defaultValue}  (default, non-interactive)\n`
                : `${full}(non-interactive)\n`
        );
        return defaultValue !== undefined ? defaultValue : '';
    }

    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
        terminal: true
    });

    try {
        let answer;
        if (secret) {
            stdout.write('\x1b[8m');
            try {
                answer = await rl.question(full);
            } finally {
                stdout.write('\x1b[0m\n');
            }
        } else {
            answer = await rl.question(full);
        }
        const trimmed = (answer ?? '').trim();
        if (trimmed.length === 0 && defaultValue !== undefined) {
            return defaultValue;
        }
        return trimmed;
    } finally {
        rl.close();
    }
}
