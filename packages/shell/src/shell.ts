import type { ShellBackend } from '@flighthq/types';

// Builds the default web backend. Only openExternal is achievable on the web (window.open); revealing
// items, opening arbitrary local paths, and trashing require a native host, so they return false here.
export function createWebShellBackend(): ShellBackend {
  return {
    async openExternal(url) {
      // window.open returns a Window handle on success, or null when blocked (popup blocker, no window).
      if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
      try {
        return window.open(url, '_blank', 'noopener') !== null;
      } catch {
        return false;
      }
    },
    async openPath() {
      // The web sandbox cannot open arbitrary local paths; only a native host can.
      return false;
    },
    async showItemInFolder() {
      // The web has no OS file manager to reveal an item in; native-host only.
      return false;
    },
    async moveToTrash() {
      // The web cannot move a local path to the OS trash; native-host only.
      return false;
    },
    beep() {
      // No portable web equivalent of a system beep; no-op until a native host provides one.
    },
  };
}

// The active shell backend, or a lazily-created web default. There is always a backend.
export function getShellBackend(): ShellBackend {
  if (_backend === null) _backend = createWebShellBackend();
  return _backend;
}

// Moves a local path to the OS trash. Returns false on the web; native-host capability.
export function moveItemToTrash(path: string): Promise<boolean> {
  return getShellBackend().moveToTrash(path);
}

// Opens a URL in the user's default browser / external handler. Returns false when blocked.
export function openExternalURL(url: string): Promise<boolean> {
  return getShellBackend().openExternal(url);
}

// Opens a local path with its default OS application. Returns false on the web; native-host capability.
export function openShellPath(path: string): Promise<boolean> {
  return getShellBackend().openPath(path);
}

// Installs a native host shell backend; pass null to fall back to the web default.
export function setShellBackend(backend: ShellBackend | null): void {
  _backend = backend;
}

// Emits a system beep. No-op on the web until a native host provides one.
export function shellBeep(): void {
  getShellBackend().beep();
}

// Reveals a local path in the OS file manager. Returns false on the web; native-host capability.
export function showItemInFolder(path: string): Promise<boolean> {
  return getShellBackend().showItemInFolder(path);
}

let _backend: ShellBackend | null = null;
