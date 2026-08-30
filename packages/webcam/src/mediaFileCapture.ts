import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  MediaFileCaptureBackend,
  MediaFileCaptureOptions,
  MediaFileCapturePhoto,
  MediaFileCaptureVideo,
} from '@flighthq/types/contract';

// Builds the default web backend over a transient <input type="file">. capture resolves to null when
// the document is absent (jsdom), the user cancels, or the file cannot be read — capture is not
// guaranteed. Real pixel dimensions are not decoded; width/height resolve to 0.
export function createWebMediaFileCaptureBackend(): MediaFileCaptureBackend {
  return {
    capture(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          observeMediaFileCaptureHostResult('capture', false);
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          if (options.source === 'camera') input.capture = 'environment';
          const settle = (value: MediaFileCapturePhoto | null): void => {
            input.onchange = null;
            input.oncancel = null;
            observeMediaFileCaptureHostResult('capture', value !== null);
            resolve(value);
          };
          input.onchange = () => {
            const file = input.files?.[0] ?? null;
            if (file === null) {
              settle(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              settle({
                dataUrl: typeof reader.result === 'string' ? reader.result : '',
                width: 0,
                height: 0,
                format: file.type,
              });
            };
            reader.onerror = () => settle(null);
            reader.readAsDataURL(file);
          };
          input.oncancel = () => settle(null);
          input.click();
        } catch {
          observeMediaFileCaptureHostResult('capture', false);
          resolve(null);
        }
      });
    },
    captureVideo(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          observeMediaFileCaptureHostResult('captureVideo', false);
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          if (options.source === 'camera') input.capture = 'environment';
          const settle = (value: MediaFileCaptureVideo | null): void => {
            input.onchange = null;
            input.oncancel = null;
            observeMediaFileCaptureHostResult('captureVideo', value !== null);
            resolve(value);
          };
          input.onchange = () => {
            const file = input.files?.[0] ?? null;
            if (file === null) {
              settle(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              settle({
                dataUrl: typeof reader.result === 'string' ? reader.result : '',
                duration: 0,
                format: file.type,
              });
            };
            reader.onerror = () => settle(null);
            reader.readAsDataURL(file);
          };
          input.oncancel = () => settle(null);
          input.click();
        } catch {
          observeMediaFileCaptureHostResult('captureVideo', false);
          resolve(null);
        }
      });
    },
  };
}

export function explainMediaFileCaptureBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getMediaFileCaptureBackend(): MediaFileCaptureBackend {
  return _custom ?? _host ?? _sentinel;
}

export function installMediaFileCaptureHostBackend(backend: MediaFileCaptureBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeMediaFileCaptureHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Records a video from the device camera. Resolves null when cancelled, denied, or unavailable.
export function recordMediaFileCaptureVideo(
  options?: Readonly<MediaFileCaptureOptions>,
): Promise<MediaFileCaptureVideo | null> {
  return getMediaFileCaptureBackend().captureVideo({ ...options, source: 'camera' });
}

export function resetMediaFileCaptureBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Picks an existing image from the photo library. Resolves null when cancelled or unavailable.
export function selectMediaFileCaptureImage(
  options?: Readonly<MediaFileCaptureOptions>,
): Promise<MediaFileCapturePhoto | null> {
  return getMediaFileCaptureBackend().capture({ ...options, source: 'photos' });
}

export function setMediaFileCaptureBackend(backend: MediaFileCaptureBackend | null): void {
  _custom = backend;
}

// Captures a photo from the device camera. Resolves null when cancelled, denied, or unavailable.
export function takeMediaFileCapturePhoto(
  options?: Readonly<MediaFileCaptureOptions>,
): Promise<MediaFileCapturePhoto | null> {
  return getMediaFileCaptureBackend().capture({ ...options, source: 'camera' });
}

let _custom: MediaFileCaptureBackend | null = null;
let _host: MediaFileCaptureBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: MediaFileCaptureBackend = {
  async capture() {
    return null;
  },
  async captureVideo() {
    return null;
  },
};
