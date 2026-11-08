import { createAudioBuffer } from '@flighthq/audio/contract';

import { createAudioBufferFromWebAudioBuffer, createWebAudioBufferFromAudioBuffer } from './webAudioBuffer.ts';

describe('createAudioBufferFromWebAudioBuffer', () => {
  it('wraps the Web Audio channel arrays without copying them', () => {
    const webBuffer = new FakeWebAudioBuffer({ length: 3, numberOfChannels: 2, sampleRate: 48000 });
    const buffer = createAudioBufferFromWebAudioBuffer(webBuffer as unknown as globalThis.AudioBuffer);
    expect(buffer.length).toBe(3);
    expect(buffer.sampleRate).toBe(48000);
    expect(buffer.channels).toHaveLength(2);
    expect(buffer.channels[1]).toBe(webBuffer.getChannelData(1));
  });
});

describe('createWebAudioBufferFromAudioBuffer', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioBuffer', FakeWebAudioBuffer);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allocates a Web Audio buffer holding a copy of every channel', () => {
    const buffer = createAudioBuffer(2, 2, 44100);
    buffer.channels[0].set([0.5, -0.5]);
    buffer.channels[1].set([0.25, 1]);
    const webBuffer = createWebAudioBufferFromAudioBuffer(buffer);
    expect(webBuffer.length).toBe(2);
    expect(webBuffer.numberOfChannels).toBe(2);
    expect(webBuffer.sampleRate).toBe(44100);
    expect(Array.from(webBuffer.getChannelData(0))).toEqual([0.5, -0.5]);
    expect(Array.from(webBuffer.getChannelData(1))).toEqual([0.25, 1]);
    expect(webBuffer.getChannelData(0)).not.toBe(buffer.channels[0]);
  });
});

// jsdom has no Web Audio; this stand-in honours the constructor options plus copyToChannel and
// getChannelData, which are all the bridge touches.
class FakeWebAudioBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  private readonly channels: Float32Array[];

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
