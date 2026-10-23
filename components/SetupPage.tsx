import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon, EyeClosedIcon, EyeIcon } from '@primer/octicons-react';
import logo from '@/images/logo.png';

interface SetupInfo {
    needsCredentials: boolean;
    uiPort: { value: number; locked: boolean };
    mockPortRange: { min: number; max: number; locked: boolean };
    firewall: 'ufw' | 'firewalld' | 'windows' | 'none';
}

const FIREWALL_LABELS: Record<SetupInfo['firewall'], string> = {
    ufw: 'ufw',
    firewalld: 'firewalld',
    windows: 'Windows Firewall',
    none: '',
};

/** Commands to open the UI port and the mock range once (MOCKOON_FIREWALL); the UI never runs them. */
function firewallCommands(firewall: SetupInfo['firewall'], uiPort: number, min: number, max: number): string[] {
    if (firewall === 'ufw') {
        return [`sudo ufw allow ${uiPort}/tcp`, `sudo ufw allow ${min}:${max}/tcp`];
    }
    if (firewall === 'firewalld') {
        return [
            `sudo firewall-cmd --permanent --add-port=${uiPort}/tcp --add-port=${min}-${max}/tcp`,
            'sudo firewall-cmd --reload',
        ];
    }
    if (firewall === 'windows') {
        return [
            `New-NetFirewallRule -DisplayName "Mockoon UI" -Direction Inbound -Protocol TCP -LocalPort ${uiPort} -Action Allow`,
            `New-NetFirewallRule -DisplayName "Mockoon mock servers" -Direction Inbound -Protocol TCP -LocalPort ${min}-${max} -Action Allow`,
        ];
    }
    return [];
}

interface SetupPageProps {
    onDone: () => void;
}

interface PasswordInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    invalid?: boolean;
    describedBy?: string;
}

/** New-password field with a show/hide toggle. */
function PasswordInput({ id, value, onChange, disabled, invalid, describedBy }: PasswordInputProps) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                className={`form-control w-full pr-9 ${invalid ? '!border-danger' : ''}`}
            />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                disabled={disabled}
                className="btn btn-invisible btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                title={visible ? 'Hide password' : 'Show password'}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
            >
                {visible ? <EyeClosedIcon /> : <EyeIcon />}
            </button>
        </div>
    );
}

