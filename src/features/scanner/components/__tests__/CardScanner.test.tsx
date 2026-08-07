import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../../test/utils';
import { server } from '../../../../test/msw/server';
import { CardScanner } from '../CardScanner';

describe('CardScanner availability fallback', () => {
  it('offers catalog search instead of local backend commands when recognition is offline', async () => {
    server.use(
      http.get('/api/grading/health', () =>
        HttpResponse.json({ error: 'Scanner unavailable' }, { status: 503 })
      )
    );

    render(
      <MemoryRouter>
        <CardScanner />
      </MemoryRouter>
    );

    expect(
      await screen.findByRole('heading', { name: /recognition service unavailable/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /search card catalog/i })).toHaveAttribute(
      'href',
      '/browse'
    );
    expect(screen.queryByText(/python app\.py/i)).not.toBeInTheDocument();
  });

  it('stops a camera stream that resolves after navigation', async () => {
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

    const { unmount } = render(
      <MemoryRouter>
        <CardScanner />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: /camera scan/i }));
    unmount();

    await act(async () => {
      resolveStream(stream);
      await pending;
    });

    expect(stop).toHaveBeenCalledOnce();
  });
});
