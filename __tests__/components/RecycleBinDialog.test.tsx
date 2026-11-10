import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecycleBinDialog from '@/components/RecycleBinDialog';
import { Environment } from '@/types/mockoon';

const items = [
    { id: 'shop-2026-11-10T08-00-00-000Z.json', kind: 'environment', name: 'Shop API', port: 7002, originalFilename: 'shop.json', deletedAt: '2026-11-10T08:00:00.000Z', routeCount: 3, invalid: false },
    { id: 'broken.json', kind: 'environment', name: 'broken', port: null, originalFilename: 'broken.json', deletedAt: '2026-11-09T08:00:00.000Z', routeCount: 0, invalid: true },
];

const json = (body: object, ok = true) => Promise.resolve({ ok, json: async () => body });

describe('RecycleBinDialog', () => {
    const props = { environments: [] as Environment[], onClose: jest.fn(), onRestored: jest.fn(), onCountChange: jest.fn(), notify: jest.fn() };
    let fetchMock: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        fetchMock = jest.fn((url: string, init?: RequestInit) => {
            if (!init) return json({ items });
            const body = JSON.parse(String(init.body));
            if (body.action === 'restore') {
                return json({ success: true, environment: { uuid: 'u1', name: 'Shop API', port: 7005 }, previousPort: 7002, portChanged: true });
            }
            if (body.action === 'empty') return json({ success: true, deleted: 2 });
            return json({ success: true });
        });
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    it('lists deleted environments with port, routes and time', async () => {
        render(<RecycleBinDialog {...props} />);
        expect(await screen.findByText('Shop API')).toBeInTheDocument();
        expect(screen.getByText(/:7002/)).toBeInTheDocument();
        expect(screen.getByText(/3 routes/)).toBeInTheDocument();
        expect(screen.getByText('Unreadable')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Restore broken' })).toBeDisabled();
        expect(props.onCountChange).toHaveBeenCalledWith(2);
    });

    it('restores an item and reports the new port', async () => {
        const user = userEvent.setup();
        render(<RecycleBinDialog {...props} />);
        await user.click(await screen.findByRole('button', { name: 'Restore Shop API' }));

        await waitFor(() => expect(props.onRestored).toHaveBeenCalledWith(expect.objectContaining({ portChanged: true, previousPort: 7002 })));
        // The row fades out, then goes
        await waitFor(() => expect(screen.queryByText('Shop API')).not.toBeInTheDocument());
        expect(props.onCountChange).toHaveBeenLastCalledWith(1);
    });

    it('asks before deleting permanently', async () => {
        const user = userEvent.setup();
        render(<RecycleBinDialog {...props} />);
        await user.click(await screen.findByRole('button', { name: 'Delete Shop API permanently' }));

        expect(screen.getByRole('alertdialog')).toHaveTextContent('cannot be undone');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
        await waitFor(() => expect(screen.queryByText('Shop API')).not.toBeInTheDocument());
        expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ action: 'delete', id: items[0].id });
    });

    it('Escape in the confirmation only closes the confirmation', async () => {
        const user = userEvent.setup();
        render(<RecycleBinDialog {...props} />);
        await user.click(await screen.findByRole('button', { name: 'Empty recycle bin' }));
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('empties the recycle bin after confirming', async () => {
        const user = userEvent.setup();
        render(<RecycleBinDialog {...props} />);
        await user.click(await screen.findByRole('button', { name: 'Empty recycle bin' }));
        const confirm = screen.getAllByRole('button', { name: 'Empty recycle bin' }).at(-1)!;
        await user.click(confirm);

        expect(await screen.findByText('The recycle bin is empty')).toBeInTheDocument();
        expect(props.onCountChange).toHaveBeenLastCalledWith(0);
    });

    describe('deleted routes', () => {
        const routeItem = (extra: object = {}) => ({
            id: 'route-shop-2026-11-10T09-00-00-000Z.json', kind: 'route', name: 'GET /hello', port: null,
            originalFilename: 'shop.json', deletedAt: '2026-11-10T09:00:00.000Z', routeCount: 1, invalid: false,
            deletedFrom: { filename: 'shop.json', envName: 'Shop API', folderUuid: 'f1', folderName: 'Public' },
            ...extra,
        });
        const billing = {
            uuid: 'e2', name: 'Billing', port: 7004, filename: 'billing.json', routes: [],
            folders: [{ uuid: 'bf', name: 'Invoices', children: [] }], rootChildren: [{ type: 'folder', uuid: 'bf' }],
        } as unknown as Environment;

        const mockBin = (item: object, restore: (body: Record<string, unknown>) => object) => {
            fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
                if (!init) return json({ items: [item] });
                const body = JSON.parse(String(init.body));
                return Promise.resolve(restore(body));
            });
        };

        it('shows the kind and where it came from', async () => {
            mockBin(routeItem(), () => ({ ok: true, json: async () => ({}) }));
            render(<RecycleBinDialog {...props} />);
            expect(await screen.findByText('GET /hello')).toBeInTheDocument();
            expect(screen.getByText('Route')).toBeInTheDocument();
            expect(screen.getByText(/from Shop API › Public/)).toBeInTheDocument();
        });

        it('asks for another environment when its own is gone', async () => {
            const user = userEvent.setup();
            const target = { ...billing };
            mockBin(routeItem({ sourceMissing: true }), (body) => ({
                ok: true,
                json: async () => ({ success: true, kind: 'route', name: 'GET /hello', target, itemUuids: ['n1'], restoredToFolder: true, warnings: [], body }),
            }));
            render(<RecycleBinDialog {...props} environments={[billing]} />);

            expect(await screen.findByText(/Shop API › Public \(deleted\)/)).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Restore GET /hello' }));
            // Nothing is sent until a target is chosen
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(screen.getByText(/no longer exists\. Choose another environment to restore this route into\./)).toBeInTheDocument();

            await user.selectOptions(screen.getByLabelText('Folder'), 'bf');
            await user.click(screen.getByRole('button', { name: 'Restore to Billing' }));
            await waitFor(() => expect(props.onRestored).toHaveBeenCalledWith(expect.objectContaining({ kind: 'route', target })));
            expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({
                action: 'restore', id: 'route-shop-2026-11-10T09-00-00-000Z.json', targetFilename: 'billing.json', targetFolderUuid: 'bf',
            });
        });

        it('opens the picker when the environment was deleted after the list loaded', async () => {
            const user = userEvent.setup();
            mockBin(routeItem(), () => ({ ok: false, status: 409, json: async () => ({ error: '"Shop API" no longer exists.' }) }));
            render(<RecycleBinDialog {...props} environments={[billing]} />);

            await user.click(await screen.findByRole('button', { name: 'Restore GET /hello' }));
            expect(await screen.findByRole('button', { name: 'Restore to Billing' })).toBeInTheDocument();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(props.onRestored).not.toHaveBeenCalled();
        });
    });
});
