import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '@/components/Sidebar';

// Mock data
const mockEnvironments = [
    {
        uuid: 'env-1',
        name: 'Test Environment 1',
        port: 3000,
        routes: [{ uuid: 'route-1' }, { uuid: 'route-2' }],
        folders: [],
        rootChildren: [],
        data: [],
        callbacks: [],
        filename: 'test-env-1.json',
        lastMigration: 33,
        endpointPrefix: '',
        latency: 0,
        hostname: '',
        environments: [],
        proxies: [],
    },
    {
        uuid: 'env-2',
        name: 'Test Environment 2',
        port: 3001,
        routes: [],
        folders: [],
        rootChildren: [],
        data: [],
        callbacks: [],
        filename: 'test-env-2.json',
        lastMigration: 33,
        endpointPrefix: '',
        latency: 0,
        hostname: '',
        environments: [],
        proxies: [],
    },
];

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
    });

    it('should render environment icons', () => {
        render(<Sidebar {...mockProps} />);

        // Check for environment initials
        expect(screen.getByText('TE')).toBeInTheDocument(); // Test Environment -> TE
    });

    it('should call onSelectEnv when clicking an environment', async () => {
        const user = userEvent.setup();
        render(<Sidebar {...mockProps} />);

        const envButton = screen.getByText('TE').closest('div');
        if (envButton) {
            await user.click(envButton);
        }

        expect(mockProps.onSelectEnv).toHaveBeenCalledWith('env-1');
    });

    it('should highlight active environment', () => {
        render(<Sidebar {...mockProps} activeEnvId="env-1" />);

        const envButton = screen.getByText('TE').closest('div');
        expect(envButton).toHaveClass('bg-blue-600');
    });

    it('should call onAddEnv when clicking add button', async () => {
        const user = userEvent.setup();
        render(<Sidebar {...mockProps} />);

        // Find the add button (+ icon)
        const addButton = screen.getByTitle('Add Environment');
        await user.click(addButton);

        expect(mockProps.onAddEnv).toHaveBeenCalled();
    });

    it('should render empty state when no environments', () => {
        render(<Sidebar {...mockProps} environments={[]} />);

        // Should still render the add button
        expect(screen.getByTitle('Add Environment')).toBeInTheDocument();
    });

    it('should display environment name tooltip on hover', async () => {
        const user = userEvent.setup();
        render(<Sidebar {...mockProps} />);

        const envButton = screen.getByText('TE').closest('div');
        if (envButton) {
            await user.hover(envButton);
            // Tooltip should appear
            expect(screen.getByText('Test Environment 1')).toBeInTheDocument();
        }
    });
});