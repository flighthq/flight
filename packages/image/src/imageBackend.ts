import type { Image, ImageBackend } from '@flighthq/types/contract';

import { createImageResourceFromImageElement } from './imageResourceFrom';

// Builds the default web backend over `Image` + `decode()`. Created lazily by `getImageBackend` — no
// DOM is touched at import time, so importing the package has no side effect.
//
// ★ THIS BODY IS THE PREVIOUS `loadImageResourceFromUrl` MOVED VERBATIM, INCLUDING ITS KNOWN ABORT
// RACE: aborting rejects the caller and clears `src`, but the underlying load may already be in
// flight and is not guaranteed to stop. That defect is preserved deliberately rather than repaired
// here — this change is the seam, and fixing behaviour while relocating it would make the seam
// unreviewable against the approval that authorised it.
export function createWebImageBackend(): ImageBackend {
  return {
    async loadImageFromUrl(url, crossOrigin, signal): Promise<Image> {
      signal?.throwIfAborted();
      const img = new Image();
      if (crossOrigin !== undefined) img.crossOrigin = crossOrigin;
      img.src = url;
      // Wire abort to cancel the pending decode and reject with the signal's reason. Always remove the
      // listener when the race settles so a long-lived signal does not retain the image and closure.
      if (signal !== undefined) {
        let rejectAbort: (reason?: unknown) => void = () => {};
        const abortPromise = new Promise<never>((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = (): void => {
          img.src = '';
          rejectAbort(signal.reason);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        try {
          await Promise.race([img.decode(), abortPromise]);
        } finally {
          signal.removeEventListener('abort', onAbort);
        }
      } else {
        await img.decode();
      }
      return createImageResourceFromImageElement(img);
    },
  };
}

// The active image backend, lazily defaulting to the web one. There is always a backend.
export function getImageBackend(): ImageBackend {
  if (_backend === null) _backend = createWebImageBackend();
  return _backend;
}

// Installs a native host image backend; pass null to fall back to the lazy web default. Resettable on
// purpose: a seam a caller cannot restore is a one-way door, and a test that swapped the backend could
// not put it back.
export function setImageBackend(backend: ImageBackend | null): void {
  _backend = backend;
}

let _backend: ImageBackend | null = null;
