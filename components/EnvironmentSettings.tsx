import React, { useState, useEffect } from 'react';
import { Environment } from '@/types/mockoon';
import HeadersList from './shared/HeadersList';
import PortSelect from './shared/PortSelect';
import { AlertIcon } from '@primer/octicons-react';

interface EnvironmentSettingsProps {
    environment: Environment;
    onSave: (updatedFields: Partial<Environment>) => void;
    notify: (message: string, type: 'success' | 'error') => void;
    onDelete?: () => void;
}

export default function EnvironmentSettings({ environment, onSave, notify, onDelete }: EnvironmentSettingsProps) {
    const [name, setName] = useState(environment.name);
    const [port, setPort] = useState(environment.port);
    const [endpointPrefix, setEndpointPrefix] = useState(environment.endpointPrefix);
    const [latency, setLatency] = useState(environment.latency);
    const [isSaving, setIsSaving] = useState(false);

    // TLS Settings
    const [tlsEnabled, setTlsEnabled] = useState(environment.tlsOptions.enabled);

    // Proxy Settings
    const [proxyEnabled, setProxyEnabled] = useState(environment.proxyMode);

    useEffect(() => {
        setName(environment.name);
        setPort(environment.port);
        setEndpointPrefix(environment.endpointPrefix);
        setLatency(environment.latency);
        setTlsEnabled(environment.tlsOptions.enabled);
        setProxyEnabled(environment.proxyMode);
    }, [environment]);

    const handleSave = async (updates: Partial<Environment>) => {
        setIsSaving(true);
        try {
            const response = await fetch('/api/environments/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: environment.filename,
                    updatedEnv: updates
                })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                // Show the server's reason (e.g. port outside the range or already used) and undo the edit
                if ('port' in updates) setPort(environment.port);
                throw new Error(data.error || 'Failed to update settings');
            }

            onSave(updates);
            notify('Settings saved successfully', 'success');
        } catch (error: any) {
            notify(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 bg-canvas overflow-auto px-6 py-8">
            <div className="max-w-3xl mx-auto space-y-10">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-muted pb-2">
                    <div>
                        <h1 className="text-2xl font-normal text-fg-default">General</h1>
                    </div>
                    <span className={`Label ${isSaving ? 'text-attention border-attention-muted' : 'text-success border-success-muted'}`}>
                        {isSaving ? 'Saving…' : 'All changes synced'}
                    </span>
                </div>

                {/* Section: General */}
                <section className="space-y-4">
                    <p className="text-sm text-fg-muted">Configuring server-wide behavior for &ldquo;{environment.name}&rdquo;.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                            <label htmlFor="env-name" className="form-label">Environment name</label>
                            <input
                                id="env-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={() => handleSave({ name })}
                                className="form-control w-full"
                            />
                        </div>
                        <div>
                            <label htmlFor="env-port" className="form-label">Port</label>
                            <PortSelect
                                id="env-port"
                                value={port}
                                onChange={setPort}
                                onCommit={(value) => value !== environment.port && handleSave({ port: value })}
                                currentFilename={environment.filename}
                            />
                            <p className="form-caption">Restart the mock server to apply a new port.</p>
                        </div>
                        <div>
                            <label htmlFor="env-prefix" className="form-label">Global prefix</label>
                            <label className="form-control w-full flex items-center !py-0 cursor-text">
                                <span className="text-fg-muted font-mono mr-1">/</span>
                                <input
                                    id="env-prefix"
                                    type="text"
                                    value={endpointPrefix}
                                    onChange={(e) => setEndpointPrefix(e.target.value)}
                                    onBlur={() => handleSave({ endpointPrefix })}
                                    className="flex-1 min-w-0 bg-transparent outline-none font-mono text-sm placeholder:text-fg-subtle"
                                    placeholder="api/v1"
                                />
                            </label>
                        </div>
                        <div>
                            <label htmlFor="env-latency" className="form-label">Global latency (ms)</label>
                            <input
                                id="env-latency"
                                type="number"
                                value={latency}
                                onChange={(e) => setLatency(parseInt(e.target.value) || 0)}
                                onBlur={() => handleSave({ latency })}
                                className="form-control w-full font-mono"
                            />
                        </div>
                    </div>
                </section>

                {/* Section: Features */}
                <section className="space-y-3">
                    <h2 className="text-xl font-normal text-fg-default border-b border-border-muted pb-2">Features</h2>
                    <div className="Box">
                        {/* TLS */}
                        <div className="Box-row">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-fg-default">HTTPS / TLS</p>
                                    <p className="text-xs text-fg-muted">Serve this environment over HTTPS.</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={tlsEnabled}
                                    aria-label="HTTPS / TLS"
                                    onClick={() => {
                                        const newVal = !tlsEnabled;
                                        setTlsEnabled(newVal);
                                        handleSave({ tlsOptions: { ...environment.tlsOptions, enabled: newVal } });
                                    }}
                                    className="ToggleSwitch"
                                />
                            </div>
                            {tlsEnabled && (
                                <div className="flash flash-warn mt-3 text-[13px]">
                                    <AlertIcon className="text-attention flex-shrink-0 mt-0.5" />
                                    <p>Mockoon uses self-signed certificates by default. You may need to trust them in your browser or client.</p>
                                </div>
                            )}
                        </div>

                        {/* Proxy */}
                        <div className="Box-row">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-fg-default">Proxy mode</p>
                                    <p className="text-xs text-fg-muted">Forward unmatched requests to another host.</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={proxyEnabled}
                                    aria-label="Proxy mode"
                                    onClick={() => {
                                        const newVal = !proxyEnabled;
                                        setProxyEnabled(newVal);
                                        handleSave({ proxyMode: newVal });
                                    }}
                                    className="ToggleSwitch"
                                />
                            </div>
                            {proxyEnabled && (
                                <div className="mt-3">
                                    <label htmlFor="env-proxy-host" className="form-label">Target host</label>
                                    <input
                                        id="env-proxy-host"
                                        type="text"
                                        placeholder="https://api.example.com"
                                        value={environment.proxyHost}
                                        onChange={(e) => handleSave({ proxyHost: e.target.value })}
                                        className="form-control w-full font-mono"
                                    />
                                    <p className="form-caption">Unmatched requests will be forwarded here.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Global Headers */}
                <section className="space-y-3">
                    <div className="border-b border-border-muted pb-2">
                        <h2 className="text-xl font-normal text-fg-default">Global headers</h2>
                    </div>
                    <p className="text-sm text-fg-muted">These headers will be added to ALL responses served by this environment.</p>
                    <div className="Box">
                        <HeadersList
                            headers={environment.headers}
                            onChange={(headers) => handleSave({ headers })}
                        />
                    </div>
                </section>

                {/* Danger Zone (GitHub repository settings style) */}
                {onDelete && (
                    <section className="space-y-3">
                        <h2 className="text-xl font-normal text-fg-default border-b border-border-muted pb-2">Danger Zone</h2>
                        <div className="Box !border-danger-emphasis">
                            <div className="Box-row flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-semibold text-fg-default">Delete this environment</p>
                                    <p className="text-xs text-fg-muted">Stops its mock server and moves the file to data/.deleted/.</p>
                                </div>
                                <button onClick={onDelete} className="btn btn-sm btn-danger flex-shrink-0">
                                    Delete this environment
                                </button>
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
