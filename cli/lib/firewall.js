/**
 * Cross-distro firewall hole-punch helpers for the Infernet P2P port.
 *
 * We don't silently edit firewall rules — the Linux tools that manage
 * them (ufw, firewalld, iptables, nftables) touch shared system state
 * and usually require root. Instead we detect what's available and
 * print exact commands the operator can run (with sudo).
 */

import { execFileSync } from 'node:child_process';

/**
 * Best-effort detection of the available firewall managers. Returns an
 * array of detected tools in order of preference: ['ufw'] | ['firewalld']
 * | ['iptables'] | ['nftables'] | []. On macOS returns ['pf']. On Windows
 * ['netsh']. On anything else we return [] and print a generic message.
 */
export function detectFirewall() {
    if (process.platform === 'darwin') return ['pf'];
    if (process.platform === 'win32')  return ['netsh'];
    if (process.platform !== 'linux')  return [];

    const found = [];
    const have = (bin) => {
        try {
            execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' });
            return true;
        } catch { return false; }
    };
    if (have('ufw'))          found.push('ufw');
    if (have('firewall-cmd')) found.push('firewalld');
    if (have('nft'))          found.push('nftables');
    if (have('iptables'))     found.push('iptables');
    return found;
}

/**
 * Return a block of text describing how to open `port` (TCP) on each
 * firewall tool detected. Never mutates state.
 *
 * @param {number} port
 * @returns {{ detected: string[], lines: string[] }}
 */
export function describeFirewallHowTo(port) {
    const detected = detectFirewall();
    const lines = [];

    if (detected.length === 0) {
        lines.push(`(No supported firewall manager detected on ${process.platform}.)`);
        lines.push(`If you have one, open TCP ${port} for inbound traffic manually.`);
        return { detected, lines };
    }

    for (const tool of detected) {
        switch (tool) {
            case 'ufw':
                lines.push('[ufw]');
                lines.push(`  sudo ufw allow ${port}/tcp`);
                lines.push(`  sudo ufw reload`);
                break;
            case 'firewalld':
                lines.push('[firewalld]');
                lines.push(`  sudo firewall-cmd --permanent --add-port=${port}/tcp`);
                lines.push(`  sudo firewall-cmd --reload`);
                break;
            case 'nftables':
                lines.push('[nftables]');
                lines.push(`  sudo nft add rule inet filter input tcp dport ${port} accept`);
                break;
            case 'iptables':
                lines.push('[iptables]');
                lines.push(`  sudo iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`);
                lines.push(`  # Persist across reboots with iptables-save or your distro's equivalent.`);
                break;
            case 'pf':
                lines.push('[macOS pf — add to /etc/pf.conf and reload]');
                lines.push(`  pass in proto tcp from any to any port ${port}`);
                lines.push(`  sudo pfctl -f /etc/pf.conf`);
                break;
            case 'netsh':
                lines.push('[Windows — elevated PowerShell or cmd]');
                lines.push(`  netsh advfirewall firewall add rule name="Infernet P2P ${port}" dir=in action=allow protocol=TCP localport=${port}`);
                break;
            default:
                lines.push(`(${tool}): manual configuration required`);
        }
    }
    return { detected, lines };
}

/**
 * Emit a firewall how-to block to stdout. `context` is a short label
 * (e.g. "init") that gets included in the header for clarity.
 */
export function printFirewallHint(port, context = '') {
    const { detected, lines } = describeFirewallHowTo(port);
    const header = context
        ? `-- firewall hint (${context}, port ${port}) --`
        : `-- firewall hint (port ${port}) --`;
    process.stdout.write(`${header}\n`);
    if (detected.length > 0) {
        process.stdout.write(`Detected: ${detected.join(', ')}\n`);
    }
    for (const line of lines) process.stdout.write(`${line}\n`);
    process.stdout.write('\n');
}
