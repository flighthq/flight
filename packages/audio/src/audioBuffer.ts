import type { AudioBuffer } from './types.ts';

// Copies samples into one channel from offset zero. The copy stops at the buffer length and leaves any
// remaining destination samples unchanged, matching Web Audio's copyToChannel.
export function copyToAudioBufferChannel(
  buffer: Readonly<AudioBuffer>,
  source: Readonly<Float32Array>,
  channel: number,
): void {
  const destination = buffer.channels[channel];
  const count = Math.min(destination.length, source.length);
  destination.set(source.subarray(0, count));
}

// Allocates zero-filled planar storage under the same ranges the Web Audio AudioBuffer constructor
// enforces, and throws the same NotSupportedError when they are violated.
export function createAudioBuffer(length: number, numberOfChannels: number, sampleRate: number): AudioBuffer {
  if (!(numberOfChannels >= 1 && numberOfChannels <= 32)) {
    throw new DOMException('AudioBuffer: numberOfChannels must be between 1 and 32', 'NotSupportedError');
  }
  if (!(length >= 1)) throw new DOMException('AudioBuffer: length must be at least 1', 'NotSupportedError');
  if (!(sampleRate >= 3000 && sampleRate <= 768000)) {
    throw new DOMException('AudioBuffer: sampleRate must be between 3000 and 768000', 'NotSupportedError');
  }
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < numberOfChannels; channel++) channels.push(new Float32Array(length));
  return { channels, length, sampleRate };
}
