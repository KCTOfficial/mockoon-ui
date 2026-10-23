import { useEffect, useState } from 'react';

interface PortInfo {
    min: number;
    max: number;
    uiPort: number;
    used: { port: number; name: string; filename?: string }[];
}

interface PortSelectProps {
    id: string;
    value: number;
    onChange: (port: number) => void;
    /** Called when the choice is final: on select, or on blur for the plain number input */
    onCommit?: (port: number) => void;
    /** Environment being edited, so its own port is not shown as taken */
    currentFilename?: string;
    disabled?: boolean;
}

// Above this the range is effectively "any port" (no range configured): a list would be useless
const MAX_OPTIONS = 1000;

/** Picks a mock server port from the allowed range; taken ports are listed but cannot be chosen. */
export default function PortSelect({ id, value, onChange, onCommit, currentFilename, disabled }: PortSelectProps) {
    const [info, setInfo] = useState<PortInfo | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/environments/ports')
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (!cancelled && data) setInfo(data); })
            .catch(() => { /* fall back to the number input; the server still validates */ });
        return () => { cancelled = true; };
    }, [currentFilename]);

    if (!info || info.max - info.min + 1 > MAX_OPTIONS) {
        return (
            <input
                id={id}
                type="number"
                min={info?.min ?? 1}
                max={info?.max ?? 65535}
                value={value}
                onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                onBlur={() => onCommit?.(value)}
                disabled={disabled}
                className="form-control w-full font-mono"
            />
        );
    }

    const takenBy = (port: number) =>
        info.used.find(u => u.port === port && u.filename !== currentFilename)?.name
        ?? (port === info.uiPort ? 'Mockoon UI' : null);

    const ports = Array.from({ length: info.max - info.min + 1 }, (_, i) => info.min + i);
    const outOfRange = value < info.min || value > info.max;

    return (
        <select
            id={id}
            value={value}
            onChange={(e) => {
                const port = Number(e.target.value);
                onChange(port);
                onCommit?.(port);
            }}
            disabled={disabled}
            className="form-control w-full font-mono"
        >
            {outOfRange && (
                <option value={value} disabled>{value} (outside {info.min}-{info.max}, pick another)</option>
            )}
            {ports.map(port => {
                const owner = takenBy(port);
                return (
                    <option key={port} value={port} disabled={!!owner}>
                        {owner ? `${port} (used by ${owner})` : port}
                    </option>
                );
            })}
        </select>
    );
}
