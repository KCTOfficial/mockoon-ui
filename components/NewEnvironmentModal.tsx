import { useState } from 'react';
import { XIcon } from '@primer/octicons-react';

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
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={onClose} />

            {/* Dialog */}
            <div role="dialog" aria-modal="true" aria-labelledby="new-env-title" className="Overlay relative w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-muted">
                    <h2 id="new-env-title" className="text-sm font-semibold text-fg-default">Create a new mock environment</h2>
                    <button onClick={onClose} className="btn btn-invisible btn-icon btn-sm" aria-label="Close">
                        <XIcon />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit}>
                    <div className="p-4 space-y-4">
                        {error && (
                            <div className="flash flash-error text-[13px]">{error}</div>
                        )}

                        <div>
                            <label htmlFor="new-env-name" className="form-label">
                                Environment name <span className="text-danger">*</span>
                            </label>
                            <input
                                id="new-env-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="My API"
                                className="form-control w-full"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="new-env-port" className="form-label">Port number</label>
                            <input
                                id="new-env-port"
                                type="number"
                                value={port}
                                onChange={(e) => setPort(parseInt(e.target.value) || 0)}
                                min={1}
                                max={65535}
                                className="form-control w-full font-mono"
                            />
                            <p className="form-caption">
                                The port where the mock server will run (e.g., 3000, 8080)
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-muted">
                        <button type="button" onClick={onClose} className="btn btn-sm">
                            Cancel
                        </button>
                        <button type="submit" disabled={isCreating} className="btn btn-sm btn-primary">
                            {isCreating ? 'Creating…' : 'Create environment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
