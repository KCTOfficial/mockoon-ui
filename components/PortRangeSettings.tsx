import { useEffect, useState } from 'react';
import { FIREWALL_LABELS, Firewall, FirewallCommands, firewallCommands } from './shared/firewall';

interface PortRangeInfo {
    min: number;
    max: number;
    locked: boolean;
    uiPort: number;
    firewall: Firewall;
}

/** Fired after the range is saved, so open port pickers reload the allowed ports. */
export const PORT_RANGE_CHANGED_EVENT = 'mockoon:port-range-changed';

interface PortRangeSettingsProps {
    notify: (message: string, type?: 'success' | 'error') => void;
}

/** Widens or narrows the mock server port range chosen in the first-run setup, without running the setup again. */
export default function PortRangeSettings({ notify }: PortRangeSettingsProps) {
    const [info, setInfo] = useState<PortRangeInfo | null>(null);
    const [min, setMin] = useState(0);
    const [max, setMax] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetch('/api/account/port-range')
            .then(res => (res.ok ? res.json() : Promise.reject()))
            .then((data: PortRangeInfo) => {
                setInfo(data);
                setMin(data.min);
                setMax(data.max);
            })
            .catch(() => setError('Failed to load the port range.'));
    }, []);

    const changed = !!info && (min !== info.min || max !== info.max);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSaving(true);
        try {
            const res = await fetch('/api/account/port-range', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ min, max }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to save the port range.');
            setInfo(prev => (prev ? { ...prev, min: data.min, max: data.max } : prev));
            window.dispatchEvent(new Event(PORT_RANGE_CHANGED_EVENT));
            notify(`Mock server port range is now ${data.min}-${data.max}.`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save the port range.');
        } finally {
            setIsSaving(false);
        }
    };

    const disabled = !info || info.locked || isSaving;

    return (
        <form onSubmit={handleSave} className="Box p-3 space-y-3">
            <div>
                <h3 className="text-sm font-semibold text-fg-default">Mock server port range</h3>
                <p className="text-xs text-fg-muted mt-1">
                    Ports environments can use. Running mock servers keep their port.
                </p>
            </div>

            {error && <div role="alert" className="flash flash-error text-[13px]">{error}</div>}

            <div className="flex items-center gap-2">
                <input
                    aria-label="Mock server port range from"
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={min || ''}
                    onChange={(e) => setMin(parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="form-control w-full font-mono"
                />
                <span className="text-fg-muted">–</span>
                <input
                    aria-label="Mock server port range to"
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={max || ''}
                    onChange={(e) => setMax(parseInt(e.target.value) || 0)}
                    disabled={disabled}
                    className="form-control w-full font-mono"
                />
            </div>
            {info?.locked && (
                <p className="form-caption">Set by MOCKOON_PORT_RANGE on the server. Change it there and restart.</p>
            )}

            {info && !info.locked && info.firewall !== 'none' && changed && min > 0 && max >= min && (
                <div>
                    <span className="form-label font-normal">Firewall ({FIREWALL_LABELS[info.firewall]})</span>
                    <FirewallCommands firewall={info.firewall} commands={firewallCommands(info.firewall, null, min, max)} />
                    <p className="form-caption">
                        Open the new range once {info.firewall === 'windows' ? 'in PowerShell as Administrator' : 'on the server'};
                        Mockoon UI never changes the firewall.
                    </p>
                </div>
            )}

            <div className="flex justify-end">
                <button type="submit" disabled={disabled || !changed} className="btn btn-sm btn-primary">
                    {isSaving ? 'Saving…' : 'Save range'}
                </button>
            </div>
        </form>
    );
}
