import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RouteList from '@/components/RouteList';
import { Environment } from '@/types/mockoon';

const route = (uuid: string, endpoint: string) => ({
    uuid, type: 'http', method: 'get', endpoint, responses: [{ label: '' }],
});

const makeEnv = (overrides: Partial<Environment> = {}) => ({
    uuid: 'env-1',
    name: 'Shop',
    port: 7002,
    filename: 'shop.json',
    routes: [route('r1', 'health'), route('r2', 'users')],
    folders: [{ uuid: 'f1', name: 'Users', children: [{ type: 'route', uuid: 'r2' }] }],
    rootChildren: [{ type: 'route', uuid: 'r1' }, { type: 'folder', uuid: 'f1' }],
    ...overrides,
}) as unknown as Environment;

/** Opens a row's "..." menu and picks an item. */
async function choose(user: ReturnType<typeof userEvent.setup>, menuLabel: string, item: string | RegExp) {
    await user.click(screen.getByRole('button', { name: menuLabel }));
    await user.click(screen.getByRole('menuitem', { name: item }));
}

const otherEnv = {
    uuid: 'env-2', name: 'Billing', port: 7003, filename: 'billing.json', routes: [],
    folders: [{ uuid: 'bf1', name: 'Invoices', children: [] }], rootChildren: [{ type: 'folder', uuid: 'bf1' }],
} as unknown as Environment;

