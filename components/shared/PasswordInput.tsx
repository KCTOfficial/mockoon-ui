import { useState } from 'react';
import { EyeClosedIcon, EyeIcon } from '@primer/octicons-react';

interface PasswordInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    describedBy?: string;
    autoComplete?: 'new-password' | 'current-password';
    required?: boolean;
    minLength?: number;
    placeholder?: string;
}

/** Password field with a show/hide toggle. */
export default function PasswordInput({
    id,
    value,
    onChange,
    disabled,
    invalid,
    describedBy,
    autoComplete = 'new-password',
    required = true,
    minLength,
    placeholder,
}: PasswordInputProps) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete={autoComplete}
                required={required}
                minLength={minLength}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                className={`form-control w-full pr-9 ${invalid ? '!border-danger' : ''}`}
            />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                disabled={disabled}
                className="btn btn-invisible btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2"
                title={visible ? 'Hide password' : 'Show password'}
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
            >
                {visible ? <EyeClosedIcon /> : <EyeIcon />}
            </button>
        </div>
    );
}
