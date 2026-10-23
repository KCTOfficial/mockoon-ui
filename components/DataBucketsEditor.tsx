import React, { useState, useEffect } from 'react';
import { Environment, DataBucket } from '@/types/mockoon';
import MonacoEditorWrapper from './shared/MonacoEditorWrapper';
import ConfirmDialog from './shared/ConfirmDialog';
import { DatabaseIcon, PlusIcon, XIcon } from '@primer/octicons-react';

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
    const [bucketToDelete, setBucketToDelete] = useState<DataBucket | null>(null);

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
                setBucketToDelete(null);
            } else {
                notify('Error deleting bucket', 'error');
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
        <div className="flex-1 flex bg-canvas overflow-hidden">
            {/* Sidebar: Bucket List */}
            <div className="w-64 border-r border-border-custom bg-canvas flex flex-col">
                <div className="h-12 px-3 flex items-center justify-between border-b border-border-custom bg-canvas-muted">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-fg-default">Data buckets</h2>
                        <span className="Counter">{environment.data.length}</span>
                    </div>
                    <button onClick={handleCreateBucket} className="btn btn-sm btn-icon" title="Add bucket" aria-label="Add bucket">
                        <PlusIcon />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {environment.data.length === 0 ? (
                        <p className="text-xs text-fg-muted text-center py-8">No buckets</p>
                    ) : (
                        environment.data.map(bucket => (
                            <div
                                key={bucket.uuid}
                                onClick={() => setSelectedBucketUuid(bucket.uuid)}
                                className={`NavList-item group !cursor-pointer justify-between ${selectedBucketUuid === bucket.uuid ? 'is-selected' : ''}`}
                            >
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm truncate text-fg-default">
                                        {bucket.name || 'Unnamed bucket'}
                                    </span>
                                    <span className="text-xs text-fg-muted font-mono font-normal truncate">{bucket.id}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setBucketToDelete(bucket); }}
                                    className="btn btn-invisible btn-icon btn-sm !w-6 !h-6 opacity-0 group-hover:opacity-100 hover:!text-danger"
                                    title="Delete bucket"
                                    aria-label="Delete bucket"
                                >
                                    <XIcon size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Main Content: Bucket Editor */}
            <div className="flex-1 flex flex-col min-w-0 bg-canvas">
                {activeBucket ? (
                    <div className="flex-1 flex flex-col p-6 overflow-auto">
                        <div className="flex items-end justify-between gap-4 mb-6 pb-4 border-b border-border-muted">
                            <div className="flex-1 flex gap-4 max-w-2xl">
                                <div className="flex-1">
                                    <label htmlFor="bucket-name" className="form-label">Bucket name</label>
                                    <input
                                        id="bucket-name"
                                        type="text"
                                        value={activeBucket.name}
                                        onChange={(e) => handleUpdateBucket(activeBucket.uuid, { name: e.target.value })}
                                        className="form-control w-full"
                                    />
                                </div>
                                <div className="w-32">
                                    <label htmlFor="bucket-id" className="form-label">ID</label>
                                    <input
                                        id="bucket-id"
                                        type="text"
                                        value={activeBucket.id}
                                        disabled
                                        className="form-control w-full font-mono"
                                    />
                                </div>
                            </div>
                            <span className={`Label mb-1.5 ${isSaving ? 'text-attention border-attention-muted' : 'text-success border-success-muted'}`}>
                                {isSaving ? 'Saving' : 'Saved'}
                            </span>
                        </div>

                        <div className="flex-1 flex flex-col">
                            <span className="form-label">Content (JSON)</span>
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
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <span className="text-fg-muted mb-4"><DatabaseIcon size={24} /></span>
                        <h3 className="text-xl font-semibold text-fg-default mb-1">No data bucket selected</h3>
                        <p className="text-sm text-fg-muted">Select or create a data bucket to start.</p>
                    </div>
                )}
            </div>

            {bucketToDelete && (
                <ConfirmDialog
                    title="Delete data bucket"
                    confirmLabel="Delete bucket"
                    onConfirm={() => handleDeleteBucket(bucketToDelete.uuid)}
                    onCancel={() => setBucketToDelete(null)}
                >
                    Delete the data bucket{' '}
                    <strong className="text-fg-default">&ldquo;{bucketToDelete.name || 'Unnamed bucket'}&rdquo;</strong>? Responses
                    that use <code className="font-mono text-fg-default">{`{{data '${bucketToDelete.id}'}}`}</code> will no
                    longer find it. This cannot be undone.
                </ConfirmDialog>
            )}
        </div>
    );
}
