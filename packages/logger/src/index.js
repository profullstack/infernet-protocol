/**
 * @infernet/logger — structured logging helper for Infernet packages.
 *
 * Reads its configuration from process.env so it can be used from any
 * context (CLI, daemon, Next.js server routes) without depending on a
 * particular app's runtime config object.
 *
 * Env:
 *   LOG_LEVEL        debug | info | warn | error          (default: info)
 *   LOG_FORMAT       json | text                          (default: json)
 *   LOG_FILE         path to append logs to, or empty     (default: none)
 *   LOG_TO_CONSOLE   "false" to silence console output    (default: true)
 */

import fs from 'fs';
import path from 'path';

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

function readConfig() {
    return {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        file: process.env.LOG_FILE || '',
        console: process.env.LOG_TO_CONSOLE !== 'false'
    };
}

function ensureLogDirectory(file) {
    if (!file) return;
    const logDir = path.dirname(file);
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    } catch {
        // Best effort — fall back to console-only if the FS rejects us.
    }
}

/**
 * Create a logger instance for a specific module.
 * @param {string} module - Module name (included in every record).
 */
function createLogger(module) {
    const cfg = readConfig();
    const threshold = LOG_LEVELS[cfg.level] ?? LOG_LEVELS.info;
    ensureLogDirectory(cfg.file);

    function emit(level, message, data) {
        if ((LOG_LEVELS[level] ?? LOG_LEVELS.info) < threshold) return;

        const timestamp = new Date().toISOString();
        const entry = { timestamp, level, module, message, data };

        let line;
        if (cfg.format === 'json') {
            line = JSON.stringify(entry);
        } else {
            line = `${timestamp} [${level.toUpperCase()}] [${module}] ${message}`;
            if (data !== undefined) line += ` ${JSON.stringify(data)}`;
        }

        if (cfg.console) {
            if (level === 'error') console.error(line);
            else if (level === 'warn') console.warn(line);
            else console.log(line);
        }

        if (cfg.file) {
            try {
                fs.appendFileSync(cfg.file, line + '\n');
            } catch {
                // Swallow file errors — never let logging crash the process.
            }
        }
    }

    return {
        debug: (message, data) => emit('debug', message, data),
        info: (message, data) => emit('info', message, data),
        warn: (message, data) => emit('warn', message, data),
        error: (message, data) => emit('error', message, data)
    };
}

export { createLogger };