/** Waits until the UI answers on its new port (any response, even opaque, means it is up). */
async function waitForPort(origin: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await fetch(`${origin}/api/auth/session`, { mode: 'no-cors', cache: 'no-store' });
            return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

export default function SetupPage({ onDone }: SetupPageProps) {
    const [info, setInfo] = useState<SetupInfo | null>(null);
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [uiPort, setUiPort] = useState(7001);
    const [mockPortMin, setMockPortMin] = useState(7002);
    const [mockPortMax, setMockPortMax] = useState(7020);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [copied, setCopied] = useState<number | null>(null);

    const copyCommand = async (command: string, index: number) => {
        try {
            await navigator.clipboard.writeText(command);
            setCopied(index);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            // Clipboard needs HTTPS or localhost; the command can still be selected by hand
        }
    };

    useEffect(() => {
        fetch('/api/setup')
            .then(res => res.json())
            .then(data => {
                if (!data.required) {
                    onDone();
                    return;
                }
                setInfo(data);
                setUiPort(data.uiPort.value);
                // Keep the suggested 7002-7020 unless a range is already set (the default is "any port")
                if (data.mockPortRange.locked || data.mockPortRange.min !== 1 || data.mockPortRange.max !== 65535) {
                    setMockPortMin(data.mockPortRange.min);
                    setMockPortMax(data.mockPortRange.max);
                }
            })
            .catch(() => setError('Unable to reach the server.'));
    }, [onDone]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (info?.needsCredentials && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setStatus('Saving…');
        try {
            const res = await fetch('/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, uiPort, mockPortMin, mockPortMax }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Setup failed.');
                setStatus(null);
                return;
            }

            if (data.moved) {
                const origin = `${window.location.protocol}//${window.location.hostname}:${data.uiPort}`;
                setStatus(`Moving to port ${data.uiPort}…`);
                await waitForPort(origin);
                window.location.href = `${origin}/`;
                return;
            }
            onDone();
        } catch {
            setError('Unable to reach the server.');
            setStatus(null);
        }
    };

    const busy = status !== null;
    // Only once something is typed in the confirm field, so it does not flag an untouched form
    const passwordMismatch = !!info?.needsCredentials && confirmPassword !== '' && password !== confirmPassword;

    return (
        <main className="min-h-full flex items-center justify-center bg-canvas-muted px-4 py-8">
            <div className="w-full max-w-[880px]">
                <div className="mb-6 flex flex-col items-center text-fg-default">
                    <img src={logo} alt="Mockoon UI" className="h-[72px] w-[72px] object-contain" />
                    <h1 className="mt-6 text-2xl font-light tracking-tight text-center">Set up Mockoon UI</h1>
                </div>

                {error && (
                    <div role="alert" className="flash flash-error text-[13px]">{error}</div>
                )}

                {!info ? (
                    !error && <p className="text-center text-fg-muted text-sm">Loading…</p>
                ) : (
                    <form onSubmit={handleSubmit} className="Box bg-canvas-muted">
                        {/* Two columns from md up, stacked on narrow screens */}
                        <div className="grid md:grid-cols-2 md:divide-x divide-border-muted">
                            <section className="p-4 space-y-4">
                                <h2 className="text-sm font-semibold text-fg-default">Access</h2>
                                {info.needsCredentials ? (
                                    <>
                                        <div>
                                            <label htmlFor="setup-username" className="form-label font-normal">Username</label>
                                            <input
                                                id="setup-username"
                                                type="text"
                                                autoComplete="username"
                                                autoFocus
                                                required
                                                maxLength={64}
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                disabled={busy}
                                                className="form-control w-full"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="setup-password" className="form-label font-normal">Password</label>
                                            <PasswordInput
                                                id="setup-password"
                                                value={password}
                                                onChange={setPassword}
                                                disabled={busy}
                                            />
                                            <p className="form-caption">At least 8 characters.</p>
                                        </div>
                                        <div>
                                            <label htmlFor="setup-password-confirm" className="form-label font-normal">Confirm password</label>
                                            <PasswordInput
                                                id="setup-password-confirm"
                                                value={confirmPassword}
                                                onChange={setConfirmPassword}
                                                disabled={busy}
                                                invalid={passwordMismatch}
                                                describedBy={passwordMismatch ? 'setup-password-mismatch' : undefined}
                                            />
                                            {passwordMismatch ? (
                                                <p id="setup-password-mismatch" role="alert" className="form-caption text-danger">
                                                    Passwords do not match.
                                                </p>
                                            ) : (
                                                <p className="form-caption">
                                                    Forgot it later? Set MOCKOON_UI_USERNAME and MOCKOON_UI_PASSWORD in .env and restart.
                                                </p>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flash text-[13px]">
                                        Login comes from MOCKOON_UI_USERNAME and MOCKOON_UI_PASSWORD in .env.
                                    </div>
                                )}
                            </section>

                            <section className="p-4 space-y-4 border-t border-border-muted md:border-t-0">
                                <h2 className="text-sm font-semibold text-fg-default">Ports</h2>

                                <div>
                                    <label htmlFor="setup-ui-port" className="form-label font-normal">Mockoon UI port</label>
                                    <input
                                        id="setup-ui-port"
                                        type="number"
                                        required
                                        min={1}
                                        max={65535}
                                        value={uiPort}
                                        onChange={(e) => setUiPort(parseInt(e.target.value) || 0)}
                                        disabled={busy || info.uiPort.locked}
                                        className="form-control w-full font-mono"
                                    />
                                    <p className="form-caption">
                                        {info.uiPort.locked
                                            ? 'Set by --port or the PORT variable on the server.'
                                            : 'The page reloads on this port after saving.'}
                                    </p>
                                </div>

                                <div>
                                    <span className="form-label font-normal">Mock server port range</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            aria-label="Mock server port range from"
                                            type="number"
                                            required
                                            min={1}
                                            max={65535}
                                            value={mockPortMin}
                                            onChange={(e) => setMockPortMin(parseInt(e.target.value) || 0)}
                                            disabled={busy || info.mockPortRange.locked}
                                            className="form-control w-full font-mono"
                                        />
                                        <span className="text-fg-muted">–</span>
                                        <input
                                            aria-label="Mock server port range to"
                                            type="number"
                                            required
                                            min={1}
                                            max={65535}
                                            value={mockPortMax}
                                            onChange={(e) => setMockPortMax(parseInt(e.target.value) || 0)}
                                            disabled={busy || info.mockPortRange.locked}
                                            className="form-control w-full font-mono"
                                        />
                                    </div>
                                    {info.mockPortRange.locked && (
                                        <p className="form-caption">Set by MOCKOON_PORT_RANGE on the server.</p>
                                    )}
                                </div>

                                {info.firewall !== 'none' && (
                                    <div>
                                        <span className="form-label font-normal">Firewall ({FIREWALL_LABELS[info.firewall]})</span>
                                        <div className="bg-canvas-inset rounded-md border border-border-custom divide-y divide-border-muted">
                                            {firewallCommands(info.firewall, uiPort, mockPortMin, mockPortMax).map((command, i) => (
                                                <div key={command} className="flex items-center gap-2 pl-3 pr-1 py-1">
                                                    <code className="flex-1 min-w-0 text-xs font-mono text-fg-default break-words">
                                                        <span className="text-fg-muted select-none">{info.firewall === 'windows' ? 'PS> ' : '$ '}</span>{command}
                                                    </code>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyCommand(command, i)}
                                                        className="btn btn-invisible btn-icon btn-sm shrink-0"
                                                        title="Copy command"
                                                        aria-label="Copy command"
                                                    >
                                                        {copied === i ? <CheckIcon className="text-success" /> : <CopyIcon />}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="form-caption">
                                            {info.firewall === 'windows' ? 'Run once in PowerShell as Administrator. ' : 'Run once on the server. '}
                                            Mockoon UI never changes the firewall; set MOCKOON_FIREWALL in .env to switch or hide this.
                                        </p>
                                    </div>
                                )}
                            </section>
                        </div>

                        <div className="flex justify-end px-4 py-3 border-t border-border-muted">
                            <button type="submit" disabled={busy || passwordMismatch} className="btn btn-primary w-full md:w-auto">
                                {status ?? 'Save and continue'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </main>
    );
}
