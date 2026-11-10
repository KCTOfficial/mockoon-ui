import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '@/components/Sidebar';
import { Environment } from '@/types/mockoon';

const makeEnv = (uuid: string, name: string, port: number) =>
    ({ uuid, name, port, routes: [], data: [], filename: `${uuid}.json` }) as unknown as Environment;

const mockEnvironments = [makeEnv('env-1', 'Alpha API', 3000), makeEnv('env-2', 'Beta API', 3001)];

describe('Sidebar Component', () => {
    const mockProps = {
        environments: mockEnvironments,
        activeEnvId: '',
        onSelectEnv: jest.fn(),
        onAddEnv: jest.fn(),
        onImportEnv: jest.fn(),
        onImportOpenAPI: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    it('renders environments with name, initials and port when expanded', () => {
        render(<Sidebar {...mockProps} />);

        expect(screen.getByText('Alpha API')).toBeInTheDocument();
        expect(screen.getByText('AL')).toBeInTheDocument();
        expect(screen.getByText(':3001')).toBeInTheDocument();
    });

    it('calls onSelectEnv when clicking an environment', async () => {
        const user = userEvent.setup();
        render(<Sidebar {...mockProps} />);

        await user.click(screen.getByText('Beta API'));

        expect(mockProps.onSelectEnv).toHaveBeenCalledWith('env-2');
    });

    it('marks the active environment', () => {
        render(<Sidebar {...mockProps} activeEnvId="env-1" />);

        expect(screen.getByText('Alpha API').closest('button')).toHaveAttribute('aria-current', 'page');
        expect(screen.getByText('Beta API').closest('button')).not.toHaveAttribute('aria-current');
    });

    it('calls onAddEnv when clicking the create button', async () => {
        const user = userEvent.setup();
        render(<Sidebar {...mockProps} environments={[]} />);

        await user.click(screen.getByRole('button', { name: 'Create new environment' }));

        expect(mockProps.onAddEnv).toHaveBeenCalled();
    });

    it('collapses to initials only, shows a tooltip on hover and remembers the state', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<Sidebar {...mockProps} />);

        await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

        expect(screen.queryByText('Alpha API')).not.toBeInTheDocument();
        expect(screen.getByText('AL')).toBeInTheDocument();
        expect(localStorage.getItem('sidebarCollapsed')).toBe('true');

        await user.hover(screen.getByRole('button', { name: 'Alpha API' }));
        expect(screen.getByRole('tooltip')).toHaveTextContent('Alpha API');

        unmount();
        render(<Sidebar {...mockProps} />);
        expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });

    it('asks to delete an environment without selecting it', async () => {
        const user = userEvent.setup();
        const onDeleteEnv = jest.fn();
        render(<Sidebar {...mockProps} onDeleteEnv={onDeleteEnv} />);

        await user.click(screen.getByRole('button', { name: 'Actions for Beta API' }));
        expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Delete environment…']);
        await user.click(screen.getByRole('menuitem', { name: 'Delete environment…' }));

        expect(onDeleteEnv).toHaveBeenCalledWith('env-2');
        expect(mockProps.onSelectEnv).not.toHaveBeenCalled();
    });

    it('passes the selected file to onImportEnv', async () => {
        const user = userEvent.setup();
        const { container } = render(<Sidebar {...mockProps} />);
        const file = new File(['{}'], 'env.json', { type: 'application/json' });

        await user.upload(container.querySelector('input[accept=".json"]') as HTMLInputElement, file);

        expect(mockProps.onImportEnv).toHaveBeenCalledWith(file);
    });

    it('shows whether each mock server is running', () => {
        render(<Sidebar {...mockProps} envStatuses={{ 'env-1': 'online', 'env-2': 'stopped' }} />);

        expect(screen.getByTitle('Running')).toBeInTheDocument();
        expect(screen.getByTitle('Stopped')).toBeInTheDocument();
    });

    it('resizes within the min and max width and remembers it', async () => {
        const user = userEvent.setup();
        const { unmount } = render(<Sidebar {...mockProps} />);
        const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
        expect(handle).toHaveAttribute('aria-valuenow', '256');

        handle.focus();
        await user.keyboard('{ArrowRight}');
        expect(handle).toHaveAttribute('aria-valuenow', '272');

        await user.keyboard('{End}{ArrowRight}');
        expect(handle).toHaveAttribute('aria-valuenow', '480');

        await user.keyboard('{Home}{ArrowLeft}');
        expect(handle).toHaveAttribute('aria-valuenow', '200');

        unmount();
        render(<Sidebar {...mockProps} />);
        expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute('aria-valuenow', '200');
    });

    it('shows the recycle bin button with its count', async () => {
        const user = userEvent.setup();
        const onOpenTrash = jest.fn();
        render(<Sidebar {...mockProps} onOpenTrash={onOpenTrash} trashCount={3} />);

        const button = screen.getByRole('button', { name: 'Recycle bin, 3 items' });
        expect(button).toHaveTextContent('3');
        await user.click(button);
        expect(onOpenTrash).toHaveBeenCalled();
    });

    it('hides the recycle bin button without a handler', () => {
        render(<Sidebar {...mockProps} />);
        expect(screen.queryByRole('button', { name: /Recycle bin/ })).not.toBeInTheDocument();
    });

    it('lists export and delete, with icons, in the environment menu', async () => {
        const user = userEvent.setup();
        const onExportEnv = jest.fn();
        render(<Sidebar {...mockProps} onExportEnv={onExportEnv} onDeleteEnv={jest.fn()} />);

        await user.click(screen.getByRole('button', { name: 'Actions for Alpha API' }));
        const items = screen.getAllByRole('menuitem');
        expect(items.map(i => i.textContent)).toEqual(['Export environment', 'Delete environment…']);
        items.forEach(item => expect(item.querySelector('svg')).not.toBeNull());
        expect(within(screen.getByRole('menu')).getByRole('separator')).toBeInTheDocument();

        await user.click(items[0]);
        expect(onExportEnv).toHaveBeenCalledWith('env-1');
        expect(mockProps.onSelectEnv).not.toHaveBeenCalled();
    });
});
