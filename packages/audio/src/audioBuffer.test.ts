import { copyToAudioBufferChannel, createAudioBuffer } from './audioBuffer.ts';

describe('copyToAudioBufferChannel', () => {
  it('copies samples into the channel from offset zero', () => {
    const buffer = createAudioBuffer(3, 2, 48000);
    copyToAudioBufferChannel(buffer, new Float32Array([0.5, -0.25, 1]), 1);
    expect(Array.from(buffer.channels[1])).toEqual([0.5, -0.25, 1]);
    expect(Array.from(buffer.channels[0])).toEqual([0, 0, 0]);
  });

  it('stops at the buffer length when the source is longer', () => {
    const buffer = createAudioBuffer(2, 1, 48000);
    copyToAudioBufferChannel(buffer, new Float32Array([0.5, 0.25, 1]), 0);
    expect(Array.from(buffer.channels[0])).toEqual([0.5, 0.25]);
  });

  it('leaves trailing samples unchanged when the source is shorter', () => {
    const buffer = createAudioBuffer(3, 1, 48000);
    buffer.channels[0].fill(1);
    copyToAudioBufferChannel(buffer, new Float32Array([0.5]), 0);
    expect(Array.from(buffer.channels[0])).toEqual([0.5, 1, 1]);
  });

  it('writes into the existing channel array rather than replacing it', () => {
    const buffer = createAudioBuffer(2, 1, 48000);
    const channel = buffer.channels[0];
    copyToAudioBufferChannel(buffer, new Float32Array([0.5, 0.25]), 0);
    expect(buffer.channels[0]).toBe(channel);
  });
});

describe('createAudioBuffer', () => {
  it('allocates zero-filled planar channels of the requested length', () => {
    const buffer = createAudioBuffer(4, 2, 44100);
    expect(buffer.length).toBe(4);
    expect(buffer.sampleRate).toBe(44100);
    expect(buffer.channels).toHaveLength(2);
    expect(Array.from(buffer.channels[0])).toEqual([0, 0, 0, 0]);
    expect(buffer.channels[0]).not.toBe(buffer.channels[1]);
  });

  it('accepts the bounds of the channel and sample-rate ranges', () => {
    expect(createAudioBuffer(1, 32, 3000).channels).toHaveLength(32);
    expect(createAudioBuffer(1, 1, 768000).sampleRate).toBe(768000);
  });

  it('throws NotSupportedError for a channel count outside 1 to 32', () => {
    expect(() => createAudioBuffer(1, 0, 44100)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
    expect(() => createAudioBuffer(1, 33, 44100)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
  });

  it('throws NotSupportedError for a zero length', () => {
    expect(() => createAudioBuffer(0, 1, 44100)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
  });

  it('throws NotSupportedError for a sample rate outside 3000 to 768000 or not finite', () => {
    expect(() => createAudioBuffer(1, 1, 2999)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
    expect(() => createAudioBuffer(1, 1, 768001)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
    expect(() => createAudioBuffer(1, 1, Number.NaN)).toThrow(expect.objectContaining({ name: 'NotSupportedError' }));
  });
});
