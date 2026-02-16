'use client';

import React, { useState, useEffect } from 'react';
import { Environment, DataBucket } from '@/types/mockoon';
import MonacoEditorWrapper from './shared/MonacoEditorWrapper';

interface DataBucketsEditorProps {
    environment: Environment;
    onUpdate: (updatedEnv: Partial<Environment>) => void;
    notify: (message: string, type: 'success' | 'error') => void;
}

export default function DataBucketsEditor({ environment, onUpdate, notify }: DataBucketsEditorProps) {
    const [selectedBucketUuid, setSelectedBucketUuid] = useState<string | null>(
        environment.data[0]?.uuid || null
    );
    const [isSaving, setIsSaving] = useState(false);

    const activeBucket = environment.data.find(b => b.uuid === selectedBucketUuid);

    const handleCreateBucket = async () => {
        try {
            const res = await fetch('/api/environments/databuckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: environment.filename,
                    action: 'create'
                })
            });
            const data = await res.json();
            if (data.success) {
                const updatedData = environment.data ? [...environment.data, data.dataBucket] : [data.dataBucket];
                onUpdate({ data: updatedData });
                setSelectedBucketUuid(data.dataBucket.uuid);
                notify('Data bucket created', 'success');
            }
        } catch (error) {
            notify('Error creating bucket', 'error');
        }
    };

    const handleDeleteBucket = async (uuid: string) => {
        try {
            const res = await fetch('/api/environments/databuckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: environment.filename,
                    action: 'delete',
                    dataBucketUuid: uuid
                })
            });
            if (res.ok) {
                const remaining = environment.data.filter(b => b.uuid !== uuid);
                onUpdate({ data: remaining });
                if (selectedBucketUuid === uuid) {
                    setSelectedBucketUuid(remaining[0]?.uuid || null);
                }
                notify('Data bucket deleted', 'success');
            }
        } catch (error) {
            notify('Error deleting bucket', 'error');
        }
    };

    const handleUpdateBucket = async (uuid: string, updates: Partial<DataBucket>) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/environments/databuckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: environment.filename,
                    action: 'update',
                    dataBucketUuid: uuid,
                    dataBucket: updates
                })
            });
            if (res.ok) {
                const newData = environment.data.map(b => b.uuid === uuid ? { ...b, ...updates } : b);
                onUpdate({ data: newData });
            }
        } catch (error) {
            notify('Error updating bucket', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex-1 flex bg-editor overflow-hidden animate-in fade-in duration-300">
            {/* Sidebar: Bucket List */}
            <div className="w-64 border-r border-border-custom bg-sidebar/30 flex flex-col">
                <div className="p-4 flex items-center justify-between border-b border-border-custom">
                    <h2 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Data Buckets</h2>
                    <button
                        onClick={handleCreateBucket}
                        className="p-1 text-accent hover:bg-accent/10 rounded transition-colors"
                        title="Add bucket"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {environment.data.length === 0 ? (
                        <p className="text-[10px] text-text-muted italic text-center py-8">No buckets</p>
                    ) : (
                        environment.data.map(bucket => (
                            <div
                                key={bucket.uuid}
                                onClick={() => setSelectedBucketUuid(bucket.uuid)}
                                className={`
                                    group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all
                                    ${selectedBucketUuid === bucket.uuid ? 'bg-accent/10 border border-accent/20' : 'hover:bg-hover border border-transparent'}
                                `}
                            >
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-sm truncate ${selectedBucketUuid === bucket.uuid ? 'text-accent' : 'text-text-primary'}`}>
                                        {bucket.name || 'Unnamed bucket'}
                                    </span>
                                    <span className="text-[10px] text-text-secondary font-mono truncate">{bucket.id}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteBucket(bucket.uuid); }}
                                    className="p-1 text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content: Bucket Editor */}
            <div className="flex-1 flex flex-col min-w-0 bg-editor">
                {activeBucket ? (
                    <div className="flex-1 flex flex-col p-8 overflow-auto">
                        <div className="flex items-center justify-between mb-8 pb-4 border-b border-border-custom">
                            <div className="flex-1 space-y-4 max-w-2xl">
                                <div className="flex gap-4">
                                    <div className="flex-1 space-y-1">
                                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Bucket Name</label>
                                        <input
                                            type="text"
                                            value={activeBucket.name}
                                            onChange={(e) => handleUpdateBucket(activeBucket.uuid, { name: e.target.value })}
                                            className="w-full bg-input border border-border-custom rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent"
                                        />
                                    </div>
                                    <div className="w-32 space-y-1">
                                        <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">ID</label>
                                        <input
                                            type="text"
                                            value={activeBucket.id}
                                            disabled
                                            className="w-full bg-input border border-border-custom rounded-lg px-4 py-2 text-xs font-mono text-text-muted cursor-not-allowed"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
                                <span className="text-[9px] uppercase font-bold text-text-muted">
                                    {isSaving ? 'Saving' : 'Saved'}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col gap-4">
                            <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest ml-1">Content (JSON)</label>
                            <div className="flex-1 min-h-[500px]">
                                <MonacoEditorWrapper
                                    height="100%"
                                    value={activeBucket.value}
                                    onChange={(val) => handleUpdateBucket(activeBucket.uuid, { value: val || '' })}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
                        <svg className="w-20 h-20 mb-6 opacity-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                        </svg>
                        <p className="font-light tracking-wide">Select or create a data bucket to start</p>
                    </div>
                )}
            </div>
        </div>
    );
}
