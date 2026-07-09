import type { AudioResource } from '@flighthq/types';

// Allocates a new resource identity over the SAME underlying AudioBuffer. The buffer is shared by
// reference, not duplicated — clone gives an independent resource object over the same decoded PCM,
// e.g. to hand one decoded sound to two playback subsystems. Use createAudioResourceFromSamples with
// copied channel data when you need the samples themselves duplicated.
export function cloneAudioResource(resource: Readonly<AudioResource>): AudioResource {
  return { buffer: resource.buffer };
}

export function createAudioResource(buffer?: AudioBuffer): AudioResource {
  return { buffer: buffer ?? null };
}

// Releases the decoded AudioBuffer reference so it becomes eligible for GC. The AudioBuffer is plain
// GC-managed memory with no GPU/native handle to free, so this is dispose*, not destroy*.
export function disposeAudioResource(resource: AudioResource): void {
  resource.buffer = null;
}

// Returns the byte footprint of the decoded PCM: channels × length × 4 (Float32 samples). Returns 0
// when there is no buffer. Mirrors getImageResourceByteSize (width × height × 4).
export function getAudioResourceByteSize(resource: Readonly<AudioResource>): number {
  const buffer = resource.buffer;
  return buffer !== null ? buffer.numberOfChannels * buffer.length * 4 : 0;
}

export function getAudioResourceChannelCount(resource: Readonly<AudioResource>): number {
  return resource.buffer !== null ? resource.buffer.numberOfChannels : 0;
}

// Returns the Float32 samples for one channel by reference (Web Audio's getChannelData contract), or
// null when there is no buffer or the channel index is out of range. Mutating the returned array
// mutates the decoded buffer in place.
export function getAudioResourceChannelData(resource: Readonly<AudioResource>, channel: number): Float32Array | null {
  const buffer = resource.buffer;
  if (buffer === null || channel < 0 || channel >= buffer.numberOfChannels) return null;
  return buffer.getChannelData(channel);
}

export function getAudioResourceDuration(resource: Readonly<AudioResource>): number {
  return resource.buffer !== null ? resource.buffer.duration : 0;
}

export function getAudioResourceSampleRate(resource: Readonly<AudioResource>): number {
  return resource.buffer !== null ? resource.buffer.sampleRate : 0;
}

export function hasAudioResourceBuffer(resource: Readonly<AudioResource>): boolean {
  return resource.buffer !== null;
}

export function isAudioResourceEmpty(resource: Readonly<AudioResource>): boolean {
  return resource.buffer === null || resource.buffer.length === 0;
}
