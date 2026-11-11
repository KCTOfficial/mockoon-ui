import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportRoutesDialog, { summarizeRoutesFile } from '@/components/ImportRoutesDialog';
import { Environment } from '@/types/mockoon';

const bundle = {
    type: 'mockoon-ui/routes',
    version: 1,
    exportedFrom: 'Demo Auth API',
    rootChildren: [{ type: 'folder', uuid: 'f1' }],
    folders: [{ uuid: 'f1', name: 'Accounts', children: [{ type: 'route', uuid: 'r1' }, { type: 'route', uuid: 'r2' }] }],
    routes: [{ uuid: 'r1', type: 'http', method: 'get', endpoint: 'me' }, { uuid: 'r2', type: 'http', method: 'post', endpoint: 'login' }],
};

const environmentFile = {
    uuid: 'x', name: 'Payments API', port: 3001, lastMigration: 33,
    routes: [{ uuid: 'p1', type: 'http', method: 'get', endpoint: 'pay' }],
    folders: [], rootChildren: [{ type: 'route', uuid: 'p1' }],
};

const envs = [
    { uuid: 'e1', name: 'Shop', port: 7002, filename: 'shop.json', routes: [], folders: [], rootChildren: [] },
    { uuid: 'e2', name: 'Billing', port: 7004, filename: 'billing.json', routes: [], folders: [{ uuid: 'bf', name: 'Invoices', children: [] }], rootChildren: [{ type: 'folder', uuid: 'bf' }] },
] as unknown as Environment[];

describe('summarizeRoutesFile', () => {
    it('reads an export', () => {
        expect(summarizeRoutesFile(bundle)).toEqual({ kind: 'bundle', routeCount: 2, folderCount: 1, exportedFrom: 'Demo Auth API', itemLabel: 'Accounts', port: null });
        expect(summarizeRoutesFile({ ...bundle, rootChildren: [{ type: 'route', uuid: 'r1' }], folders: [] })!.itemLabel).toBe('GET /me');
        // Several items: no single label
        expect(summarizeRoutesFile({ ...bundle, rootChildren: [{ type: 'route', uuid: 'r1' }, { type: 'route', uuid: 'r2' }] })!.itemLabel).toBeNull();
    });

    it('reads a whole environment', () => {
        expect(summarizeRoutesFile(environmentFile)).toEqual({ kind: 'environment', routeCount: 1, folderCount: 0, exportedFrom: 'Payments API', itemLabel: null, port: 3001 });
        expect(summarizeRoutesFile({ name: 'Env', routes: [], rootChildren: [] })).toMatchObject({ kind: 'environment', routeCount: 0 });
    });

    it.each([null, [], { name: 'Env', routes: [] }, { type: 'mockoon-ui/routes' }, 'text'])('ignores %j', (content) => {
        expect(summarizeRoutesFile(content)).toBeNull();
    });
});

