import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = dirname(fileURLToPath(import.meta.url));
export const CURRENT_VERSION = JSON.parse(
    readFileSync(join(_dir, '../package.json'), 'utf8')
).version;

export async function fetchLatestVersion() {
    try {
        const res = await fetch(
            'https://api.github.com/repos/profullstack/infernet-protocol/releases/latest',
            { headers: { accept: 'application/vnd.github+json', 'user-agent': 'infernet-daemon' }, signal: AbortSignal.timeout(10_000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const tag = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : null;
        return tag;
    } catch {
        return null;
    }
}

export function isNewerVersion(current, candidate) {
    const parse = (v) => String(v).split('.').map(Number);
    const [cMaj, cMin, cPatch] = parse(current);
    const [nMaj, nMin, nPatch] = parse(candidate);
    if (nMaj !== cMaj) return nMaj > cMaj;
    if (nMin !== cMin) return nMin > cMin;
    return nPatch > cPatch;
}
