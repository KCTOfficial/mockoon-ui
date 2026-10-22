import { Header } from '@/types/mockoon';
import { PlusIcon, XIcon } from '@primer/octicons-react';

interface HeadersListProps {
    headers: Header[];
    onChange: (headers: Header[]) => void;
    title?: string;
}

export default function HeadersList({ headers, onChange, title = 'Headers' }: HeadersListProps) {
    const handleAddHeader = () => {
        onChange([...headers, { key: '', value: '' }]);
    };

    const handleUpdateHeader = (index: number, field: 'key' | 'value', value: string) => {
        const newHeaders = [...headers];
        newHeaders[index] = { ...newHeaders[index], [field]: value };
        onChange(newHeaders);
    };

    const handleRemoveHeader = (index: number) => {
        const newHeaders = headers.filter((_, i) => i !== index);
        onChange(newHeaders);
    };

    const handleAddCORS = () => {
        const corsHeaders: Header[] = [
            { key: 'Access-Control-Allow-Origin', value: '*' },
            { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Origin, Accept, Authorization, Content-Length, X-Requested-With' }
        ];

        // Filter out existing ones to avoid duplicates
        const existingKeys = headers.map(h => h.key.toLowerCase());
        const toAdd = corsHeaders.filter(h => !existingKeys.includes(h.key.toLowerCase()));

        onChange([...headers, ...toAdd]);
    };

    return (
        <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg-default">{title}</h3>
                <div className="flex gap-2">
                    <button onClick={handleAddCORS} className="btn btn-sm">
                        Add CORS
                    </button>
                    <button onClick={handleAddHeader} className="btn btn-sm">
                        <PlusIcon />
                        Add header
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                {headers.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-border-custom rounded-md text-fg-muted">
                        <p className="text-sm">No headers defined</p>
                    </div>
                ) : (
                    headers.map((header, index) => (
                        <div key={index} className="flex gap-2 group">
                            <input
                                type="text"
                                placeholder="Header name"
                                value={header.key}
                                onChange={(e) => handleUpdateHeader(index, 'key', e.target.value)}
                                className="form-control form-control-sm flex-1 min-w-0 font-mono"
                            />
                            <input
                                type="text"
                                placeholder="Value"
                                value={header.value}
                                onChange={(e) => handleUpdateHeader(index, 'value', e.target.value)}
                                className="form-control form-control-sm flex-1 min-w-0 font-mono"
                            />
                            <button
                                onClick={() => handleRemoveHeader(index)}
                                className="btn btn-invisible btn-icon btn-sm opacity-0 group-hover:opacity-100 hover:!text-danger"
                                title="Remove header"
                                aria-label="Remove header"
                            >
                                <XIcon />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
