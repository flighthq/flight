import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioDecoder,
  HostAudioCodecCapability,
  HostAudioDecodeCapabilities,
  HostAudioDecodeFormatCapability,
  HostNetCapability,
} from '@flighthq/types/contract';

import { createAudioResource } from './audioResource';
import {
  createAudioResourceFromSamples,
  loadAudioResourceFromBase64,
  loadAudioResourceFromBlob,
  loadAudioResourceFromBytes,
  loadAudioResourceFromUrl,
  loadAudioResourceFromUrls,
  selectAudioResourceUrl,
} from './audioResourceFrom';

function fakeAudioCodecHost(canPlay: (type: string) => boolean): {
  readonly media: { readonly audioCodec: HostAudioCodecCapability };
} {
  const out = allocateEntity<any>();
  out.canPlayType = canPlay;
  return {
    media: {
      audioCodec: out,
    },
  } as { readonly media: { readonly audioCodec: HostAudioCodecCapability } };
}

function fakeNetHost(backend?: Pick<HostNetCapability, 'sendNetRequest'>): {
  readonly net: { readonly http: HostNetCapability };
} {
  const out = {} as HostNetCapability;
  Object.assign(
    out,
    backend ?? {
      sendNetRequest: async () => ({ status: 200, statusText: 'OK', ok: true, headers: {}, body: null, url: '' }),
    },
  );
  return {
    net: {
      http: out,
    },
  };
}

function fakeNetAudioHost(
  canPlay: (type: string) => boolean,
  backend?: Pick<HostNetCapability, 'sendNetRequest'>,
): { readonly net: { readonly http: HostNetCapability } } & {
  readonly media: { readonly audioCodec: HostAudioCodecCapability };
} {
  return { ...fakeNetHost(backend), ...fakeAudioCodecHost(canPlay) };
}

const decodedBuffer = { duration: 1 } as AudioBuffer;

const mockDecode = vi.fn(async () => decodedBuffer);
// Every slot answers, the way a browser's own decoders do: Web Audio reads the container rather than the
// MIME type, so a host that has it has it for all seven.
const mockAudioDecode = allAudioDecodeSlots({ decode: mockDecode });

// A host group whose decode is held open, so a test can land an abort while the decode is still in
// flight — the window the pre-abort fast path cannot see. `finishDecode` then completes it, modelling a
// real platform decode, which has no cancellation and so always runs to completion.
function createPendingAudioDecode(): { audioDecode: HostAudioDecodeCapabilities; finishDecode: () => void } {
  let release: (buffer: AudioBuffer) => void = () => {};
  const audioDecode = allAudioDecodeSlots({
    decode: vi.fn(() => new Promise<AudioBuffer>((resolve) => (release = resolve))),
  });
  return { audioDecode, finishDecode: () => release(decodedBuffer) };
}

function allAudioDecodeSlots(slot: HostAudioDecodeFormatCapability): HostAudioDecodeCapabilities {
  return { aac: slot, flac: slot, mp3: slot, mp4: slot, ogg: slot, wav: slot, webm: slot };
}

// Four bytes of OggS, which is what an unlabeled payload needs to reach a slot at all: nothing declares a
// type for these, so the container signature is the only thing that can route them.
function oggBytes(): Uint8Array {
  return new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
}

