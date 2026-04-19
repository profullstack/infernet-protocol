/**
 * Daemonize helper — re-spawns the current CLI as a detached background
 * process running `infernet start --foreground`, with stdout/stderr piped
 * to the daemon log file.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getConfigDir, getDaemonLogPath } from './config.js';

/**
 * @param {string[]} passthroughArgs  Extra args to hand to the foreground start
 *                                     (e.g. --heartbeat-interval, --poll-interval).
 * @returns {{ pid: number, logPath: string }}
 */
export function spawnDetachedDaemon(passthroughArgs = []) {
    fs.mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });

    const logPath = getDaemonLogPath();
    const out = fs.openSync(logPath, 'a');
    const err = fs.openSync(logPath, 'a');

    // process.argv[1] is the CLI entry script (absolute path when invoked
    // via `node path/to/cli/index.js` or via the bin symlink).
    const scriptPath = process.argv[1];
    if (!scriptPath || !path.isAbsolute(scriptPath)) {
        // Fall back to resolving via import.meta-ish heuristics. This should
        // almost never trigger in practice.
        throw new Error('Unable to determine absolute path to the CLI script for daemonization.');
    }

    const child = spawn(
        process.execPath,
        [scriptPath, 'start', '--foreground', ...passthroughArgs],
        {
            detached: true,
            stdio: ['ignore', out, err],
            env: { ...process.env, INFERNET_DAEMON_FOREGROUND: '1' }
        }
    );

    child.unref();
    return { pid: child.pid, logPath };
}
