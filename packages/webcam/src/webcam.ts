import type { BackendExplanation } from '@flighthq/types/contract';
import type { WebcamBackend, WebcamCaptureOptions, WebcamPhoto, WebcamVideo } from '@flighthq/types/contract';

// Builds the default web backend over a transient <input type="file">. capture resolves to null when
// the document is absent (jsdom), the user cancels, or the file cannot be read — capture is not
// guaranteed. Real pixel dimensions are not decoded; width/height resolve to 0.
export function createWebWebcamBackend(): WebcamBackend {
  return {
    capture(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          observeWebcamHostResult('capture', false);
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          if (options.source === 'camera') input.capture = 'environment';
          const settle = (value: WebcamPhoto | null): void => {
            input.onchange = null;
            input.oncancel = null;
            observeWebcamHostResult('capture', value !== null);
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
          observeWebcamHostResult('capture', false);
          resolve(null);
        }
      });
    },
    captureVideo(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          observeWebcamHostResult('captureVideo', false);
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          if (options.source === 'camera') input.capture = 'environment';
          const settle = (value: WebcamVideo | null): void => {
            input.onchange = null;
            input.oncancel = null;
            observeWebcamHostResult('captureVideo', value !== null);
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
          observeWebcamHostResult('captureVideo', false);
          resolve(null);
        }
      });
    },
  };
}

export function explainWebcamBackend(): BackendExplanation {
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

export function getWebcamBackend(): WebcamBackend {
  return _custom ?? _host ?? _sentinel;
}

export function installWebcamHostBackend(backend: WebcamBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeWebcamHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Records a video from the device camera. Resolves null when cancelled, denied, or unavailable.
export function recordWebcamVideo(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamVideo | null> {
  return getWebcamBackend().captureVideo({ ...options, source: 'camera' });
}

export function resetWebcamBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Picks an existing image from the photo library. Resolves null when cancelled or unavailable.
export function selectWebcamImage(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamPhoto | null> {
  return getWebcamBackend().capture({ ...options, source: 'photos' });
}

export function setWebcamBackend(backend: WebcamBackend | null): void {
  _custom = backend;
}

// Captures a photo from the device camera. Resolves null when cancelled, denied, or unavailable.
export function takeWebcamPhoto(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamPhoto | null> {
  return getWebcamBackend().capture({ ...options, source: 'camera' });
}

let _custom: WebcamBackend | null = null;
let _host: WebcamBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: WebcamBackend = {
  async capture() {
    return null;
  },
  async captureVideo() {
    return null;
  },
};