// jsdom lacks the AudioBuffer constructor; this minimal stand-in honours the { length,
// numberOfChannels, sampleRate } constructor plus copyToChannel/getChannelData used by
// createAudioResourceFromSamples.
class MockAudioBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  private channels: Float32Array[];

  constructor(options: { length: number; numberOfChannels: number; sampleRate: number }) {
    this.length = options.length;
    this.numberOfChannels = options.numberOfChannels;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length));
  }

  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel].set(source.subarray(0, this.length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

beforeEach(() => {
  vi.stubGlobal('AudioBuffer', MockAudioBuffer);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockDecode.mockClear();
});

describe('createAudioResourceFromSamples', () => {
  it('builds a buffer from channel data and copies the samples', () => {
    // Values exactly representable in Float32 so copyToChannel round-trips without precision drift.
    const left = new Float32Array([0, 0.5, 0.25]);
    const right = new Float32Array([0.75, -0.5, 0.25]);
    const resource = createAudioResourceFromSamples([left, right], 48000);

    expect(resource.buffer).not.toBeNull();
    expect(resource.buffer?.numberOfChannels).toBe(2);
    expect(resource.buffer?.length).toBe(3);
    expect(resource.buffer?.sampleRate).toBe(48000);
    expect(Array.from(resource.buffer!.getChannelData(1))).toEqual([0.75, -0.5, 0.25]);
  });

  it('returns a null-buffer resource for empty input', () => {
    expect(createAudioResourceFromSamples([], 48000).buffer).toBeNull();
  });

  it('returns a null-buffer resource for zero-length channels', () => {
    expect(createAudioResourceFromSamples([new Float32Array(0)], 48000).buffer).toBeNull();
  });
});

describe('loadAudioResourceFromBase64', () => {
  it('decodes base64-encoded bytes into a resource', async () => {
    const resource = await loadAudioResourceFromBase64(mockAudioDecode, btoa('abc'), 'audio/mpeg');
    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockDecode).toHaveBeenCalledOnce();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { audioDecode, finishDecode } = createPendingAudioDecode();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBase64(audioDecode, btoa('abc'), 'audio/mpeg', controller.signal);
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromBlob', () => {
  it('decodes a blob into a resource', async () => {
    // jsdom's Blob does not implement arrayBuffer(); a minimal double supplies what the loader reads.
    const blob = {
      arrayBuffer: () => Promise.resolve(oggBytes().buffer),
      type: 'audio/wav',
    } as unknown as Blob;
    const resource = await loadAudioResourceFromBlob(mockAudioDecode, blob);
    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockDecode).toHaveBeenCalledOnce();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { audioDecode, finishDecode } = createPendingAudioDecode();
    const blob = {
      arrayBuffer: () => Promise.resolve(oggBytes().buffer),
      type: 'audio/wav',
    } as unknown as Blob;
    const controller = new AbortController();
    const promise = loadAudioResourceFromBlob(audioDecode, blob, controller.signal);
    await Promise.resolve();
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromBytes', () => {
  it('decodes bytes into a resource', async () => {
    const resource = await loadAudioResourceFromBytes(mockAudioDecode, oggBytes());
    expect(resource.buffer).toBe(decodedBuffer);
  });

  it('does not detach the caller’s Uint8Array', async () => {
    const bytes = oggBytes();
    await loadAudioResourceFromBytes(mockAudioDecode, bytes);
    expect(bytes.byteLength).toBe(4);
  });

  it('prefers a caller-supplied decoder when the MIME type is known', async () => {
    const customBuffer = { duration: 2 } as AudioBuffer;
    const decoder = vi.fn<AudioDecoder>(async () => createAudioResource(customBuffer));
    const bytes = new Uint8Array([4, 3, 2, 1]);
    const signal = new AbortController().signal;

    const resource = await loadAudioResourceFromBytes(
      mockAudioDecode,
      bytes,
      'audio/vnd.acme.custom; rate=22050',
      signal,
      new Map([['audio/vnd.acme.custom', decoder]]),
    );

    expect(resource.buffer).toBe(customBuffer);
    expect(decoder).toHaveBeenCalledWith(bytes, 'audio/vnd.acme.custom; rate=22050', signal);
    expect(mockDecode).not.toHaveBeenCalled();
  });

  it('rejects when a caller-supplied decoder reports an expected miss', async () => {
    const decoder = vi.fn<AudioDecoder>(async () => null);

    await expect(
      loadAudioResourceFromBytes(
        mockAudioDecode,
        new Uint8Array([1]),
        'audio/vnd.acme.custom',
        undefined,
        new Map([['audio/vnd.acme.custom', decoder]]),
      ),
    ).rejects.toThrow('Failed to decode audio: audio/vnd.acme.custom');
    expect(mockDecode).not.toHaveBeenCalled();
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(loadAudioResourceFromBytes(mockAudioDecode, oggBytes(), undefined, controller.signal)).rejects.toThrow(
      'cancelled',
    );
  });

  // Every loader in this family funnels through here, and each is covered separately, because the
  // guarantee is per entry point: a barrier that only holds for direct callers still lets the wrappers
  // resolve past an abort.
  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { audioDecode, finishDecode } = createPendingAudioDecode();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBytes(audioDecode, oggBytes(), undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });

  it('does not resolve with a decoded buffer after an abort', async () => {
    const { audioDecode, finishDecode } = createPendingAudioDecode();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBytes(audioDecode, oggBytes(), undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    finishDecode();
    const settled = await promise.then(
      (resource) => `resolved:${resource.buffer !== null}`,
      () => 'rejected',
    );
    expect(settled).toBe('rejected');
  });
});

describe('loadAudioResourceFromUrl', () => {
  it('routes URL loading through the host NetBackend', async () => {
    const mockSendNetRequest = vi.fn().mockResolvedValue({
      body: new ArrayBuffer(8),
      headers: { 'content-type': 'audio/mpeg' },
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'sound.mp3',
    });
    const host = fakeNetHost({ sendNetRequest: mockSendNetRequest });

    const resource = await loadAudioResourceFromUrl(host.net.http, mockAudioDecode, 'sound.mp3');

    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockSendNetRequest).toHaveBeenCalledWith(
      { method: 'GET', responseType: 'arraybuffer', url: 'sound.mp3' },
      undefined,
    );
  });

  it('decodes a successful arraybuffer response into a resource', async () => {
    const host = fakeNetHost({
      sendNetRequest: async () => ({
        body: new ArrayBuffer(8),
        headers: { 'content-type': 'audio/mpeg' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'sound.mp3',
      }),
    });
    const resource = await loadAudioResourceFromUrl(host.net.http, mockAudioDecode, 'sound.mp3');
    expect(resource.buffer).toBe(decodedBuffer);
  });

  it('rejects with the HTTP status rather than decoding an error response', async () => {
    const decodeAudioData = vi.fn().mockResolvedValue(decodedBuffer);
    const host = fakeNetHost({
      sendNetRequest: async () => ({
        body: null,
        headers: {},
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'missing.mp3',
      }),
    });
    await expect(
      loadAudioResourceFromUrl(host.net.http, allAudioDecodeSlots({ decode: decodeAudioData }), 'missing.mp3'),
    ).rejects.toThrow('Failed to load audio: missing.mp3 (404 Not Found)');
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { audioDecode, finishDecode } = createPendingAudioDecode();
    const host = fakeNetHost({
      sendNetRequest: async () => ({
        body: new ArrayBuffer(8),
        headers: { 'content-type': 'audio/mpeg' },
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'sound.mp3',
      }),
    });
    const controller = new AbortController();
    const promise = loadAudioResourceFromUrl(host.net.http, audioDecode, 'sound.mp3', controller.signal);
    await Promise.resolve();
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromUrls', () => {
  it('resolves with a null-buffer resource when sources is empty', async () => {
    const host = fakeNetAudioHost(() => false);
    const resource = await loadAudioResourceFromUrls(host.net.http, host.media.audioCodec, mockAudioDecode, []);
    expect(resource.buffer).toBeNull();
  });

  it('loads the first playable source', async () => {
    const mockSendNetRequest = vi.fn().mockResolvedValue({
      body: new ArrayBuffer(8),
      headers: { 'content-type': 'audio/ogg' },
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'sound.ogg',
    });
    const host = fakeNetAudioHost((type) => type === 'audio/ogg', { sendNetRequest: mockSendNetRequest });

    const resource = await loadAudioResourceFromUrls(host.net.http, host.media.audioCodec, mockAudioDecode, [
      { url: 'sound.mp3' },
      { url: 'sound.ogg' },
    ]);

    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockSendNetRequest).toHaveBeenCalledWith(
      { method: 'GET', responseType: 'arraybuffer', url: 'sound.ogg' },
      undefined,
    );
  });

  it('loads a caller-supplied format even when the platform cannot play it', async () => {
    const customBuffer = { duration: 2 } as AudioBuffer;
    const decoder = vi.fn<AudioDecoder>(async () => createAudioResource(customBuffer));
    const decoders = new Map([['audio/vnd.acme.custom', decoder]]);
    const host = fakeNetAudioHost(() => false, {
      sendNetRequest: async () => ({
        body: new ArrayBuffer(8),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'sound.custom',
      }),
    });

    const resource = await loadAudioResourceFromUrls(
      host.net.http,
      host.media.audioCodec,
      mockAudioDecode,
      [{ type: 'audio/vnd.acme.custom', url: 'sound.custom' }],
      undefined,
      decoders,
    );

    expect(resource.buffer).toBe(customBuffer);
    expect(decoder).toHaveBeenCalledOnce();
    expect(mockDecode).not.toHaveBeenCalled();
  });
});

describe('selectAudioResourceUrl', () => {
  const host = fakeAudioCodecHost((type) => type === 'audio/ogg');

  it('returns the first source whose inferred type is playable', () => {
    expect(selectAudioResourceUrl(host.media.audioCodec, [{ url: 'a.mp3' }, { url: 'b.ogg' }])).toBe('b.ogg');
  });

  it('honours an explicit type over the URL extension', () => {
    expect(selectAudioResourceUrl(host.media.audioCodec, [{ type: 'audio/ogg', url: 'stream' }])).toBe('stream');
  });

  it('returns null when no source is playable', () => {
    expect(selectAudioResourceUrl(host.media.audioCodec, [{ url: 'a.mp3' }, { url: 'b.wav' }])).toBeNull();
  });

  it('returns a source handled by a caller-supplied decoder the platform cannot play', () => {
    // The decode arm of the dual gate, exercised alone: canPlayType says no to everything here, so the
    // source is accepted only because something can decode it.
    expect(
      selectAudioResourceUrl(
        fakeAudioCodecHost(() => false).media.audioCodec,
        [{ type: 'audio/vnd.acme.custom', url: 'sound.custom' }],
        new Map([['audio/vnd.acme.custom', async () => createAudioResource()]]),
      ),
    ).toBe('sound.custom');
  });

  // The host's decode slots are not a selection arm: a platform-backed host declares all seven whatever
  // its element can play, so letting them vote would leave canPlayType with no veto.
  it('does not accept a source on the strength of a host decode slot alone', () => {
    expect(
      selectAudioResourceUrl(fakeAudioCodecHost(() => false).media.audioCodec, [
        { type: 'audio/ogg', url: 'sound.ogg' },
      ]),
    ).toBeNull();
  });
});
