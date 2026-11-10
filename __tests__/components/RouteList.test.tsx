import { render, screen, waitFor, within } from '@testing-library/react';
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

        await user.click(screen.getByRole('button', { name: 'Rename Users' }));
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

        await user.click(screen.getByRole('button', { name: 'Rename Users' }));
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

        await user.click(screen.getByRole('button', { name: 'Add to Users' }));
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

        const healthRow = screen.getByText('/health').closest('[draggable]') as HTMLElement;
        await user.click(within(healthRow).getByRole('button', { name: 'Move to folder' }));
        await user.click(screen.getByRole('menuitem', { name: /Users/ }));

        await waitFor(() => expect(props.onHierarchyChange).toHaveBeenCalled());
        expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({
            action: 'move', itemType: 'route', itemUuid: 'r1', targetFolderUuid: 'f1',
        });
    });
});
