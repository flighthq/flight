import { vi } from 'vitest';

import { explainImageDecodeFailure } from './explainImageDecodeFailure';
import { clearImageDecoders, registerImageDecoder } from './imageDecoderRegistry';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(() => {
  clearImageDecoders();
});

describe('explainImageDecodeFailure', () => {
  it('distinguishes an undetected MIME type from a missing decoder', () => {
    expect(explainImageDecodeFailure(new Uint8Array([0, 1, 2, 3]))).toEqual({
      mimeType: null,
      reason: 'mime-type-undetected',
    });
    expect(explainImageDecodeFailure(pngBytes)).toEqual({
      mimeType: 'image/png',
      reason: 'decoder-not-registered',
    });
  });

  it('reports the explicit MIME type when its decoder is missing', () => {
    expect(explainImageDecodeFailure(pngBytes, 'image/custom')).toEqual({
      mimeType: 'image/custom',
      reason: 'decoder-not-registered',
    });
  });

  it('returns null without invoking a registered decoder', () => {
    const decoder = vi.fn();
    registerImageDecoder('image/png', decoder);
    expect(explainImageDecodeFailure(pngBytes)).toBeNull();
    expect(decoder).not.toHaveBeenCalled();
  });
});
