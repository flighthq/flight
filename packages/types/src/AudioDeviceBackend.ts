import type { AudioBufferHandle, AudioDeviceHandle, AudioSourceHandle } from './AudioDeviceHandle';

export interface AudioDeviceBackend {
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
  startSource(source: AudioSourceHandle, offset: number): void;
  stopSource(source: AudioSourceHandle): void;
}

export type AudioDeviceOperation = keyof AudioDeviceBackend;
