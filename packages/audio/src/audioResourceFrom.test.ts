import { setNetBackend } from '@flighthq/net/contract';

import { resetAudioBackendForTest, setAudioBackend } from './audioBackend';
import {
  createAudioResourceFromSamples,
  loadAudioResourceFromBase64,
  loadAudioResourceFromBlob,
  loadAudioResourceFromBytes,
  loadAudioResourceFromUrl,
  loadAudioResourceFromUrls,
  selectAudioResourceUrl,
} from './audioResourceFrom';

const decodedBuffer = { duration: 1 } as AudioBuffer;

const mockContext = {
  decodeAudioData: vi.fn().mockResolvedValue(decodedBuffer),
} as unknown as AudioContext;

// A context whose decode is held open, so a test can land an abort while the decode is still in
// flight — the window the pre-abort fast path cannot see. `finishDecode` then completes it, modelling
// the real decodeAudioData, which has no cancellation and so always runs to completion.
function createPendingDecodeContext(): { context: AudioContext; finishDecode: () => void } {
  let release: (buffer: AudioBuffer) => void = () => {};
  const context = {
    decodeAudioData: vi.fn(() => new Promise<AudioBuffer>((resolve) => (release = resolve))),
  } as unknown as AudioContext;
  return { context, finishDecode: () => release(decodedBuffer) };
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
  setNetBackend(null);
  resetAudioBackendForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  (mockContext.decodeAudioData as ReturnType<typeof vi.fn>).mockClear();
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
    const resource = await loadAudioResourceFromBase64(mockContext, btoa('abc'), 'audio/mpeg');
    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockContext.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { context, finishDecode } = createPendingDecodeContext();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBase64(context, btoa('abc'), 'audio/mpeg', controller.signal);
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromBlob', () => {
  it('decodes a blob into a resource', async () => {
    // jsdom's Blob does not implement arrayBuffer(); a minimal double supplies what the loader reads.
    const blob = {
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
      type: 'audio/wav',
    } as unknown as Blob;
    const resource = await loadAudioResourceFromBlob(mockContext, blob);
    expect(resource.buffer).toBe(decodedBuffer);
    expect(mockContext.decodeAudioData).toHaveBeenCalledOnce();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { context, finishDecode } = createPendingDecodeContext();
    const blob = {
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
      type: 'audio/wav',
    } as unknown as Blob;
    const controller = new AbortController();
    const promise = loadAudioResourceFromBlob(context, blob, controller.signal);
    await Promise.resolve();
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromBytes', () => {
  it('decodes bytes into a resource', async () => {
    const resource = await loadAudioResourceFromBytes(mockContext, new Uint8Array([1, 2, 3, 4]));
    expect(resource.buffer).toBe(decodedBuffer);
  });

  it('does not detach the caller’s Uint8Array', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await loadAudioResourceFromBytes(mockContext, bytes);
    expect(bytes.byteLength).toBe(4);
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      loadAudioResourceFromBytes(mockContext, new Uint8Array([1, 2, 3, 4]), undefined, controller.signal),
    ).rejects.toThrow('cancelled');
  });

  // Every loader in this family funnels through here, and each is covered separately, because the
  // guarantee is per entry point: a barrier that only holds for direct callers still lets the wrappers
  // resolve past an abort.
  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { context, finishDecode } = createPendingDecodeContext();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBytes(context, new Uint8Array([1, 2, 3, 4]), undefined, controller.signal);
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });

  it('does not resolve with a decoded buffer after an abort', async () => {
    const { context, finishDecode } = createPendingDecodeContext();
    const controller = new AbortController();
    const promise = loadAudioResourceFromBytes(context, new Uint8Array([1, 2, 3, 4]), undefined, controller.signal);
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
  it('routes URL loading through the installed NetBackend', async () => {
    const sendNetRequest = vi.fn().mockResolvedValue({
      body: new ArrayBuffer(8),
      headers: { 'content-type': 'audio/mpeg' },
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'sound.mp3',
    });
    setNetBackend({ sendNetRequest });

    const resource = await loadAudioResourceFromUrl(mockContext, 'sound.mp3');

    expect(resource.buffer).toBe(decodedBuffer);
    expect(sendNetRequest).toHaveBeenCalledWith(
      { method: 'GET', responseType: 'arraybuffer', url: 'sound.mp3' },
      undefined,
    );
  });

  it('fetches, decodes, and returns a resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      }),
    );
    const resource = await loadAudioResourceFromUrl(mockContext, 'sound.mp3');
    expect(resource.buffer).toBe(decodedBuffer);
  });

  // fetch resolves for 404/500, so without a status check the error page reaches the decoder and the
  // caller is told the codec failed. The assertion pins the status, not merely that it rejected.
  it('rejects with the HTTP status rather than decoding an error response', async () => {
    const decodeAudioData = vi.fn().mockResolvedValue(decodedBuffer);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode('<html>404</html>').buffer),
        headers: new Headers({ 'content-type': 'text/html' }),
      }),
    );
    await expect(
      loadAudioResourceFromUrl({ decodeAudioData } as unknown as AudioContext, 'missing.mp3'),
    ).rejects.toThrow('Failed to load audio: missing.mp3 (404 Not Found)');
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  it('rejects when the signal aborts while the decode is in flight', async () => {
    const { context, finishDecode } = createPendingDecodeContext();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      }),
    );
    const controller = new AbortController();
    const promise = loadAudioResourceFromUrl(context, 'sound.mp3', controller.signal);
    await Promise.resolve();
    controller.abort(new Error('cancelled'));
    finishDecode();
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadAudioResourceFromUrls', () => {
  it('resolves with a null-buffer resource when sources is empty', async () => {
    const resource = await loadAudioResourceFromUrls(mockContext, []);
    expect(resource.buffer).toBeNull();
  });

  it('loads the first playable source', async () => {
    setAudioBackend({ canPlayType: (type: string) => type === 'audio/ogg' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: new Headers(),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resource = await loadAudioResourceFromUrls(mockContext, [{ url: 'sound.mp3' }, { url: 'sound.ogg' }]);

    expect(resource.buffer).toBe(decodedBuffer);
    expect(fetchMock).toHaveBeenCalledWith('sound.ogg', expect.anything());
  });
});

describe('selectAudioResourceUrl', () => {
  beforeEach(() => {
    setAudioBackend({ canPlayType: (type: string) => type === 'audio/ogg' });
  });

  it('returns the first source whose inferred type is playable', () => {
    expect(selectAudioResourceUrl([{ url: 'a.mp3' }, { url: 'b.ogg' }])).toBe('b.ogg');
  });

  it('honours an explicit type over the URL extension', () => {
    expect(selectAudioResourceUrl([{ type: 'audio/ogg', url: 'stream' }])).toBe('stream');
  });

  it('returns null when no source is playable', () => {
    expect(selectAudioResourceUrl([{ url: 'a.mp3' }, { url: 'b.wav' }])).toBeNull();
  });
});
