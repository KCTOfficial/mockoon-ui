import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActionMenu from '@/components/shared/ActionMenu';

describe('ActionMenu', () => {
    const setup = () => {
        const onRowClick = jest.fn();
        const actions = { edit: jest.fn(), copy: jest.fn(), remove: jest.fn() };
        render(
            <div onClick={onRowClick}>
                <ActionMenu
                    label="Actions for GET /users"
                    items={[
                        { key: 'edit', label: 'Edit', onSelect: actions.edit },
                        { key: 'copy', label: 'Copy', onSelect: actions.copy, disabled: true },
                        { key: 'remove', label: 'Delete', onSelect: actions.remove, variant: 'danger', dividerBefore: true },
                    ]}
                />
            </div>
        );
        return { onRowClick, actions, user: userEvent.setup() };
    };

    it('opens a menu without triggering the row and focuses the first item', async () => {
        const { user, onRowClick } = setup();
        const button = screen.getByRole('button', { name: 'Actions for GET /users' });
        expect(button).toHaveAttribute('aria-expanded', 'false');

        await user.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('runs the picked item, closes, and keeps the click from the row', async () => {
        const { user, onRowClick, actions } = setup();
        await user.click(screen.getByRole('button', { name: 'Actions for GET /users' }));
        await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

        expect(actions.remove).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Actions for GET /users' }));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('moves with the arrow keys over enabled items and closes on Escape', async () => {
        const { user, actions } = setup();
        const button = screen.getByRole('button', { name: 'Actions for GET /users' });
        button.focus();
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

        // "Copy" is disabled and skipped
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
        await user.keyboard('{End}');
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(button).toHaveFocus();
        expect(actions.edit).not.toHaveBeenCalled();
    });

    it('closes when clicking outside', async () => {
        const { user, onRowClick } = setup();
        await user.click(screen.getByRole('button', { name: 'Actions for GET /users' }));
        await user.click(document.body.querySelector('.fixed.inset-0') as HTMLElement);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(onRowClick).not.toHaveBeenCalled();
    });

    it('marks danger items and draws the divider', async () => {
        const { user } = setup();
        await user.click(screen.getByRole('button', { name: 'Actions for GET /users' }));
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('ActionList-item--danger');
        expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeDisabled();
        expect(screen.getAllByRole('separator')).toHaveLength(1);
    });
});
