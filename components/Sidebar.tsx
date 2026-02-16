'use client';

import { useRef, useState } from 'react';
import { Environment } from '@/types/mockoon';

export type MainView = 'routes' | 'databuckets' | 'settings' | 'logs';

interface SidebarProps {
    environments: Environment[];
    activeEnvId: string;
    onSelectEnv: (id: string) => void;
    onAddEnv: () => void;
    onImportEnv: (file: File) => void;
    onImportOpenAPI: (file: File) => void;
}

export default function Sidebar({ environments, activeEnvId, onSelectEnv, onAddEnv, onImportEnv, onImportOpenAPI }: SidebarProps) {
    const activeEnv = environments.find(env => env.uuid === activeEnvId);
    const [showTooltip, setShowTooltip] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportEnv(file);
            // Reset the input so the same file can be selected again
            e.target.value = '';
        }
    };

    const handleOpenApiChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportOpenAPI(file);
            // Reset the input so the same file can be selected again
            e.target.value = '';
        }
    };

    return (
        <div className="w-16 flex-shrink-0 bg-sidebar border-r border-border-custom flex flex-col items-center py-4 gap-4">
            {/* Environment Icons */}
            <div className="flex flex-col gap-3 w-full items-center mb-4 pb-4 border-b border-border-custom/50">
                {environments.map((env) => {
                    const initials = env.name.slice(0, 2).toUpperCase();
                    const isActive = activeEnvId === env.uuid;

                    return (
                        <div
                            key={env.uuid}
                            className="relative"
                            onMouseEnter={() => setShowTooltip(env.uuid)}
                            onMouseLeave={() => setShowTooltip(null)}
                        >
                            <div
                                onClick={() => onSelectEnv(env.uuid)}
                                className={`
                                    relative w-10 h-10 rounded-lg flex items-center justify-center 
                                    cursor-pointer transition-all duration-200 group
                                    ${isActive ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-active text-foreground/60 hover:text-foreground hover:bg-hover'}
                                `}
                            >
                                {isActive && (
                                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-accent rounded-r-full shadow-[0_0_8px_rgba(59,164,252,0.5)]" />
                                )}
                                <span className="text-[11px] font-bold select-none tracking-tighter">{initials}</span>
                                <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-sidebar ${isActive ? 'bg-green-500' : 'bg-foreground/40'}`} />
                            </div>
                            {showTooltip === env.uuid && (
                                <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-active text-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg border border-border-custom">
                                    {env.name}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Add Environment Button */}
            <div className="relative">
                <button
                    onClick={onAddEnv}
                    onMouseEnter={() => setShowTooltip('add')}
                    onMouseLeave={() => setShowTooltip(null)}
                    className="w-10 h-10 rounded-lg border border-border-custom text-foreground/50 flex items-center justify-center hover:bg-hover hover:text-foreground transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                </button>
                {showTooltip === 'add' && (
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-active text-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg border border-border-custom">
                        Create new environment
                    </div>
                )}
            </div>

            {/* Import Mockoon JSON Button */}
            <div className="relative">
                <label
                    htmlFor="json-file-input"
                    className="w-10 h-10 rounded-lg border border-border-custom text-foreground/50 flex flex-col items-center justify-center hover:bg-hover hover:text-foreground transition-colors gap-0.5 cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[8px] font-bold">JSON</span>
                </label>
                <input
                    id="json-file-input"
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                />
                {showTooltip === 'json' && (
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-active text-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg border border-border-custom">
                        Import Mockoon environment (JSON)
                    </div>
                )}
            </div>

            {/* Import OpenAPI Button */}
            <div className="relative">
                <label
                    htmlFor="openapi-file-input"
                    className="w-10 h-10 rounded-lg border border-border-custom text-foreground/50 flex flex-col items-center justify-center hover:bg-hover hover:text-foreground transition-colors gap-0.5 cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <span className="text-[7px] font-bold">OAPI</span>
                </label>
                <input
                    id="openapi-file-input"
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={handleOpenApiChange}
                    className="hidden"
                />
                {showTooltip === 'openapi' && (
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-active text-foreground text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg border border-border-custom">
                        Import OpenAPI/Swagger (JSON/YAML)
                    </div>
                )}
            </div>

            <div className="flex-1" />
        </div>
    );
}
