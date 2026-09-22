import type { HostImageEncodeCapabilities, HostImageEncodeFormatCapability } from '@flighthq/types/contract';

import { explainImageEncodeFailure } from './explainImageEncodeFailure';

const STUB_SLOT: HostImageEncodeFormatCapability = { encode: async () => new Uint8Array(0) };

describe('explainImageEncodeFailure', () => {
  it('reports a missing slot and its requested MIME type', () => {
    expect(explainImageEncodeFailure({}, 'image/custom')).toEqual({
      mimeType: 'image/custom',
      reason: 'encoder-not-registered',
    });
  });

  it('returns null without invoking the slot when it is present', () => {
    const caps: HostImageEncodeCapabilities = { png: STUB_SLOT };
    expect(explainImageEncodeFailure(caps, 'image/png')).toBeNull();
  });
});
