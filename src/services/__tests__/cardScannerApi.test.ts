import { describe, expect, it } from 'vitest';
import { checkBackendHealth, scanCardFromBase64, scanCardFromFile } from '../cardScannerApi';

describe('cardScannerApi', () => {
  it('checks scanner health through the same-origin Node API proxy', async () => {
    await expect(checkBackendHealth()).resolves.toBe(true);
  });

  it('identifies an uploaded card through the Node API proxy', async () => {
    const file = new File(['card-image'], 'card.jpg', { type: 'image/jpeg' });

    const result = await scanCardFromFile(file);

    expect(result.success).toBe(true);
    expect(result.card?.id).toBe('base1-4');
  });

  it('keeps base64 camera payloads within the Node JSON proxy limit', async () => {
    const encoded = 'A'.repeat(Math.ceil(((8 * 1024 * 1024 + 1) * 4) / 3));

    const result = await scanCardFromBase64(`data:image/jpeg;base64,${encoded}`);

    expect(result).toEqual({
      success: false,
      error: 'Camera image data too large. Max: 8MB.',
    });
  });
});
