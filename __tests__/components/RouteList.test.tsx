import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        const dialog = screen.getByRole('dialog', { name: 'Copy folder' });
        expect(screen.getByRole('radio', { name: 'Copy' })).toHaveAttribute('aria-checked', 'true');
        // The other environment first (preselected), then this one for copying between its folders
        expect(Array.from((screen.getByLabelText('Environment') as HTMLSelectElement).options).map(o => o.text))
            .toEqual(['Billing (:7003)', 'Shop (:7002) · this environment']);
        expect(screen.getByLabelText('Environment')).toHaveValue('billing.json');
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

    it('hands a file picked in a folder to the import dialog, with that folder', async () => {
        const user = userEvent.setup();
        const onImportFile = jest.fn();
        const { container } = render(<RouteList {...props} onImportFile={onImportFile} activeEnv={makeEnv()} />);

        await choose(user, 'Actions for folder Users', 'Add to folder…');
        await user.click(screen.getByRole('menuitem', { name: /Import from file/ }));
        const picked = new File(['{}'], 'shop-get-users.json', { type: 'application/json' });
        fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [picked] } });

        expect(onImportFile).toHaveBeenCalledWith(picked, 'f1');
        // Nothing is sent before the dialog asks where it goes
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('imports at the top level from the Add menu, and only offers import when it is handled', async () => {
        const user = userEvent.setup();
        const onImportFile = jest.fn();
        const { container, rerender } = render(<RouteList {...props} activeEnv={makeEnv()} />);
        await user.click(screen.getByRole('button', { name: 'Add new' }));
        expect(screen.queryByRole('menuitem', { name: /Import from file/ })).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        rerender(<RouteList {...props} onImportFile={onImportFile} activeEnv={makeEnv()} />);
        await user.click(screen.getByRole('button', { name: 'Add new' }));
        await user.click(screen.getByRole('menuitem', { name: /Import from file/ }));
        const picked = new File(['{}'], 'x.json');
        fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [picked] } });
        expect(onImportFile).toHaveBeenCalledWith(picked, null);
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

    describe('selection', () => {
        const startSelecting = (user: ReturnType<typeof userEvent.setup>) =>
            user.click(screen.getByRole('button', { name: 'Select routes and folders' }));
        const toolbar = () => screen.getByRole('toolbar', { name: 'Bulk actions' });
        const bulk = (user: ReturnType<typeof userEvent.setup>, item: string | RegExp) => choose(user, 'Actions for the selection', item);

        it('selects routes and folders; what is inside a selected folder goes with it', async () => {
            const user = userEvent.setup();
            render(<RouteList {...props} activeEnv={makeEnv()} />);
            await startSelecting(user);

            expect(toolbar()).toHaveTextContent('0 selected');
            expect(screen.getByRole('button', { name: 'Actions for the selection' })).toBeDisabled();
            // Row menus are off while selecting
            expect(screen.queryByRole('button', { name: 'Actions for GET /health' })).not.toBeInTheDocument();

            await user.click(screen.getByRole('checkbox', { name: 'Select folder Users' }));
            const inner = screen.getByRole('checkbox', { name: 'Select GET /users' });
            expect(inner).toBeChecked();
            expect(inner).toBeDisabled();
            expect(toolbar()).toHaveTextContent('1 selected');

            // Clicking a row selects it instead of opening it
            await user.click(screen.getByText('/health'));
            expect(props.onSelectRoute).not.toHaveBeenCalled();
            expect(screen.getByRole('checkbox', { name: 'Select GET /health' })).toBeChecked();
            expect(toolbar()).toHaveTextContent('2 selected');
            expect(within(toolbar()).getByTitle('1 route and 1 folder selected')).toBeInTheDocument();

            // One dropdown holds the actions
            await user.click(screen.getByRole('button', { name: 'Actions for the selection' }));
            expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Copy to…', 'Move to…', 'Export to file', 'Delete…']);
            await user.keyboard('{Escape}');

            await user.click(within(toolbar()).getByRole('button', { name: 'Cancel selection' }));
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        });

        it('selects everything at the top level, or only matching routes while filtering', async () => {
            const user = userEvent.setup();
            render(<RouteList {...props} activeEnv={makeEnv()} />);
            await startSelecting(user);

            await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
            expect(toolbar()).toHaveTextContent('2 selected');
            expect(within(toolbar()).getByTitle('1 route and 1 folder selected')).toBeInTheDocument();
            await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
            expect(toolbar()).toHaveTextContent('0 selected');

            await user.type(screen.getByPlaceholderText('Filter routes'), 'users');
            await user.click(screen.getByRole('checkbox', { name: 'Select all matching' }));
            expect(toolbar()).toHaveTextContent('1 selected');
            expect(screen.getByRole('checkbox', { name: 'Select GET /users' })).toBeChecked();
        });

        it('drops the selection when another environment opens', async () => {
            const user = userEvent.setup();
            const { rerender } = render(<RouteList {...props} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /health' }));

            rerender(<RouteList {...props} envFilename="billing.json" activeEnv={otherEnv} />);
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
            rerender(<RouteList {...props} activeEnv={makeEnv()} />);
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
        });

        it('moves the selection into a new folder of the same environment', async () => {
            const user = userEvent.setup();
            const onTransferred = jest.fn();
            const result = {
                success: true, mode: 'move', itemUuid: 'r1', itemUuids: ['r1', 'f1'], folderUuid: 'nf', routeCount: 2, folderCount: 1,
                bucketCount: 0, callbackCount: 0, warnings: [], source: makeEnv(), target: makeEnv(),
            };
            (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => result });
            render(<RouteList {...props} environments={[makeEnv(), otherEnv]} onTransferred={onTransferred} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /health' }));
            await user.click(screen.getByRole('checkbox', { name: 'Select folder Users' }));
            await bulk(user, 'Move to…');

            const dialog = screen.getByRole('dialog', { name: 'Move 1 route and 1 folder' });
            const from = within(dialog).getByRole('region', { name: 'From' });
            expect(from).toHaveTextContent('GET /health');
            expect(from).toHaveTextContent('Users1 route');
            await user.selectOptions(screen.getByLabelText('Environment'), 'shop.json');
            expect(dialog).toHaveTextContent('They move to the chosen folder of "Shop".');
            // A folder cannot move into itself, so "Users" is not offered
            expect(Array.from((screen.getByLabelText('Folder') as HTMLSelectElement).options).map(o => o.text)).toEqual(['Top level']);

            await user.click(screen.getByRole('button', { name: /New folder/ }));
            expect(screen.getByRole('button', { name: 'Move now' })).toBeDisabled();
            await user.type(screen.getByLabelText('New folder name'), 'Archive');
            expect(dialog).toHaveTextContent('Created inside the top level.');
            await user.click(screen.getByRole('button', { name: 'Move now' }));

            await waitFor(() => expect(onTransferred).toHaveBeenCalledWith(result));
            expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
                sourceFilename: 'shop.json', targetFilename: 'shop.json',
                items: [{ type: 'route', uuid: 'r1' }, { type: 'folder', uuid: 'f1' }],
                mode: 'move', targetFolderUuid: null, newFolderName: 'Archive',
            });
            expect(props.notify).toHaveBeenCalledWith('Moved 2 routes and 1 folder to Shop.', 'success');
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
        });

        it('copies the selection to a folder of another environment', async () => {
            const user = userEvent.setup();
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, mode: 'copy', routeCount: 2, folderCount: 0, warnings: [], source: makeEnv(), target: otherEnv }),
            });
            render(<RouteList {...props} environments={[makeEnv(), otherEnv]} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /health' }));
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /users' }));
            await bulk(user, 'Copy to…');

            expect(screen.getByRole('dialog', { name: 'Copy 2 routes' })).toBeInTheDocument();
            await user.selectOptions(screen.getByLabelText('Folder'), 'bf1');
            await user.click(screen.getByRole('button', { name: 'Copy now' }));

            await waitFor(() => expect(props.notify).toHaveBeenCalledWith('Copied 2 routes to Billing.', 'success'));
            expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
                targetFilename: 'billing.json', mode: 'copy', targetFolderUuid: 'bf1',
                items: [{ type: 'route', uuid: 'r1' }, { type: 'route', uuid: 'r2' }],
            });
        });

        it('exports the selection as one file', async () => {
            const user = userEvent.setup();
            const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
            URL.createObjectURL = jest.fn(() => 'blob:x');
            URL.revokeObjectURL = jest.fn();
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                blob: async () => new Blob(['{}']),
                headers: new Headers({ 'content-disposition': 'attachment; filename="shop-2-items.json"' }),
            });
            render(<RouteList {...props} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
            await bulk(user, 'Export to file');

            await waitFor(() => expect(click).toHaveBeenCalled());
            expect((global.fetch as jest.Mock).mock.calls[0][0])
                .toBe('/api/environments/items/export?filename=shop.json&item=route%3Ar1&item=folder%3Af1');
            await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
            click.mockRestore();
        });

        it('deletes the selection to the recycle bin after confirming', async () => {
            const user = userEvent.setup();
            const onEnvironmentSaved = jest.fn();
            const onTrashChanged = jest.fn();
            const saved = makeEnv({ routes: [], folders: [], rootChildren: [] } as Partial<Environment>);
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true, routeCount: 2, folderCount: 1, routeUuids: ['r1', 'r2'], target: saved }),
            });
            render(<RouteList {...props} activeRouteId="r2" onEnvironmentSaved={onEnvironmentSaved} onTrashChanged={onTrashChanged} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /health' }));
            await user.click(screen.getByRole('checkbox', { name: 'Select folder Users' }));
            await bulk(user, 'Delete…');

            const confirm = screen.getByRole('alertdialog', { name: 'Delete 1 route and 1 folder' });
            expect(confirm).toHaveTextContent('each folder with everything in it');
            expect(confirm).toHaveTextContent('Recycle bin, where each one can be restored');
            await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

            await waitFor(() => expect(onEnvironmentSaved).toHaveBeenCalledWith(saved));
            const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toBe('/api/environments/items/delete');
            expect(JSON.parse(init.body)).toEqual({ filename: 'shop.json', items: [{ type: 'route', uuid: 'r1' }, { type: 'folder', uuid: 'f1' }] });
            expect(onTrashChanged).toHaveBeenCalled();
            // The open route was inside the deleted folder
            expect(props.onSelectRoute).toHaveBeenCalledWith('');
            expect(props.notify).toHaveBeenCalledWith('Moved 1 route and 1 folder to the recycle bin', 'success');
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
        });

        it('keeps the selection and reports a refused delete', async () => {
            const user = userEvent.setup();
            (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'Route or folder not found' }) });
            render(<RouteList {...props} activeEnv={makeEnv()} />);
            await startSelecting(user);
            await user.click(screen.getByRole('checkbox', { name: 'Select GET /health' }));
            await bulk(user, 'Delete…');
            await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

            await waitFor(() => expect(props.notify).toHaveBeenCalledWith('Route or folder not found', 'error'));
            expect(toolbar()).toHaveTextContent('1 selected');
        });
    });
});
