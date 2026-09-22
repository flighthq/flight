import type { HostImageDecodeCapabilities, HostImageDecodeFormatCapability } from '@flighthq/types/contract';

import { explainImageDecodeFailure } from './explainImageDecodeFailure';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const STUB_SLOT: HostImageDecodeFormatCapability = {
  decode: async () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
};

describe('explainImageDecodeFailure', () => {
  it('distinguishes an undetected MIME type from a missing slot', () => {
    expect(explainImageDecodeFailure({}, new Uint8Array([0, 1, 2, 3]))).toEqual({
      mimeType: null,
      reason: 'mime-type-undetected',
    });
    expect(explainImageDecodeFailure({}, pngBytes)).toEqual({
      mimeType: 'image/png',
      reason: 'decoder-not-registered',
    });
  });

  it('reports the explicit MIME type when its slot is missing', () => {
    expect(explainImageDecodeFailure({}, pngBytes, 'image/custom')).toEqual({
      mimeType: 'image/custom',
      reason: 'decoder-not-registered',
    });
  });

  it('returns null without invoking the slot when it is present', () => {
    const caps: HostImageDecodeCapabilities = { png: STUB_SLOT };
    expect(explainImageDecodeFailure(caps, pngBytes)).toBeNull();
  });
});
