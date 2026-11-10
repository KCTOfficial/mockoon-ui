import { fireEvent, render, screen } from '@testing-library/react';
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, ResizeHandle, useResizableWidth } from '@/components/shared/ResizablePanel';
import RouteList from '@/components/RouteList';
import Sidebar from '@/components/Sidebar';
import { Environment } from '@/types/mockoon';

function Panel({ storageKey = 'testWidth', defaultWidth = 320 }: { storageKey?: string; defaultWidth?: number }) {
    const resize = useResizableWidth({ storageKey, defaultWidth });
    return (
        <div data-testid="panel" style={{ width: resize.width }}>
            <ResizeHandle label="Resize panel" {...resize.handle} />
        </div>
    );
}

const handle = () => screen.getByRole('separator', { name: 'Resize panel' });
const width = () => Number(handle().getAttribute('aria-valuenow'));

describe('useResizableWidth / ResizeHandle', () => {
    beforeEach(() => localStorage.clear());

    it('starts at the default and exposes the limits', () => {
        render(<Panel />);
        expect(width()).toBe(320);
        expect(handle()).toHaveAttribute('aria-valuemin', String(PANEL_MIN_WIDTH));
        expect(handle()).toHaveAttribute('aria-valuemax', String(PANEL_MAX_WIDTH));
    });

    it('resizes with the keyboard and stays within the limits', () => {
        render(<Panel />);
        fireEvent.keyDown(handle(), { key: 'ArrowRight' });
        expect(width()).toBe(336);
        fireEvent.keyDown(handle(), { key: 'ArrowLeft', shiftKey: true });
        expect(width()).toBe(288);
        fireEvent.keyDown(handle(), { key: 'End' });
        expect(width()).toBe(PANEL_MAX_WIDTH);
        fireEvent.keyDown(handle(), { key: 'ArrowRight' });
        expect(width()).toBe(PANEL_MAX_WIDTH);
        fireEvent.keyDown(handle(), { key: 'Home' });
        expect(width()).toBe(PANEL_MIN_WIDTH);
        fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
        expect(width()).toBe(PANEL_MIN_WIDTH);
    });

    it('drags, clamps, and resets on double-click', () => {
        render(<Panel />);
        // jsdom has no pointer capture, and its pointer events carry no coordinates: use mouse events of that type
        handle().setPointerCapture = jest.fn();
        const pointer = (type: string, clientX: number) => fireEvent(handle(), new MouseEvent(type, { bubbles: true, clientX }));
        pointer('pointerdown', 500);
        pointer('pointermove', 560);
        expect(width()).toBe(380);
        pointer('pointermove', 2000);
        expect(width()).toBe(PANEL_MAX_WIDTH);
        pointer('pointerup', 2000);
        // Moving without a drag in progress changes nothing
        pointer('pointermove', 0);
        expect(width()).toBe(PANEL_MAX_WIDTH);
        // An event without coordinates never breaks the width
        fireEvent.pointerDown(handle());
        fireEvent.pointerMove(handle());
        expect(width()).toBe(PANEL_MAX_WIDTH);
        fireEvent.doubleClick(handle());
        expect(width()).toBe(320);
    });

    it('remembers the width per key and ignores saved values outside the limits', () => {
        const { unmount } = render(<Panel />);
        fireEvent.keyDown(handle(), { key: 'ArrowRight' });
        unmount();
        render(<Panel />);
        expect(width()).toBe(336);
        expect(localStorage.getItem('testWidth')).toBe('336');

        localStorage.setItem('other', '9999');
        const { unmount: u2 } = render(<Panel storageKey="other" />);
        expect(screen.getAllByRole('separator')[1]).toHaveAttribute('aria-valuenow', String(PANEL_MAX_WIDTH));
        u2();
    });
});

describe('resizable panels in the app', () => {
    beforeEach(() => localStorage.clear());

    it('the route list resizes with the same limits as the sidebar', () => {
        const env = { uuid: 'e1', name: 'Shop', port: 7002, filename: 'shop.json', routes: [], folders: [], rootChildren: [] } as unknown as Environment;
        render(
            <>
                <Sidebar environments={[env]} activeEnvId="e1" onSelectEnv={jest.fn()} onAddEnv={jest.fn()} onImportEnv={jest.fn()} onImportOpenAPI={jest.fn()} />
                <RouteList activeEnv={env} envFilename="shop.json" activeRouteId="" onSelectRoute={jest.fn()} />
            </>
        );
        const sidebar = screen.getByRole('separator', { name: 'Resize sidebar' });
        const list = screen.getByRole('separator', { name: 'Resize route list' });
        expect(list.getAttribute('aria-valuemin')).toBe(sidebar.getAttribute('aria-valuemin'));
        expect(list.getAttribute('aria-valuemax')).toBe(sidebar.getAttribute('aria-valuemax'));
        expect(list).toHaveAttribute('aria-valuenow', '320');
        expect(sidebar).toHaveAttribute('aria-valuenow', '256');

        // Each panel keeps its own width
        fireEvent.keyDown(list, { key: 'End' });
        expect(list).toHaveAttribute('aria-valuenow', String(PANEL_MAX_WIDTH));
        expect(sidebar).toHaveAttribute('aria-valuenow', '256');
        expect(localStorage.getItem('routeListWidth')).toBe(String(PANEL_MAX_WIDTH));
    });
});
