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

    const rl = readline.createInterface({
        input: stdin,
        output: stdout,
        terminal: true
    });

    const suffix = defaultValue ? ` [${secret ? '****' : defaultValue}]` : '';
    const full = `${prompt}${suffix}: `;

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
