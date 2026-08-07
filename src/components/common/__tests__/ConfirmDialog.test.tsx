import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/utils';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('exposes the title as the accessible dialog name using role="dialog" by default', () => {
    render(
      <ConfirmDialog
        isOpen
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Remove item?"
        message="This can be undone."
      />
    );

    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument();
  });

  it('uses alertdialog semantics for destructive confirmations', () => {
    render(
      <ConfirmDialog
        isOpen
        onConfirm={() => {}}
        onCancel={() => {}}
        title="Delete card permanently?"
        message="This cannot be undone."
        variant="destructive"
      />
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Delete card permanently?' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm and onCancel when the respective buttons are clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        onConfirm={onConfirm}
        onCancel={onCancel}
        title="Remove item?"
        message="This can be undone."
        confirmLabel="Remove"
        cancelLabel="Keep"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        onConfirm={() => {}}
        onCancel={onCancel}
        title="Remove item?"
        message="This can be undone."
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
