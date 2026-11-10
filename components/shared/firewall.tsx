import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@primer/octicons-react';

export type Firewall = 'ufw' | 'firewalld' | 'windows' | 'none';

export const FIREWALL_LABELS: Record<Firewall, string> = {
    ufw: 'ufw',
    firewalld: 'firewalld',
    windows: 'Windows Firewall',
    none: '',
};

/**
 * Commands to open the UI port (when given) and the mock range once (MOCKOON_FIREWALL); the UI never runs them.
 * Opening a range that overlaps an existing rule is harmless, so after widening the range the user can run them again.
 */
export function firewallCommands(firewall: Firewall, uiPort: number | null, min: number, max: number): string[] {
    if (firewall === 'ufw') {
        return [...(uiPort ? [`sudo ufw allow ${uiPort}/tcp`] : []), `sudo ufw allow ${min}:${max}/tcp`];
    }
    if (firewall === 'firewalld') {
        const ports = [...(uiPort ? [`--add-port=${uiPort}/tcp`] : []), `--add-port=${min}-${max}/tcp`].join(' ');
        return [`sudo firewall-cmd --permanent ${ports}`, 'sudo firewall-cmd --reload'];
    }
    if (firewall === 'windows') {
        return [
            ...(uiPort ? [`New-NetFirewallRule -DisplayName "Mockoon UI" -Direction Inbound -Protocol TCP -LocalPort ${uiPort} -Action Allow`] : []),
            `New-NetFirewallRule -DisplayName "Mockoon mock servers ${min}-${max}" -Direction Inbound -Protocol TCP -LocalPort ${min}-${max} -Action Allow`,
        ];
    }
    return [];
}

/** Read-only list of shell commands, each with a copy button. */
export function FirewallCommands({ firewall, commands }: { firewall: Firewall; commands: string[] }) {
    const [copied, setCopied] = useState<number | null>(null);

    const copy = async (command: string, index: number) => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(index);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            // Clipboard needs HTTPS or localhost; the command can still be selected by hand
        }
    };

    return (
        <div className="bg-canvas-inset rounded-md border border-border-custom divide-y divide-border-muted">
            {commands.map((command, i) => (
                <div key={command} className="flex items-center gap-2 pl-3 pr-1 py-1">
                    <code className="flex-1 min-w-0 text-xs font-mono text-fg-default break-words">
                        <span className="text-fg-muted select-none">{firewall === 'windows' ? 'PS> ' : '$ '}</span>{command}
                    </code>
                    <button
                        type="button"
                        onClick={() => copy(command, i)}
                        className="btn btn-invisible btn-icon btn-sm shrink-0"
                        title="Copy command"
                        aria-label="Copy command"
                    >
                        {copied === i ? <CheckIcon className="text-success" /> : <CopyIcon />}
                    </button>
                </div>
            ))}
        </div>
    );
}
