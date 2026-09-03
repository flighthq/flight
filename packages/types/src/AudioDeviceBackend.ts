import type { AudioBufferHandle, AudioDeviceHandle, AudioSourceHandle } from './AudioDeviceHandle';
import type { Entity } from './Entity';

export interface AudioDeviceBackend extends Entity {
  createBuffer(
    device: AudioDeviceHandle,
    channels: number,
    length: number,
    sampleRate: number,
    data: readonly Float32Array[],
  ): AudioBufferHandle;
  createDevice(sampleRate: number): AudioDeviceHandle;
  createSource(device: AudioDeviceHandle, buffer: AudioBufferHandle): AudioSourceHandle;
  destroyBuffer(buffer: AudioBufferHandle): void;
  destroyDevice(device: AudioDeviceHandle): void;
  destroySource(source: AudioSourceHandle): void;
  getDeviceTime(device: AudioDeviceHandle): number;
  onSourceEnded(source: AudioSourceHandle, callback: (() => void) | null): void;
  resumeDevice(device: AudioDeviceHandle): void;
  setSourceGain(source: AudioSourceHandle, gain: number): void;
  // Stereo placement in -1..1. A backend with no stereo stage implements it as a no-op rather than
  // refusing, so a caller never has to ask whether panning is available before setting it.
  setSourcePan(source: AudioSourceHandle, pan: number): void;
  setSourcePlaybackRate(source: AudioSourceHandle, rate: number): void;
  // `duration` bounds one playback pass in seconds; 0 or less plays to the end of the buffer. A loop
  // region is expressed this way rather than through the node's own loop flag, because the node's loop
  // never ends and the channel counts its loops by restarting on end.
  startSource(source: AudioSourceHandle, offset: number, duration: number): void;
  stopSource(source: AudioSourceHandle): void;
}

// The operation names only. AudioDeviceBackend is an Entity, so a bare `keyof` would also yield the
// runtime slot's symbol — which names no operation, and widening this union to include it makes every
// explain*/has* consumer accept a key it can never resolve.
export type AudioDeviceOperation = Exclude<keyof AudioDeviceBackend, keyof Entity>;
