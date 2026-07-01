import type { WebcamBackend, WebcamCaptureOptions, WebcamPhoto, WebcamVideo } from '@flighthq/types';

// Builds the default web backend over a transient <input type="file">. capture resolves to null when
// the document is absent (jsdom), the user cancels, or the file cannot be read — capture is not
// guaranteed. Real pixel dimensions are not decoded; width/height resolve to 0.
export function createWebWebcamBackend(): WebcamBackend {
  return {
    capture(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          if (options.source === 'camera') input.capture = 'environment';
          input.onchange = () => {
            const file = input.files?.[0] ?? null;
            if (file === null) {
              resolve(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                dataUrl: typeof reader.result === 'string' ? reader.result : '',
                width: 0,
                height: 0,
                format: file.type,
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          };
          input.click();
        } catch {
          resolve(null);
        }
      });
    },
    captureVideo(options) {
      return new Promise((resolve) => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
          resolve(null);
          return;
        }
        try {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'video/*';
          if (options.source === 'camera') input.capture = 'environment';
          input.onchange = () => {
            const file = input.files?.[0] ?? null;
            if (file === null) {
              resolve(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                dataUrl: typeof reader.result === 'string' ? reader.result : '',
                // The web file input cannot decode the clip; native hosts report a real duration.
                duration: 0,
                format: file.type,
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          };
          input.click();
        } catch {
          resolve(null);
        }
      });
    },
    async requestPermission() {
      // The Permissions API only reports state; it does not prompt. A native host performs a real
      // permission request. Returns false when the API is absent (jsdom, older browsers) or denied.
      if (typeof navigator === 'undefined') return false;
      try {
        const permissions = navigator.permissions;
        if (permissions === undefined || typeof permissions.query !== 'function') return false;
        const status = await permissions.query({ name: 'camera' as PermissionName });
        return status.state === 'granted';
      } catch {
        return false;
      }
    },
  };
}

// The active camera backend, or a lazily-created web default. There is always a backend.
export function getWebcamBackend(): WebcamBackend {
  if (_backend === null) _backend = createWebWebcamBackend();
  return _backend;
}

// Records a video from the device camera. Resolves null when cancelled, denied, or unavailable.
export function recordWebcamVideo(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamVideo | null> {
  return getWebcamBackend().captureVideo({ ...options, source: 'camera' });
}

// Requests camera access permission. Resolves false when denied or when the host cannot prompt.
export function requestWebcamPermission(): Promise<boolean> {
  return getWebcamBackend().requestPermission();
}

// Picks an existing image from the photo library. Resolves null when cancelled or unavailable.
export function selectWebcamImage(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamPhoto | null> {
  return getWebcamBackend().capture({ ...options, source: 'photos' });
}

// Installs a native host camera backend; pass null to fall back to the web default.
export function setWebcamBackend(backend: WebcamBackend | null): void {
  _backend = backend;
}

// Captures a photo from the device camera. Resolves null when cancelled, denied, or unavailable.
export function takeWebcamPhoto(options?: Readonly<WebcamCaptureOptions>): Promise<WebcamPhoto | null> {
  return getWebcamBackend().capture({ ...options, source: 'camera' });
}

let _backend: WebcamBackend | null = null;
