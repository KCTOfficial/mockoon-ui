import React, { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useTheme } from '@/contexts/ThemeContext';

interface MonacoEditorWrapperProps {
    value: string;
    onChange: (value: string | undefined) => void;
    language?: string;
    onLanguageChange?: (language: string) => void;
    height?: string;
}

const SUPPORTED_LANGUAGES = [
    { id: 'json', label: 'JSON' },
    { id: 'html', label: 'HTML' },
    { id: 'xml', label: 'XML' },
    { id: 'javascript', label: 'JS' },
    { id: 'css', label: 'CSS' },
    { id: 'plaintext', label: 'Text' }
];

export default function MonacoEditorWrapper({
    value,
    onChange,
    language = 'json',
    onLanguageChange,
    height = '300px'
}: MonacoEditorWrapperProps) {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);
    const { resolvedTheme } = useTheme();

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Themes matching GitHub's Primer dark/light canvas
        monaco.editor.defineTheme('mockoon-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#0d1117',
                'editor.lineHighlightBackground': '#151b23',
                'editorLineNumber.foreground': '#656c76',
                'editorLineNumber.activeForeground': '#f0f6fc',
                'editor.selectionBackground': '#1f6feb55',
            }
        });

        monaco.editor.defineTheme('mockoon-light', {
            base: 'vs',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': '#ffffff',
                'editor.lineHighlightBackground': '#f6f8fa',
                'editorLineNumber.foreground': '#818b98',
                'editorLineNumber.activeForeground': '#1f2328',
                'editor.selectionBackground': '#0969da33',
            }
        });

        monaco.editor.setTheme(resolvedTheme === 'light' ? 'mockoon-light' : 'mockoon-dark');
    };

    // Update theme when resolvedTheme changes
    useEffect(() => {
        if (monacoRef.current) {
            monacoRef.current.editor.setTheme(resolvedTheme === 'light' ? 'mockoon-light' : 'mockoon-dark');
        }
    }, [resolvedTheme]);

    const handleBeautify = () => {
        if (editorRef.current) {
            editorRef.current.getAction('editor.action.formatDocument').run();
        }
    };

    return (
        <div className={`flex flex-col border border-border-custom rounded-md overflow-hidden bg-canvas group ${height === '100%' ? 'h-full' : ''}`}>
            <div className="flex items-center justify-between px-2 py-1.5 bg-canvas-muted border-b border-border-custom shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-fg-muted">Language</span>
                    <select
                        value={language}
                        onChange={(e) => onLanguageChange?.(e.target.value)}
                        className="form-control form-control-sm !h-6 !py-0 text-xs"
                        disabled={!onLanguageChange}
                    >
                        {SUPPORTED_LANGUAGES.map(lang => (
                            <option key={lang.id} value={lang.id}>{lang.label}</option>
                        ))}
                    </select>
                </div>
                <button onClick={handleBeautify} className="btn btn-sm !h-6">
                    Beautify
                </button>
            </div>
            <div
                style={{ height: height === '100%' ? undefined : height }}
                className={`relative ${height === '100%' ? 'flex-1 min-h-0' : ''}`}
            >
                <Editor
                    height="100%"
                    language={language}
                    value={value}
                    onChange={onChange}
                    onMount={handleEditorDidMount}
                    theme={resolvedTheme === 'light' ? 'mockoon-light' : 'mockoon-dark'}
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                        lineNumbers: 'on',
                        roundedSelection: false,
                        automaticLayout: true,
                        tabSize: 2,
                        padding: { top: 10, bottom: 10 }
                    }}
                />
            </div>
        </div>
    );
}
