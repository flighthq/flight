import { vi } from 'vitest';

import { explainImageEncodeFailure } from './explainImageEncodeFailure';
import { clearImageEncoders, registerImageEncoder } from './imageEncoderRegistry';

afterEach(() => {
  clearImageEncoders();
});

describe('explainImageEncodeFailure', () => {
  it('reports a missing encoder and its requested MIME type', () => {
    expect(explainImageEncodeFailure('image/custom')).toEqual({
      mimeType: 'image/custom',
      reason: 'encoder-not-registered',
    });
  });

  it('returns null without invoking a registered encoder', () => {
    const encoder = vi.fn();
    registerImageEncoder('image/png', encoder);
    expect(explainImageEncodeFailure('image/png')).toBeNull();
    expect(encoder).not.toHaveBeenCalled();
  });
});
