import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/utils';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('exposes an accessible name via aria-labelledby pointing at a visible heading', () => {
    render(
      <Modal isOpen onClose={() => {}} titleId="my-title">
        <h2 id="my-title">Card details</h2>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { name: 'Card details' });
    expect(dialog).toBeInTheDocument();
  });

  it('exposes an accessible name via an explicit ariaLabel when no visible title is provided', () => {
    render(
      <Modal isOpen onClose={() => {}} ariaLabel="Opening Booster Pack">
        <div>Pack contents</div>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Opening Booster Pack' })).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} titleId="t1">
        <h2 id="t1">Title</h2>
      </Modal>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} titleId="t2">
        <h2 id="t2">Title</h2>
      </Modal>
    );

    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render the close button when hideClose is set', () => {
    render(
      <Modal isOpen onClose={() => {}} titleId="t3" hideClose>
        <h2 id="t3">Title</h2>
      </Modal>
    );

    expect(screen.queryByRole('button', { name: 'Close modal' })).not.toBeInTheDocument();
  });

  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} titleId="t4">
        <h2 id="t4">Title</h2>
      </Modal>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses alertdialog semantics for destructive confirmations', () => {
    render(
      <Modal isOpen onClose={() => {}} titleId="t5" role="alertdialog">
        <h2 id="t5">Delete card?</h2>
      </Modal>
    );

    expect(screen.getByRole('alertdialog', { name: 'Delete card?' })).toBeInTheDocument();
  });

  it('renders footer content pinned below the body', () => {
    render(
      <Modal isOpen onClose={() => {}} titleId="t6" footer={<button type="button">Save</button>}>
        <h2 id="t6">Title</h2>
      </Modal>
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
