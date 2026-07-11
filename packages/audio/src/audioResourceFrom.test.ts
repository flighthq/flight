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
});

describe('loadAudioResourceFromUrl', () => {
  it('fetches, decodes, and returns a resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
      }),
    );
    const resource = await loadAudioResourceFromUrl(mockContext, 'sound.mp3');
    expect(resource.buffer).toBe(decodedBuffer);
  });
});

describe('loadAudioResourceFromUrls', () => {
  it('resolves with a null-buffer resource when sources is empty', async () => {
    const resource = await loadAudioResourceFromUrls(mockContext, []);
    expect(resource.buffer).toBeNull();
  });

  it('loads the first playable source', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'audio/ogg' ? 'probably' : '',
    );
    const fetchMock = vi.fn().mockResolvedValue({
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
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((type: string) =>
      type === 'audio/ogg' ? 'maybe' : '',
    );
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
