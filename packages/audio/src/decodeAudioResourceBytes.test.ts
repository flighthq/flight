import type {
  AudioDecoder,
  HostAudioDecodeCapabilities,
  HostAudioDecodeFormatCapability,
} from '@flighthq/types/contract';

import { createAudioResource } from './audioResource.ts';
import { decodeAudioResourceBytes } from './decodeAudioResourceBytes.ts';

describe('decodeAudioResourceBytes', () => {
  it('dispatches a parameterized MIME type through the decoder the caller supplied', async () => {
    // One entry serves every parameter combination a container emits for that format, which is what lets a
    // SWF sound tagged with its rate and channel count reach the decoder registered for the bare type.
    const decodedBuffer = { duration: 2 } as AudioBuffer;
    const decoder = vi.fn<AudioDecoder>(async () => createAudioResource(decodedBuffer));
    const bytes = new Uint8Array([1, 2]);
    const signal = new AbortController().signal;

    const resource = await decodeAudioResourceBytes(
      {},
      bytes,
      'audio/vnd.acme.custom; rate=22050',
      signal,
      new Map([['audio/vnd.acme.custom', decoder]]),
    );

    expect(resource?.buffer).toBe(decodedBuffer);
    expect(decoder).toHaveBeenCalledWith(bytes, 'audio/vnd.acme.custom; rate=22050', signal);
  });

  it('returns an expected decoder miss unchanged', async () => {
    const decoders = new Map<string, AudioDecoder>([['audio/vnd.acme.custom', async () => null]]);
    expect(
      await decodeAudioResourceBytes({}, new Uint8Array([1]), 'audio/vnd.acme.custom', signal(), decoders),
    ).toBeNull();
  });

  it('returns null when neither a caller decoder nor a host slot covers the type', async () => {
    expect(await decodeAudioResourceBytes({}, new Uint8Array([1]), 'audio/mpeg', signal())).toBeNull();
  });

  it('decodes a standard container through the host slot for it', async () => {
    const buffer = { duration: 1 } as AudioBuffer;
    const mp3 = slot(buffer);
    const resource = await decodeAudioResourceBytes({ mp3 }, new Uint8Array([1]), 'audio/mpeg', signal());
    expect(resource?.buffer).toBe(buffer);
  });

  // A caller's decoder exists precisely because the platform cannot read that format, so handing the bytes
  // to the host first would give them to a codec that will reject them.
  it('prefers the decoder the caller supplied over a host slot claiming the same type', async () => {
    const hostBuffer = { duration: 1 } as AudioBuffer;
    const callerBuffer = { duration: 2 } as AudioBuffer;
    const decoders = new Map<string, AudioDecoder>([['audio/mpeg', async () => createAudioResource(callerBuffer)]]);
    const resource = await decodeAudioResourceBytes(
      { mp3: slot(hostBuffer) },
      new Uint8Array([1]),
      'audio/mpeg',
      signal(),
      decoders,
    );
    expect(resource?.buffer).toBe(callerBuffer);
  });

  // A payload served with no content-type still decoded before this group existed, because the platform
  // reads the container rather than the label. Sniffing is what keeps that working.
  it('sniffs the container when no MIME type is declared', async () => {
    const buffer = { duration: 1 } as AudioBuffer;
    const resource = await decodeAudioResourceBytes({ wav: slot(buffer) }, riffWave(), undefined, signal());
    expect(resource?.buffer).toBe(buffer);
  });

  it('sniffs the container when the declared type names no standard format', async () => {
    const buffer = { duration: 1 } as AudioBuffer;
    const resource = await decodeAudioResourceBytes(
      { wav: slot(buffer) },
      riffWave(),
      'application/octet-stream',
      signal(),
    );
    expect(resource?.buffer).toBe(buffer);
  });

  it('returns null when a host slot reports an expected miss', async () => {
    const mp3: HostAudioDecodeFormatCapability = { decode: async () => null };
    expect(await decodeAudioResourceBytes({ mp3 }, new Uint8Array([1]), 'audio/mpeg', signal())).toBeNull();
  });

  it('refuses before decoding when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const decode = vi.fn(async () => ({ duration: 1 }) as AudioBuffer);
    await expect(
      decodeAudioResourceBytes({ mp3: { decode } }, new Uint8Array([1]), 'audio/mpeg', controller.signal),
    ).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });

  // A host decode is usually uncancellable once begun, so an abort that lands mid-decode has to be caught
  // on the way out rather than being trusted to have stopped anything.
  it('suppresses a result for an abort that lands mid-decode', async () => {
    const controller = new AbortController();
    const capabilities: HostAudioDecodeCapabilities = {
      mp3: {
        decode: async () => {
          controller.abort();
          return { duration: 1 } as AudioBuffer;
        },
      },
    };
    await expect(
      decodeAudioResourceBytes(capabilities, new Uint8Array([1]), 'audio/mpeg', controller.signal),
    ).rejects.toThrow();
  });
});

// The RIFF/WAVE magic detectAudioMimeType reads, which is what makes the sniffing cases real rather than
// an assertion about a fixture the sniffer never looked at.
function riffWave(): Uint8Array {
  return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

function slot(buffer: AudioBuffer): HostAudioDecodeFormatCapability {
  return { decode: async () => buffer };
}
