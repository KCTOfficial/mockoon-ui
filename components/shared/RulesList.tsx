'use client';

import React from 'react';
import { ResponseRule, LogicalOperators } from '@/types/mockoon';

interface RulesListProps {
    rules: ResponseRule[];
    onChange: (rules: ResponseRule[]) => void;
    operator: LogicalOperators;
    onOperatorChange: (operator: LogicalOperators) => void;
}

const TARGETS = [
    { value: 'body', label: 'Body (JSON path)' },
    { value: 'query', label: 'Query string' },
    { value: 'header', label: 'Header' },
    { value: 'cookie', label: 'Cookie' },
    { value: 'params', label: 'Route param' },
    { value: 'path', label: 'Full path' },
    { value: 'method', label: 'Method' },
    { value: 'request_number', label: 'Request number' },
    { value: 'global_var', label: 'Global variable' },
    { value: 'data_bucket', label: 'Data bucket' },
    { value: 'templating', label: 'Templating' },
];

const OPERATORS = [
    { value: 'equals', label: 'equals' },
    { value: 'regex', label: 'regex' },
    { value: 'regex_i', label: 'regex (case-ins.)' },
    { value: 'null', label: 'is null' },
    { value: 'empty_array', label: 'is empty array' },
    { value: 'array_includes', label: 'array includes' },
    { value: 'valid_json_schema', label: 'valid JSON schema' },
];

export default function RulesList({ rules, onChange, operator, onOperatorChange }: RulesListProps) {
    const handleAddRule = () => {
        onChange([...rules, {
            target: 'body',
            modifier: '',
            value: '',
            invert: false,
            operator: 'equals'
        }]);
    };

    const handleUpdateRule = (index: number, updates: Partial<ResponseRule>) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], ...updates };
        onChange(newRules);
    };

    const handleRemoveRule = (index: number) => {
        const newRules = rules.filter((_, i) => i !== index);
        onChange(newRules);
    };

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Rules</h3>
                    {rules.length > 1 && (
                        <select
                            value={operator}
                            onChange={(e) => onOperatorChange(e.target.value as LogicalOperators)}
                            className="bg-surface text-xs border border-border-custom rounded px-2 py-1 focus:outline-none"
                        >
                            <option value="OR">Match Any (OR)</option>
                            <option value="AND">Match All (AND)</option>
                        </select>
                    )}
                </div>
                <button
                    onClick={handleAddRule}
                    className="text-xs px-2 py-1 bg-accent/10 hover:bg-accent/20 text-accent rounded border border-accent/20 transition-colors flex items-center gap-1"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    Add rule
                </button>
            </div>

            <div className="space-y-3">
                {rules.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-border-custom rounded-lg text-text-muted">
                        <p className="text-sm">No rules defined. This response will be served by default or based on selection mode.</p>
                    </div>
                ) : (
                    rules.map((rule, index) => (
                        <div key={index} className="flex flex-col gap-2 p-3 bg-surface border border-border-custom rounded-lg group border-l-4 border-l-accent/30 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="flex gap-2 items-center">
                                {/* Invert Toggle */}
                                <button
                                    onClick={() => handleUpdateRule(index, { invert: !rule.invert })}
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${rule.invert ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-surface text-text-secondary border border-border-custom'}`}
                                    title="Invert rule"
                                >
                                    {rule.invert ? 'NOT' : 'IF'}
                                </button>

                                {/* Target Selection */}
                                <select
                                    value={rule.target}
                                    onChange={(e) => handleUpdateRule(index, { target: e.target.value as any })}
                                    className="flex-1 bg-input border border-border-custom rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                                >
                                    {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>

                                {/* Modifier / Key */}
                                {rule.target !== 'path' && rule.target !== 'method' && rule.target !== 'request_number' && (
                                    <input
                                        type="text"
                                        placeholder="Property path / key"
                                        value={rule.modifier}
                                        onChange={(e) => handleUpdateRule(index, { modifier: e.target.value })}
                                        className="flex-1 bg-input border border-border-custom rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                                    />
                                )}

                                <button
                                    onClick={() => handleRemoveRule(index)}
                                    className="p-1 text-text-muted hover:text-red-400 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex gap-2 items-center">
                                {/* Operator */}
                                <select
                                    value={rule.operator}
                                    onChange={(e) => handleUpdateRule(index, { operator: e.target.value as any })}
                                    className="w-1/3 bg-input border border-border-custom rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent italic text-text-secondary"
                                >
                                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>

                                {/* Value */}
                                {rule.operator !== 'null' && rule.operator !== 'empty_array' && (
                                    <input
                                        type="text"
                                        placeholder="Expected value / Regex"
                                        value={rule.value}
                                        onChange={(e) => handleUpdateRule(index, { value: e.target.value })}
                                        className="flex-1 bg-input border border-border-custom rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                                    />
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
