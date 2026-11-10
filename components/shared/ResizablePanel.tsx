import { useEffect, useRef, useState } from 'react';

/** Same limits for every resizable side panel (environments sidebar, route list). */
export const PANEL_MIN_WIDTH = 200;
export const PANEL_MAX_WIDTH = 480;

interface ResizableWidthOptions {
    /** localStorage key the width is remembered under, per browser */
    storageKey: string;
    defaultWidth: number;
    min?: number;
    max?: number;
}

export interface ResizableWidth {
    width: number;
    setWidth: (width: number) => void;
    isResizing: boolean;
    /** Spread onto <ResizeHandle> */
    handle: {
        width: number;
        min: number;
        max: number;
        isResizing: boolean;
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
        onPointerUp: () => void;
        onPointerCancel: () => void;
        onDoubleClick: () => void;
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
    };
}

/** Width of a panel resized by dragging its right edge, clamped to [min, max] and remembered in localStorage. */
export function useResizableWidth({ storageKey, defaultWidth, min = PANEL_MIN_WIDTH, max = PANEL_MAX_WIDTH }: ResizableWidthOptions): ResizableWidth {
    const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)));
    const [width, setWidthState] = useState(() => {
        try {
            const saved = Number(localStorage.getItem(storageKey));
            return saved ? clamp(saved) : defaultWidth;
        } catch {
            return defaultWidth;
        }
    });
    const [isResizing, setIsResizing] = useState(false);
    const dragStart = useRef<{ x: number; width: number } | null>(null);
    // A bad value (e.g. an event without coordinates) leaves the width as it is
    const setWidth = (value: number) => {
        if (Number.isFinite(value)) setWidthState(clamp(value));
    };

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, String(width));
        } catch {
            // Storage unavailable; the width just won't persist
        }
    }, [storageKey, width]);

    const end = () => {
        dragStart.current = null;
        setIsResizing(false);
    };

    return {
        width,
        setWidth,
        isResizing,
        handle: {
            width,
            min,
            max,
            isResizing,
            // Pointer capture keeps the drag going outside the handle
            onPointerDown: (e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                if (!Number.isFinite(e.clientX)) return;
                dragStart.current = { x: e.clientX, width };
                setIsResizing(true);
            },
            onPointerMove: (e) => {
                if (!dragStart.current) return;
                setWidth(dragStart.current.width + e.clientX - dragStart.current.x);
            },
            onPointerUp: end,
            onPointerCancel: end,
            onDoubleClick: () => setWidthState(defaultWidth),
            onKeyDown: (e) => {
                const step = e.shiftKey ? 48 : 16;
                if (e.key === 'ArrowLeft') setWidthState(w => clamp(w - step));
                else if (e.key === 'ArrowRight') setWidthState(w => clamp(w + step));
                else if (e.key === 'Home') setWidthState(min);
                else if (e.key === 'End') setWidthState(max);
                else return;
                e.preventDefault();
            },
        },
    };
}

/**
 * The draggable right edge of a panel (put it inside a `relative` panel). Keyboard: Tab to it, then arrow keys
 * (Shift for bigger steps), Home / End for the minimum / maximum; double-click resets the default width.
 */
export function ResizeHandle({ label, width, min, max, isResizing, position = '-right-[3px]', ...handlers }: ResizableWidth['handle'] & {
    label: string;
    /** Where the 6px grip sits; inside the edge (`right-0`) for panels that clip their overflow */
    position?: string;
}) {
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label={label}
            aria-valuenow={width}
            aria-valuemin={min}
            aria-valuemax={max}
            tabIndex={0}
            title="Drag to resize, double-click to reset"
            {...handlers}
            className={`absolute top-0 ${position} z-20 h-full w-1.5 cursor-col-resize select-none touch-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none ${isResizing ? 'bg-accent/50' : ''}`}
        />
    );
}
