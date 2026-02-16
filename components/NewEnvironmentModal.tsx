'use client';

import { useState } from 'react';

interface NewEnvironmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string, port: number) => Promise<void>;
}

export default function NewEnvironmentModal({ isOpen, onClose, onCreate }: NewEnvironmentModalProps) {
    const [name, setName] = useState('');
    const [port, setPort] = useState(3000);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        if (port < 1 || port > 65535) {
            setError('Port must be between 1 and 65535');
            return;
        }

        setIsCreating(true);
        try {
            await onCreate(name.trim(), port);
            setName('');
            setPort(3000);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to create environment');
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-surface border border-border-custom rounded-lg shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-custom">
                    <h2 className="text-sm font-semibold text-text-primary">Create New Mock Environment</h2>
                    <button
                        onClick={onClose}
                        className="text-text-secondary hover:text-text-primary transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                            Environment Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My API"
                            className="w-full px-3 py-2 bg-input border border-border-custom rounded text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                            Port Number
                        </label>
                        <input
                            type="number"
                            value={port}
                            onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                            min={1}
                            max={65535}
                            className="w-full px-3 py-2 bg-input border border-border-custom rounded text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50"
                        />
                        <p className="mt-1 text-[10px] text-text-secondary">
                            The port where the mock server will run (e.g., 3000, 8080)
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating}
                            className="px-4 py-1.5 text-xs font-medium bg-accent hover:bg-accent/90 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isCreating ? 'Creating...' : 'Create Environment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
