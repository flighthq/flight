import type { AudioDecoder } from '@flighthq/types/contract';

import { getAudioDecoderMimeTypes, registerAudioDecoder, unregisterAudioDecoder } from './audioDecoderRegistry';
import { createAudioResource } from './audioResource';
import { decodeAudioResourceBytes } from './decodeAudioResourceBytes';

afterEach(() => {
  for (const mimeType of [...getAudioDecoderMimeTypes()]) unregisterAudioDecoder(mimeType);
});

describe('decodeAudioResourceBytes', () => {
  it('dispatches a parameterized MIME type through the registered decoder', async () => {
    const decodedBuffer = { duration: 2 } as AudioBuffer;
    const decoder = vi.fn<AudioDecoder>(async () => createAudioResource(decodedBuffer));
    registerAudioDecoder('audio/vnd.acme.custom', decoder);
    const bytes = new Uint8Array([1, 2]);
    const signal = new AbortController().signal;

    const resource = await decodeAudioResourceBytes(null, bytes, 'audio/vnd.acme.custom; rate=22050', signal);

    expect(resource?.buffer).toBe(decodedBuffer);
    expect(decoder).toHaveBeenCalledWith(bytes, 'audio/vnd.acme.custom; rate=22050', signal);
  });

  it('returns an expected registered-decoder miss unchanged', async () => {
    registerAudioDecoder('audio/vnd.acme.custom', async () => null);
    expect(
      await decodeAudioResourceBytes(null, new Uint8Array([1]), 'audio/vnd.acme.custom', new AbortController().signal),
    ).toBeNull();
  });

  it('returns null when neither a registered decoder nor platform context is available', async () => {
    expect(
      await decodeAudioResourceBytes(null, new Uint8Array([1]), 'audio/mpeg', new AbortController().signal),
    ).toBeNull();
  });
});