describe('RouteList', () => {
    const props = {
        envFilename: 'shop.json',
        activeRouteId: '',
        onSelectRoute: jest.fn(),
        onHierarchyChange: jest.fn(),
        notify: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('renders folders with their routes nested, and collapses them', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} activeEnv={makeEnv()} />);

        expect(screen.getByText('Users')).toBeInTheDocument();
        expect(screen.getByText('/users')).toBeInTheDocument();
        expect(screen.getByText('/health')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Collapse Users' }));
        expect(screen.queryByText('/users')).not.toBeInTheDocument();
        expect(screen.getByText('/health')).toBeInTheDocument();
    });

    it('shows routes missing from the tree at the root', () => {
        render(<RouteList {...props} activeEnv={makeEnv({ rootChildren: [] })} />);
        expect(screen.getByText('/health')).toBeInTheDocument();
    });

    it('creates a folder without breaking the list', async () => {
        const user = userEvent.setup();
        const folders = [...makeEnv().folders, { uuid: 'f2', name: 'New folder', children: [] }];
        const rootChildren = [...makeEnv().rootChildren, { type: 'folder', uuid: 'f2' }];
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, folder: folders[1], folders, rootChildren }),
        });

        const { rerender } = render(<RouteList {...props} activeEnv={makeEnv()} />);
        await user.click(screen.getByTitle('Add new'));
        await user.click(screen.getByRole('menuitem', { name: /Folder/ }));

        await waitFor(() => expect(props.onHierarchyChange).toHaveBeenCalledWith({ folders, rootChildren }));
        const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
        expect(body).toMatchObject({ filename: 'shop.json', action: 'create', parentFolderUuid: null });

        rerender(<RouteList {...props} activeEnv={makeEnv({ folders, rootChildren } as Partial<Environment>)} />);
        // Opens straight into renaming the new folder
        expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('New folder');
        expect(screen.getByText('/health')).toBeInTheDocument();
    });

    it('filters into folders', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} activeEnv={makeEnv()} />);
        await user.type(screen.getByPlaceholderText('Filter routes'), 'users');
        expect(screen.getByText('/users')).toBeInTheDocument();
        expect(screen.queryByText('/health')).not.toBeInTheDocument();
    });

    it('Escape cancels a rename without saving', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Rename');
        const input = screen.getByRole('textbox', { name: 'Folder name' });
        await user.clear(input);
        await user.type(input, 'Customers{Escape}');

        expect(screen.queryByRole('textbox', { name: 'Folder name' })).not.toBeInTheDocument();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Enter saves a rename', async () => {
        const user = userEvent.setup();
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, folders: [], rootChildren: [] }),
        });
        render(<RouteList {...props} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Rename');
        const input = screen.getByRole('textbox', { name: 'Folder name' });
        await user.clear(input);
        await user.type(input, 'Customers{Enter}');

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
            action: 'update', folderUuid: 'f1', folder: { name: 'Customers' },
        });
    });

    it('creates a route inside a folder and passes only the tree up', async () => {
        const user = userEvent.setup();
        const onRouteCreated = jest.fn();
        const newRoute = route('r3', 'new-route');
        const folders = [{ uuid: 'f1', name: 'Users', children: [{ type: 'route', uuid: 'r2' }, { type: 'route', uuid: 'r3' }] }];
        const rootChildren = makeEnv().rootChildren;
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, route: newRoute, folders, rootChildren }),
        });
        render(<RouteList {...props} onRouteCreated={onRouteCreated} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Add to folder…');
        await user.click(screen.getByRole('menuitem', { name: /HTTP route/ }));

        await waitFor(() => expect(onRouteCreated).toHaveBeenCalledWith(newRoute, { folders, rootChildren }));
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
            action: 'create', routeType: 'http', parentFolderUuid: 'f1',
        });
        expect(props.onSelectRoute).toHaveBeenCalledWith('r3');
    });

    it('moves a route into a folder from the menu', async () => {
        const user = userEvent.setup();
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, folders: [], rootChildren: [] }),
        });
        render(<RouteList {...props} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for GET /health', 'Move to folder…');
        await user.click(screen.getByRole('menuitem', { name: /Users/ }));

        await waitFor(() => expect(props.onHierarchyChange).toHaveBeenCalled());
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
            action: 'move', itemType: 'route', itemUuid: 'r1', targetFolderUuid: 'f1',
        });
    });

    it('offers only the actions that apply in the route menu', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} activeEnv={makeEnv({ folders: [], rootChildren: [] })} />);
        await user.click(screen.getByRole('button', { name: 'Actions for GET /health' }));

        // No folders and no other environment: nothing to move or copy to
        const items = screen.getAllByRole('menuitem').map(i => i.textContent);
        expect(items).toEqual(['Duplicate', 'Export to file', 'Delete route']);
    });

    it('deletes a route from its menu after confirming', async () => {
        const user = userEvent.setup();
        const onRouteDeleted = jest.fn();
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
        render(<RouteList {...props} onRouteDeleted={onRouteDeleted} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for GET /health', 'Delete route');
        expect(global.fetch).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Delete route' }));
        await waitFor(() => expect(onRouteDeleted).toHaveBeenCalledWith('r1'));
        expect(props.onSelectRoute).not.toHaveBeenCalled();
    });

    it('copies a folder to another environment and reports warnings', async () => {
        const user = userEvent.setup();
        const onTransferred = jest.fn();
        const result = {
            success: true, mode: 'copy', itemUuid: 'new', routeCount: 1, folderCount: 1, bucketCount: 0, callbackCount: 0,
            warnings: ['GET /users already exists in "Billing"; the route listed first answers.'],
            source: makeEnv(), target: otherEnv,
        };
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => result });
        render(<RouteList {...props} environments={[makeEnv(), otherEnv]} onTransferred={onTransferred} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Copy to environment…');
        const dialog = screen.getByRole('dialog', { name: 'Copy folder to another environment' });
        expect(screen.getByRole('radio', { name: 'Copy' })).toHaveAttribute('aria-checked', 'true');
        // Only the other environment is offered, and its folders
        expect(Array.from((screen.getByLabelText('Environment') as HTMLSelectElement).options).map(o => o.text)).toEqual(['Billing (:7003)']);
        await user.selectOptions(screen.getByLabelText('Folder'), 'bf1');
        await user.click(screen.getByRole('button', { name: 'Copy now' }));

        await waitFor(() => expect(onTransferred).toHaveBeenCalledWith(result));
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
            sourceFilename: 'shop.json', targetFilename: 'billing.json', itemType: 'folder', itemUuid: 'f1', mode: 'copy', targetFolderUuid: 'bf1',
        });
        expect(dialog).not.toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Copy finished' })).toHaveTextContent('already exists in "Billing"');
    });

    it('moves a route to another environment', async () => {
        const user = userEvent.setup();
        const onTransferred = jest.fn();
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, mode: 'move', routeCount: 1, folderCount: 0, warnings: [], source: makeEnv(), target: otherEnv }),
        });
        render(<RouteList {...props} environments={[makeEnv(), otherEnv]} onTransferred={onTransferred} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for GET /health', 'Move to environment…');
        expect(screen.getByRole('radio', { name: 'Move' })).toHaveAttribute('aria-checked', 'true');
        await user.click(screen.getByRole('button', { name: 'Move now' }));

        await waitFor(() => expect(onTransferred).toHaveBeenCalled());
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({ itemType: 'route', itemUuid: 'r1', mode: 'move', targetFolderUuid: null });
        expect(props.notify).toHaveBeenCalledWith('Moved 1 route to Billing.', 'success');
    });

    it('exports a route under the name the server gives', async () => {
        const user = userEvent.setup();
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        URL.createObjectURL = jest.fn(() => 'blob:x');
        URL.revokeObjectURL = jest.fn();
        let downloaded = '';
        click.mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            blob: async () => new Blob(['{}']),
            headers: new Headers({ 'content-disposition': 'attachment; filename="shop-get-health.json"' }),
        });
        render(<RouteList {...props} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for GET /health', 'Export to file');
        await waitFor(() => expect(downloaded).toBe('shop-get-health.json'));
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/environments/items/export?filename=shop.json&itemType=route&itemUuid=r1');
        click.mockRestore();
    });

    it('imports a file into a folder from its menu', async () => {
        const user = userEvent.setup();
        const onEnvironmentSaved = jest.fn();
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, routeCount: 2, folderCount: 0, warnings: [], target: makeEnv() }),
        });
        const { container } = render(<RouteList {...props} onEnvironmentSaved={onEnvironmentSaved} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Add to folder…');
        await user.click(screen.getByRole('menuitem', { name: /Import from file/ }));
        const input = container.querySelector('input[type=file]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [new File(['{}'], 'shop-get-users.json', { type: 'application/json' })] } });

        await waitFor(() => expect(onEnvironmentSaved).toHaveBeenCalled());
        const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
        expect(url).toBe('/api/environments/items/import');
        expect((init.body as FormData).get('filename')).toBe('shop.json');
        expect((init.body as FormData).get('targetFolderUuid')).toBe('f1');
        expect(props.notify).toHaveBeenCalledWith('Imported 2 routes from shop-get-users.json.', 'success');
    });

    it('shows the server error when an import is refused', async () => {
        const { container } = render(<RouteList {...props} activeEnv={makeEnv()} />);
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'The file is not valid JSON' }) });
        fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File(['x'], 'bad.json')] } });
        await waitFor(() => expect(props.notify).toHaveBeenCalledWith('The file is not valid JSON', 'error'));
    });

    it('duplicates a route and opens the copy', async () => {
        const user = userEvent.setup();
        const onEnvironmentSaved = jest.fn();
        const saved = makeEnv({ routes: [route('r1', 'health'), route('r2', 'users'), route('r9', 'health-copy-1')] } as Partial<Environment>);
        (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true, itemUuid: 'r9', target: saved }) });
        render(<RouteList {...props} onEnvironmentSaved={onEnvironmentSaved} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for GET /health', 'Duplicate');
        await waitFor(() => expect(onEnvironmentSaved).toHaveBeenCalledWith(saved));
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ filename: 'shop.json', itemType: 'route', itemUuid: 'r1' });
        expect(props.onSelectRoute).toHaveBeenCalledWith('r9');
        expect(props.notify).toHaveBeenCalledWith('Duplicated as GET /health-copy-1', 'success');
    });

    it('says a deleted route goes to the recycle bin', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} activeEnv={makeEnv()} />);
        await choose(user, 'Actions for GET /health', 'Delete route');
        expect(screen.getByRole('alertdialog')).toHaveTextContent('It goes to the Recycle bin, where it can be restored.');
    });

    it('lays the copy/move dialog out as action, from, to', async () => {
        const user = userEvent.setup();
        render(<RouteList {...props} environments={[makeEnv(), otherEnv]} activeEnv={makeEnv()} />);
        await choose(user, 'Actions for GET /users', 'Move to environment…');

        const dialog = screen.getByRole('dialog');
        const action = screen.getByRole('radiogroup', { name: 'Action' });
        const from = screen.getByRole('region', { name: 'From' });
        const to = screen.getByRole('region', { name: 'To' });
        // Top to bottom: action, then what goes, then where
        const order = [action, from, to].map(el => Array.from(dialog.querySelectorAll('*')).indexOf(el));
        expect(order).toEqual([...order].sort((a, b) => a - b));

        // "From" is read-only: the item and where it is now, no inputs
        expect(from).toHaveTextContent('GET /users');
        expect(from).toHaveTextContent('Shop:7002›Users');
        expect(from.querySelector('select, input')).toBeNull();
        // "To" holds the only inputs, so the destination appears once
        expect(to.querySelectorAll('select')).toHaveLength(2);
        expect(screen.getAllByText('Billing (:7003)')).toHaveLength(1);

        // The action explains itself and the button says what will happen
        expect(dialog).toHaveTextContent('It is added to the target and removed from "Shop".');
        expect(screen.getByRole('button', { name: 'Move now' })).toBeEnabled();
        await user.click(screen.getByRole('radio', { name: 'Copy' }));
        expect(dialog).toHaveTextContent('A copy is added to the target. "Shop" keeps the original.');
        expect(screen.getByRole('button', { name: 'Copy now' })).toBeInTheDocument();
    });
});
