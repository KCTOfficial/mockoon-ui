import { ResponseRule, LogicalOperators } from '@/types/mockoon';
import { PlusIcon, XIcon } from '@primer/octicons-react';

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
        <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-fg-default">Rules</h3>
                    {rules.length > 1 && (
                        <select
                            value={operator}
                            onChange={(e) => onOperatorChange(e.target.value as LogicalOperators)}
                            className="form-control form-control-sm"
                            aria-label="Rules operator"
                        >
                            <option value="OR">Match Any (OR)</option>
                            <option value="AND">Match All (AND)</option>
                        </select>
                    )}
                </div>
                <button onClick={handleAddRule} className="btn btn-sm">
                    <PlusIcon />
                    Add rule
                </button>
            </div>

            <div className="space-y-2">
                {rules.length === 0 ? (
                    <div className="text-center py-8 px-4 border border-dashed border-border-custom rounded-md text-fg-muted">
                        <p className="text-sm">No rules defined. This response will be served by default or based on selection mode.</p>
                    </div>
                ) : (
                    rules.map((rule, index) => (
                        <div key={index} className="Box p-3 flex flex-col gap-2">
                            <div className="flex gap-2 items-center">
                                {/* Invert Toggle */}
                                <button
                                    onClick={() => handleUpdateRule(index, { invert: !rule.invert })}
                                    className={`btn btn-sm font-mono font-semibold w-12 ${rule.invert ? '!text-danger !border-danger-muted !bg-danger-subtle' : ''}`}
                                    title="Invert rule"
                                    aria-pressed={rule.invert}
                                >
                                    {rule.invert ? 'NOT' : 'IF'}
                                </button>

                                {/* Target Selection */}
                                <select
                                    value={rule.target}
                                    onChange={(e) => handleUpdateRule(index, { target: e.target.value as any })}
                                    className="form-control form-control-sm flex-1 min-w-0"
                                    aria-label="Rule target"
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
                                        className="form-control form-control-sm flex-1 min-w-0 font-mono"
                                    />
                                )}

                                <button
                                    onClick={() => handleRemoveRule(index)}
                                    className="btn btn-invisible btn-icon btn-sm hover:!text-danger"
                                    title="Remove rule"
                                    aria-label="Remove rule"
                                >
                                    <XIcon />
                                </button>
                            </div>

                            <div className="flex gap-2 items-center pl-14">
                                {/* Operator */}
                                <select
                                    value={rule.operator}
                                    onChange={(e) => handleUpdateRule(index, { operator: e.target.value as any })}
                                    className="form-control form-control-sm w-1/3"
                                    aria-label="Rule operator"
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
                                        className="form-control form-control-sm flex-1 min-w-0 font-mono"
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
