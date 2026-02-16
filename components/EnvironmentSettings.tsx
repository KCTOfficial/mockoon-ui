'use client';

import React, { useState, useEffect } from 'react';
import { Environment } from '@/types/mockoon';
import HeadersList from './shared/HeadersList';

interface EnvironmentSettingsProps {
    environment: Environment;
    onSave: (updatedFields: Partial<Environment>) => void;
    notify: (message: string, type: 'success' | 'error') => void;
}

export default function EnvironmentSettings({ environment, onSave, notify }: EnvironmentSettingsProps) {
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

            if (!response.ok) throw new Error('Failed to update settings');

            onSave(updates);
            notify('Settings saved successfully', 'success');
        } catch (error: any) {
            notify(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 bg-editor overflow-auto p-8 animate-in fade-in duration-300">
            <div className="max-w-4xl mx-auto space-y-12">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border-custom pb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-text-primary mb-1">Environment Settings</h1>
                        <p className="text-text-secondary text-sm italic">Configuring server-wide behavior for "{environment.name}"</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
                        <span className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">
                            {isSaving ? 'Saving...' : 'All changes synced'}
                        </span>
                    </div>
                </div>

                {/* Section: General */}
                <section className="space-y-6">
                    <h2 className="text-sm font-bold text-accent uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1 h-4 bg-accent rounded-full" />
                        General Configuration
                    </h2>

                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary uppercase">Environment Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={() => handleSave({ name })}
                                className="w-full bg-input border border-border-custom rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary uppercase">Port</label>
                            <input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                                onBlur={() => handleSave({ port })}
                                className="w-full bg-input border border-border-custom rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary uppercase">Global Prefix</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">/</span>
                                <input
                                    type="text"
                                    value={endpointPrefix}
                                    onChange={(e) => setEndpointPrefix(e.target.value)}
                                    onBlur={() => handleSave({ endpointPrefix })}
                                    className="w-full bg-input border border-border-custom rounded-lg pl-8 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent transition-all"
                                    placeholder="api/v1"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-text-secondary uppercase">Global Latency (ms)</label>
                            <input
                                type="number"
                                value={latency}
                                onChange={(e) => setLatency(parseInt(e.target.value) || 0)}
                                onBlur={() => handleSave({ latency })}
                                className="w-full bg-input border border-border-custom rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent transition-all"
                            />
                        </div>
                    </div>
                </section>

                {/* Section: TLS */}
                <section className="p-6 bg-surface rounded-xl border border-border-custom space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                            HTTPS / TLS
                        </h2>
                        <button
                            onClick={() => {
                                const newVal = !tlsEnabled;
                                setTlsEnabled(newVal);
                                handleSave({ tlsOptions: { ...environment.tlsOptions, enabled: newVal } });
                            }}
                            className={`w-12 h-6 rounded-full relative transition-colors ${tlsEnabled ? 'bg-accent' : 'bg-text-disabled'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${tlsEnabled ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>

                    {tlsEnabled && (
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-custom animate-in slide-in-from-top-2 duration-300">
                            <div className="text-xs text-text-secondary bg-yellow-500/5 border border-yellow-500/10 p-4 rounded-lg flex gap-3 col-span-2">
                                <svg className="w-5 h-5 text-yellow-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <p>Mockoon uses self-signed certificates by default. You may need to trust them in your browser or client.</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Section: Proxy */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest flex items-center gap-2">
                            Proxy Settings
                        </h2>
                        <button
                            onClick={() => {
                                const newVal = !proxyEnabled;
                                setProxyEnabled(newVal);
                                handleSave({ proxyMode: newVal });
                            }}
                            className={`w-12 h-6 rounded-full relative transition-colors ${proxyEnabled ? 'bg-accent' : 'bg-text-disabled'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proxyEnabled ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>

                    {proxyEnabled && (
                        <div className="space-y-4 pt-4 border-t border-border-custom animate-in slide-in-from-top-2 duration-300">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-text-secondary uppercase">Target Host</label>
                                <input
                                    type="text"
                                    placeholder="https://api.example.com"
                                    value={environment.proxyHost}
                                    onChange={(e) => handleSave({ proxyHost: e.target.value })}
                                    className="w-full bg-input border border-border-custom rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent"
                                />
                                <p className="text-[10px] text-text-muted italic">Unmatched requests will be forwarded here.</p>
                            </div>
                        </div>
                    )}
                </section>

                {/* Global Headers */}
                <section className="space-y-4">
                    <h2 className="text-sm font-bold text-text-primary uppercase tracking-widest">Global Headers</h2>
                    <p className="text-xs text-text-secondary">These headers will be added to ALL responses served by this environment.</p>
                    <div className="bg-surface rounded-xl border border-border-custom">
                        <HeadersList
                            headers={environment.headers}
                            onChange={(headers) => handleSave({ headers })}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
