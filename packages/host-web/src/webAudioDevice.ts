import {
  createWebAudioDeviceBackend,
  installAudioDeviceHostBackend,
  observeAudioDeviceHostResult,
} from '@flighthq/media/contract';
import type { AudioDeviceBackend, AudioDeviceHandle } from '@flighthq/types/contract';

export function enableHostWebAudioDevice(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebAudioDeviceBackend();
  const backend: AudioDeviceBackend = {
    ...inner,
    createDevice(sampleRate: number): AudioDeviceHandle {
      try {
        const result = inner.createDevice(sampleRate);
        observeAudioDeviceHostResult('createDevice', true);
        return result;
      } catch {
        observeAudioDeviceHostResult('createDevice', false);
        throw new Error('AudioContext creation failed');
      }
    },
  };
  installAudioDeviceHostBackend(backend);
}

export function resetHostWebAudioDeviceForTest(): void {
  _enabled = false;
}

let _enabled = false;