describe('ImportRoutesDialog', () => {
    const file = new File([JSON.stringify(bundle)], 'demo-auth-api-folder-accounts.json');
    const props = { file, summary: summarizeRoutesFile(bundle)!, environments: envs, activeFilename: 'billing.json', onClose: jest.fn(), onImported: jest.fn() };
    const result = { success: true, created: false, routeCount: 2, folderCount: 1, warnings: [], target: envs[1] };
    const sentForm = () => (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => result });
    });

    it('shows what the file holds and preselects the open environment', () => {
        render(<ImportRoutesDialog {...props} />);
        expect(screen.getByRole('region', { name: 'File' })).toHaveTextContent('Accounts2 routes · 1 folder · from Demo Auth API');
        expect(screen.getByLabelText('Environment')).toHaveValue('billing.json');
        expect(screen.getByRole('radio', { name: /Add to an existing environment/ })).toBeChecked();
    });

    it('adds to an existing environment and folder', async () => {
        const user = userEvent.setup();
        render(<ImportRoutesDialog {...props} />);
        await user.selectOptions(screen.getByLabelText('Folder'), 'bf');
        await user.click(screen.getByRole('button', { name: 'Import' }));

        await waitFor(() => expect(props.onImported).toHaveBeenCalledWith(result));
        expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/environments/items/import');
        expect(sentForm().get('filename')).toBe('billing.json');
        expect(sentForm().get('targetFolderUuid')).toBe('bf');
        expect(sentForm().get('newFolderName')).toBeNull();
        expect(sentForm().get('newEnvironmentName')).toBeNull();
        expect(props.onClose).toHaveBeenCalled();
    });

    it('puts the routes in a new folder inside the chosen one', async () => {
        const user = userEvent.setup();
        render(<ImportRoutesDialog {...props} initialFolderUuid="bf" />);
        expect(screen.getByLabelText('Folder')).toHaveValue('bf');

        await user.click(screen.getByRole('button', { name: /New folder/ }));
        expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
        expect(screen.getByText('Created inside "Invoices".')).toBeInTheDocument();
        await user.type(screen.getByLabelText('New folder name'), ' Auth ');
        await user.click(screen.getByRole('button', { name: 'Import' }));

        await waitFor(() => expect(props.onImported).toHaveBeenCalled());
        expect(sentForm().get('targetFolderUuid')).toBe('bf');
        expect(sentForm().get('newFolderName')).toBe('Auth');
    });

    it('drops the new folder again with its close button', async () => {
        const user = userEvent.setup();
        render(<ImportRoutesDialog {...props} />);
        await user.click(screen.getByRole('button', { name: /New folder/ }));
        await user.click(screen.getByRole('button', { name: "Don't create a folder" }));
        expect(screen.queryByLabelText('New folder name')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Import' }));
        await waitFor(() => expect(props.onImported).toHaveBeenCalled());
        expect(sentForm().get('newFolderName')).toBeNull();
    });

    it('ignores a preset folder the environment does not have', () => {
        render(<ImportRoutesDialog {...props} initialFolderUuid="gone" />);
        expect(screen.getByLabelText('Folder')).toHaveValue('');
    });

    it('creates a new environment with the chosen name', async () => {
        const user = userEvent.setup();
        render(<ImportRoutesDialog {...props} />);
        await user.click(screen.getByRole('radio', { name: /Create a new environment/ }));
        // Only the chosen card is highlighted
        const card = (name: RegExp) => screen.getByRole('radio', { name }).closest('label')!;
        expect(card(/Create a new environment/)).toHaveClass('border-accent-emphasis');
        expect(card(/Add to an existing environment/)).not.toHaveClass('border-accent-emphasis');
        const name = screen.getByLabelText('Environment name');
        expect(name).toHaveValue('Accounts');
        await user.clear(name);
        await user.type(name, 'Accounts API');
        await user.click(screen.getByRole('button', { name: 'Create and import' }));

        await waitFor(() => expect(props.onImported).toHaveBeenCalled());
        expect(sentForm().get('newEnvironmentName')).toBe('Accounts API');
        expect(sentForm().get('filename')).toBeNull();
    });

    it('keeps the dialog open and shows the server error', async () => {
        const user = userEvent.setup();
        (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ error: 'No free port left in the allowed range.' }) });
        render(<ImportRoutesDialog {...props} />);
        await user.click(screen.getByRole('radio', { name: /Create a new environment/ }));
        await user.click(screen.getByRole('button', { name: 'Create and import' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('No free port left');
        expect(props.onClose).not.toHaveBeenCalled();
    });

    it('only offers a new environment when there is none', () => {
        render(<ImportRoutesDialog {...props} environments={[]} />);
        expect(screen.getByRole('radio', { name: /Add to an existing environment/ })).toBeDisabled();
        expect(screen.getByRole('radio', { name: /Create a new environment/ })).toBeChecked();
    });

    describe('a whole environment file', () => {
        const envFile = new File([JSON.stringify(environmentFile)], 'payments-api.json');
        const envProps = { ...props, file: envFile, summary: summarizeRoutesFile(environmentFile)! };
        const created = { ...environmentFile, filename: 'payments-api.json', folders: [] };

        it('imports it as its own environment by default, with its settings and port', async () => {
            const user = userEvent.setup();
            (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: true, environment: created }) });
            render(<ImportRoutesDialog {...envProps} />);

            expect(screen.getByRole('dialog', { name: 'Import environment' })).toBeInTheDocument();
            expect(screen.getByRole('region', { name: 'File' })).toHaveTextContent('Payments APIMockoon environment · 1 route · :3001');
            expect(screen.getByRole('radio', { name: /Import as its own environment/ })).toBeChecked();
            expect(screen.queryByLabelText('Environment')).not.toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Import environment' }));

            await waitFor(() => expect(props.onImported).toHaveBeenCalledWith({
                created: true, routeCount: 1, folderCount: 0, warnings: [], target: created,
            }));
            const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toBe('/api/environments/import');
            expect((init.body as FormData).get('file')).toBeInstanceOf(File);
            expect((init.body as FormData).get('filename')).toBeNull();
        });

        it('adds its routes to another environment, into a new folder', async () => {
            const user = userEvent.setup();
            render(<ImportRoutesDialog {...envProps} />);
            await user.click(screen.getByRole('radio', { name: /Add its routes to an existing environment/ }));
            await user.selectOptions(screen.getByLabelText('Environment'), 'shop.json');
            await user.click(screen.getByRole('button', { name: /New folder/ }));
            await user.type(screen.getByLabelText('New folder name'), 'Payments');
            await user.click(screen.getByRole('button', { name: 'Import' }));

            await waitFor(() => expect(props.onImported).toHaveBeenCalledWith(result));
            expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('/api/environments/items/import');
            expect(sentForm().get('filename')).toBe('shop.json');
            expect(sentForm().get('targetFolderUuid')).toBeNull();
            expect(sentForm().get('newFolderName')).toBe('Payments');
        });

        it('starts on the existing environment when opened from the route list', () => {
            render(<ImportRoutesDialog {...envProps} initialMode="existing" initialFolderUuid="bf" />);
            expect(screen.getByRole('radio', { name: /Add its routes/ })).toBeChecked();
            expect(screen.getByLabelText('Folder')).toHaveValue('bf');
        });

        it('cannot add routes from an environment that has none', () => {
            const empty = { name: 'Empty', port: 3000, routes: [], folders: [], rootChildren: [] };
            render(<ImportRoutesDialog {...envProps} summary={summarizeRoutesFile(empty)!} initialMode="existing" />);
            expect(screen.getByRole('radio', { name: /Add its routes/ })).toBeDisabled();
            expect(screen.getByRole('radio', { name: /Import as its own environment/ })).toBeChecked();
        });
    });
});
