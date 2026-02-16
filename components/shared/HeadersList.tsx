'use client';

import React from 'react';
import { Header } from '@/types/mockoon';

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
        <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">{title}</h3>
                <div className="flex gap-2">
                    <button
                        onClick={handleAddCORS}
                        className="text-xs px-2 py-1 bg-surface hover:bg-hover text-text-primary rounded border border-border-custom transition-colors"
                    >
                        Add CORS
                    </button>
                    <button
                        onClick={handleAddHeader}
                        className="text-xs px-2 py-1 bg-accent/10 hover:bg-accent/20 text-accent rounded border border-accent/20 transition-colors flex items-center gap-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        Add header
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                {headers.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-border-custom rounded-lg text-text-muted">
                        <p className="text-sm">No headers defined</p>
                    </div>
                ) : (
                    headers.map((header, index) => (
                        <div key={index} className="flex gap-2 group animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Header name"
                                    value={header.key}
                                    onChange={(e) => handleUpdateHeader(index, 'key', e.target.value)}
                                    className="w-full bg-input border border-border-custom rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
                                />
                            </div>
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Value"
                                    value={header.value}
                                    onChange={(e) => handleUpdateHeader(index, 'value', e.target.value)}
                                    className="w-full bg-input border border-border-custom rounded px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
                                />
                            </div>
                            <button
                                onClick={() => handleRemoveHeader(index)}
                                className="p-2 text-text-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                title="Remove header"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
