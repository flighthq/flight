import { createWebAudioBackend, installAudioHostBackend, observeAudioHostResult } from '@flighthq/audio/contract';
import type { AudioBackend } from '@flighthq/types/contract';

export function enableHostWebAudio(): void {
  if (_enabled) return;
  _enabled = true;
  const inner = createWebAudioBackend();
  const backend: AudioBackend = {
    canPlayType(mimeType: string): boolean {
      const result = inner.canPlayType(mimeType);
      observeAudioHostResult('canPlayType', result);
      return result;
    },
  };
  installAudioHostBackend(backend);
}

export function resetHostWebAudioForTest(): void {
  _enabled = false;
}

let _enabled = false;
