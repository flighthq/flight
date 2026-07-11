import {
  cloneAudioResource,
  createAudioResource,
  disposeAudioResource,
  getAudioResourceByteSize,
  getAudioResourceChannelCount,
  getAudioResourceChannelData,
  getAudioResourceDuration,
  getAudioResourceSampleRate,
  hasAudioResourceBuffer,
  isAudioResourceEmpty,
} from './audioResource';

// jsdom has no AudioBuffer; the media package models it the same way — a plain cast carrying only the
// fields under test (mirrors its createMockAudioBuffer helper).
function createMockAudioBuffer(overrides: Partial<AudioBuffer> = {}): AudioBuffer {
  const length = 100;
  const numberOfChannels = 2;
  const sampleRate = 44100;
  const channels = [new Float32Array(length), new Float32Array(length)];
  return {
    duration: length / sampleRate,
    getChannelData: (channel: number) => channels[channel],
    length,
    numberOfChannels,
    sampleRate,
    ...overrides,
  } as unknown as AudioBuffer;
}

describe('cloneAudioResource', () => {
  it('shares the buffer by reference and gives an independent resource identity', () => {
    const buffer = createMockAudioBuffer();
    const resource = createAudioResource(buffer);

    const copy = cloneAudioResource(resource);

    expect(copy).not.toBe(resource);
    expect(copy.buffer).toBe(buffer);
  });

  it('copies a null buffer', () => {
    expect(cloneAudioResource(createAudioResource()).buffer).toBeNull();
  });
});

describe('createAudioResource', () => {
  it('returns a resource with null buffer when called with no arguments', () => {
    expect(createAudioResource().buffer).toBeNull();
  });

  it('wraps a provided buffer', () => {
    const buffer = createMockAudioBuffer();
    expect(createAudioResource(buffer).buffer).toBe(buffer);
  });
});

describe('disposeAudioResource', () => {
  it('releases the buffer reference', () => {
    const resource = createAudioResource(createMockAudioBuffer());
    disposeAudioResource(resource);
    expect(resource.buffer).toBeNull();
  });
});

describe('getAudioResourceByteSize', () => {
  it('returns 0 when there is no buffer', () => {
    expect(getAudioResourceByteSize(createAudioResource())).toBe(0);
  });

  it('returns channels × length × 4 for Float32 PCM', () => {
    const resource = createAudioResource(createMockAudioBuffer());
    expect(getAudioResourceByteSize(resource)).toBe(2 * 100 * 4);
  });
});

describe('getAudioResourceChannelCount', () => {
  it('returns 0 without a buffer and the channel count with one', () => {
    expect(getAudioResourceChannelCount(createAudioResource())).toBe(0);
    expect(getAudioResourceChannelCount(createAudioResource(createMockAudioBuffer()))).toBe(2);
  });
});

describe('getAudioResourceChannelData', () => {
  it('returns the Float32Array for an in-range channel', () => {
    const resource = createAudioResource(createMockAudioBuffer());
    const data = getAudioResourceChannelData(resource, 1);
    expect(data).toBeInstanceOf(Float32Array);
    expect(data?.length).toBe(100);
  });

  it('returns null without a buffer or for an out-of-range channel', () => {
    expect(getAudioResourceChannelData(createAudioResource(), 0)).toBeNull();
    const resource = createAudioResource(createMockAudioBuffer());
    expect(getAudioResourceChannelData(resource, -1)).toBeNull();
    expect(getAudioResourceChannelData(resource, 2)).toBeNull();
  });
});

describe('getAudioResourceDuration', () => {
  it('returns 0 without a buffer and the buffer duration with one', () => {
    expect(getAudioResourceDuration(createAudioResource())).toBe(0);
    expect(getAudioResourceDuration(createAudioResource(createMockAudioBuffer({ duration: 2.5 })))).toBe(2.5);
  });
});

describe('getAudioResourceSampleRate', () => {
  it('returns 0 without a buffer and the sample rate with one', () => {
    expect(getAudioResourceSampleRate(createAudioResource())).toBe(0);
    expect(getAudioResourceSampleRate(createAudioResource(createMockAudioBuffer()))).toBe(44100);
  });
});

describe('hasAudioResourceBuffer', () => {
  it('is false without a buffer and true with one', () => {
    expect(hasAudioResourceBuffer(createAudioResource())).toBe(false);
    expect(hasAudioResourceBuffer(createAudioResource(createMockAudioBuffer()))).toBe(true);
  });
});

describe('isAudioResourceEmpty', () => {
  it('is true without a buffer', () => {
    expect(isAudioResourceEmpty(createAudioResource())).toBe(true);
  });

  it('is true for a zero-length buffer and false once it has samples', () => {
    expect(isAudioResourceEmpty(createAudioResource(createMockAudioBuffer({ length: 0 })))).toBe(true);
    expect(isAudioResourceEmpty(createAudioResource(createMockAudioBuffer()))).toBe(false);
  });
});
