import type { ShareBackend, ShareContent } from '@flighthq/types';

// True when the active backend can share the given content. Returns false when sharing is unavailable.
export function canShareContent(content: Readonly<ShareContent>): boolean {
  return getShareBackend().canShare(content);
}

// Builds the default web backend over navigator.share. share resolves to false and canShare returns
// false when the Web Share API is absent (jsdom, unsupported browsers) or the user cancels — sharing
// is not guaranteed.
export function createWebShareBackend(): ShareBackend {
  return {
    async share(content) {
      if (typeof navigator === 'undefined' || !('share' in navigator) || typeof navigator.share !== 'function') {
        return false;
      }
      try {
        await navigator.share(content);
        return true;
      } catch {
        return false;
      }
    },
    canShare(content) {
      if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
      try {
        return navigator.canShare?.(content) ?? false;
      } catch {
        return false;
      }
    },
  };
}

// The active share backend, or a lazily-created web default. There is always a backend.
export function getShareBackend(): ShareBackend {
  if (_backend === null) _backend = createWebShareBackend();
  return _backend;
}

// Installs a native host share backend; pass null to fall back to the web default.
export function setShareBackend(backend: ShareBackend | null): void {
  _backend = backend;
}

// Opens the native share sheet with the given content. Resolves true on success, false when the host
// denies, the user cancels, or sharing is unavailable.
export function shareContent(content: Readonly<ShareContent>): Promise<boolean> {
  return getShareBackend().share(content);
}

let _backend: ShareBackend | null = null;
