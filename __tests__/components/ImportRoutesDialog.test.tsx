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

const envs = [
    { uuid: 'e1', name: 'Shop', port: 7002, filename: 'shop.json', routes: [], folders: [], rootChildren: [] },
    { uuid: 'e2', name: 'Billing', port: 7004, filename: 'billing.json', routes: [], folders: [{ uuid: 'bf', name: 'Invoices', children: [] }], rootChildren: [{ type: 'folder', uuid: 'bf' }] },
] as unknown as Environment[];

describe('summarizeRoutesFile', () => {
    it('reads an export', () => {
        expect(summarizeRoutesFile(bundle)).toEqual({ routeCount: 2, folderCount: 1, exportedFrom: 'Demo Auth API', itemLabel: 'Accounts' });
        expect(summarizeRoutesFile({ ...bundle, rootChildren: [{ type: 'route', uuid: 'r1' }], folders: [] })!.itemLabel).toBe('GET /me');
    });

    it.each([null, [], { name: 'Env', routes: [], rootChildren: [] }, { type: 'mockoon-ui/routes' }])('ignores %j', (content) => {
        expect(summarizeRoutesFile(content)).toBeNull();
    });
});

describe('ImportRoutesDialog', () => {
    const file = new File([JSON.stringify(bundle)], 'demo-auth-api-folder-accounts.json');
    const props = { file, summary: summarizeRoutesFile(bundle)!, environments: envs, activeFilename: 'billing.json', onClose: jest.fn(), onImported: jest.fn() };
    const result = { success: true, created: false, routeCount: 2, folderCount: 1, warnings: [], target: envs[1] };

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
        const form = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
        expect(form.get('filename')).toBe('billing.json');
        expect(form.get('targetFolderUuid')).toBe('bf');
        expect(form.get('newEnvironmentName')).toBeNull();
        expect(props.onClose).toHaveBeenCalled();
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
        const form = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
        expect(form.get('newEnvironmentName')).toBe('Accounts API');
        expect(form.get('filename')).toBeNull();
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
});
