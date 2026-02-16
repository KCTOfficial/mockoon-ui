'use client';

import React, { useState, useEffect, useRef } from 'react';

interface ResizableSplitterProps {
    children: [React.ReactNode, React.ReactNode];
    isVertical?: boolean;
    initialSize?: number; // Size of the primary pane in pixels
    minSize?: number;
    primaryPane?: 'first' | 'second';
    size?: number; // Controlled size
    onResize?: (newSize: number) => void;
}

export default function ResizableSplitter({
    children,
    isVertical = true,
    initialSize = 400,
    minSize = 100,
    primaryPane = 'first',
    size: controlledSize,
    onResize
}: ResizableSplitterProps) {
    const [internalSize, setInternalSize] = useState(initialSize);
    const size = controlledSize !== undefined ? controlledSize : internalSize;

    const isDragging = useRef(false);
    const startPos = useRef(0);
    const startSize = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;

            const currentPos = isVertical ? e.clientY : e.clientX;
            const delta = currentPos - startPos.current;

            // If primary pane is second, dragging down (positive delta) decreases size
            // dragging up (negative delta) increases size
            // Wait, if primary is second (bottom), dragging up (negative delta) means INCREASING height.
            // So default delta: pos - start.
            // If primary='first': newSize = startSize + delta.
            // If primary='second': newSize = startSize - delta.

            const effectiveDelta = primaryPane === 'first' ? delta : -delta;
            const newSize = Math.max(minSize, startSize.current + effectiveDelta);

            // Optional: Max size constraint based on container?
            if (containerRef.current) {
                const containerSize = isVertical ? containerRef.current.offsetHeight : containerRef.current.offsetWidth;
                if (newSize > containerSize - minSize) return;
            }

            if (onResize) {
                onResize(newSize);
            } else {
                setInternalSize(newSize);
            }
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isVertical, minSize, primaryPane, onResize]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        startPos.current = isVertical ? e.clientY : e.clientX;
        startSize.current = size;
        document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return (
        <div
            ref={containerRef}
            className={`flex ${isVertical ? 'flex-col' : 'flex-row'} w-full h-full overflow-hidden`}
        >
            <div
                className={`overflow-hidden flex flex-col ${primaryPane === 'second' ? 'flex-1' : ''}`}
                style={primaryPane === 'first' ? {
                    [isVertical ? 'height' : 'width']: size,
                    flexShrink: 0
                } : undefined}
            >
                {children[0]}
            </div>

            {/* Handle */}
            <div
                className={`flex-shrink-0 z-10 bg-border-custom hover:bg-accent/50 transition-colors ${isVertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'
                    }`}
                onMouseDown={handleMouseDown}
            />

            <div
                className={`overflow-hidden flex flex-col ${primaryPane === 'first' ? 'flex-1' : ''}`}
                style={primaryPane === 'second' ? {
                    [isVertical ? 'height' : 'width']: size,
                    flexShrink: 0
                } : undefined}
            >
                {children[1]}
            </div>
        </div>
    );
}
