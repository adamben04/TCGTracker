import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../../test/utils';
import { GradingCapture } from '../GradingCapture';

describe('GradingCapture camera lifecycle', () => {
  it('stops a camera stream that resolves after the component unmounts', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    let resolveStream!: (value: MediaStream) => void;
    const pending = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => pending) },
    });

    const { unmount } = render(<GradingCapture onCapture={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /open camera/i }));
    unmount();

    await act(async () => {
      resolveStream(stream);
      await pending;
    });

    expect(stop).toHaveBeenCalledOnce();
  });
});
