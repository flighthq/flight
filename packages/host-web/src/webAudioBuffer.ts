import type { AudioBuffer } from '@flighthq/audio/contract';

// Portable code holds the Flight AudioBuffer; the Web Audio buffer of the same name is reached through
// globalThis so the two never share a binding in this module.
type WebAudioBuffer = globalThis.AudioBuffer;

// Wraps a Web Audio buffer without copying: each channel is the browser's own getChannelData array, so
// samples written through either view are visible through the other.
export function createAudioBufferFromWebAudioBuffer(webBuffer: WebAudioBuffer): AudioBuffer {
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < webBuffer.numberOfChannels; channel++) {
    channels.push(webBuffer.getChannelData(channel));
  }
  return { channels, length: webBuffer.length, sampleRate: webBuffer.sampleRate };
}

// Allocates a Web Audio buffer holding a copy of the samples, for browser APIs that require one.
export function createWebAudioBufferFromAudioBuffer(buffer: Readonly<AudioBuffer>): WebAudioBuffer {
  const numberOfChannels = buffer.channels.length;
  const webBuffer = new globalThis.AudioBuffer({
    length: buffer.length,
    numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < numberOfChannels; channel++) {
    // Narrow the widened ArrayBufferLike backing to the ArrayBuffer that copyToChannel requires.
    webBuffer.copyToChannel(buffer.channels[channel] as Float32Array<ArrayBuffer>, channel);
  }
  return webBuffer;
}
