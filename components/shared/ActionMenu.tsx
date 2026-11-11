import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KebabHorizontalIcon } from '@primer/octicons-react';

export interface ActionMenuItem {
    key: string;
    label: string;
    icon?: ReactNode;
    /** Receives the menu button, so a follow-up picker can open at the same place */
    onSelect: (anchor: HTMLElement) => void;
    variant?: 'danger';
    disabled?: boolean;
    /** Draws a separator above this item */
    dividerBefore?: boolean;
}

export type MenuAnchor = { top?: number; bottom?: number; right: number };

const MENU_GAP = 4;
const EDGE = 8;

/** Fixed position under (or, low in the window, above) an element, right-aligned and kept on screen. */
export function menuAnchor(element: HTMLElement): MenuAnchor {
    const rect = element.getBoundingClientRect();
    const right = Math.max(EDGE, window.innerWidth - rect.right);
    return rect.bottom > window.innerHeight * 0.6
        ? { bottom: window.innerHeight - rect.top + MENU_GAP, right }
        : { top: rect.bottom + MENU_GAP, right };
}

interface ActionMenuProps {
    /** Accessible name of the "..." button, e.g. "Actions for GET /users" */
    label: string;
    items: ActionMenuItem[];
    /** Extra classes for the button (e.g. show on row hover) */
    className?: string;
    /** Button content instead of "..."; the button then looks like a regular small button */
    children?: ReactNode;
    disabled?: boolean;
}

/**
 * Primer-style ActionMenu: a "..." button opening a list of icon + label items. The list is portalled and
 * fixed-positioned so scrolling containers never clip it; clicks inside never reach the row behind it.
 */
export default function ActionMenu({ label, items, className = '', children, disabled }: ActionMenuProps) {
    const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const menuId = useId();

    const close = (refocus = true) => {
        setAnchor(null);
        if (refocus) buttonRef.current?.focus();
    };

    const enabledItems = () =>
        Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

    // Focus the first item when opened from the keyboard or the mouse, as Primer does
    useEffect(() => {
        if (anchor) enabledItems()[0]?.focus();
    }, [anchor]);

    // Close when the page scrolls or resizes under the fixed menu
    useEffect(() => {
        if (!anchor) return;
        const onChange = (e: Event) => {
            // Scrolling a long menu itself must not close it
            if (e.type === 'scroll' && listRef.current?.contains(e.target as Node)) return;
            setAnchor(null);
        };
        window.addEventListener('resize', onChange);
        window.addEventListener('scroll', onChange, true);
        return () => {
            window.removeEventListener('resize', onChange);
            window.removeEventListener('scroll', onChange, true);
        };
    }, [anchor]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const list = enabledItems();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape') close();
        else if (e.key === 'Tab') close(false);
        else if (e.key === 'ArrowDown') list[(index + 1) % list.length]?.focus();
        else if (e.key === 'ArrowUp') list[(index - 1 + list.length) % list.length]?.focus();
        else if (e.key === 'Home') list[0]?.focus();
        else if (e.key === 'End') list[list.length - 1]?.focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (anchor) close(false);
                    else setAnchor(menuAnchor(e.currentTarget));
                }}
                // Keyboard users open it with Enter/Space; ArrowDown too, like a Primer menu button
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && !anchor) {
                        e.preventDefault();
                        e.stopPropagation();
                        setAnchor(menuAnchor(e.currentTarget));
                    }
                }}
                draggable={false}
                disabled={disabled}
                className={children
                    ? `btn btn-sm flex-shrink-0 ${className}`
                    : `btn btn-invisible btn-icon btn-sm !w-6 !h-6 flex-shrink-0 aria-expanded:opacity-100 ${className}`}
                title={label}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={!!anchor}
                aria-controls={anchor ? menuId : undefined}
            >
                {children ?? <KebabHorizontalIcon size={16} />}
            </button>

            {anchor && createPortal(
                // Portalled, but React still bubbles events to the row: stop them here
                <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
                    <div className="fixed inset-0 z-40" onClick={() => close(false)} />
                    <div
                        ref={listRef}
                        id={menuId}
                        role="menu"
                        aria-label={label}
                        className="Overlay fixed z-50 p-2 min-w-[192px] max-w-[calc(100vw-16px)] max-h-[60vh] overflow-y-auto"
                        style={{ top: anchor.top, bottom: anchor.bottom, right: anchor.right }}
                    >
                        {items.map(item => (
                            <div key={item.key}>
                                {item.dividerBefore && <div role="separator" className="ActionList-divider" />}
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={item.disabled}
                                    onClick={() => {
                                        const button = buttonRef.current;
                                        close(false);
                                        if (button) item.onSelect(button);
                                    }}
                                    className={`ActionList-item ${item.variant === 'danger' ? 'ActionList-item--danger' : ''}`}
                                >
                                    {item.icon && <span className="w-4 flex justify-center">{item.icon}</span>}
                                    <span className="truncate">{item.label}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
