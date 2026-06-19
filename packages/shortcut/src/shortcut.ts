import type { ShortcutBackend } from '@flighthq/types';

// Builds the default web backend. Web pages cannot register OS-level global hotkeys, so every
// operation returns a sentinel: register / unregister / isRegistered are false and unregisterAll is a
// no-op. A native host (Electron's globalShortcut, Tauri) is required to fulfill global shortcuts.
export function createWebShortcutBackend(): ShortcutBackend {
  return {
    register() {
      return false;
    },
    unregister() {
      return false;
    },
    unregisterAll() {
      // No-op: web has no global-hotkey registry to clear.
    },
    isRegistered() {
      return false;
    },
  };
}

// The active shortcut backend, or a lazily-created web default. There is always a backend.
export function getShortcutBackend(): ShortcutBackend {
  if (_backend === null) _backend = createWebShortcutBackend();
  return _backend;
}

// True when the accelerator is currently registered. Returns false on web (no global hotkeys).
export function isGlobalShortcutRegistered(accelerator: string): boolean {
  return getShortcutBackend().isRegistered(accelerator);
}

// Registers a global hotkey. Returns false when the host lacks global-hotkey support (e.g. web).
export function registerGlobalShortcut(accelerator: string, handler: () => void): boolean {
  return getShortcutBackend().register(accelerator, handler);
}

// Installs a native host shortcut backend; pass null to fall back to the web default.
export function setShortcutBackend(backend: ShortcutBackend | null): void {
  _backend = backend;
}

// Unregisters every global hotkey. No-op when the host lacks global-hotkey support.
export function unregisterAllGlobalShortcuts(): void {
  getShortcutBackend().unregisterAll();
}

// Unregisters a global hotkey. Returns false when not registered or unsupported (e.g. web).
export function unregisterGlobalShortcut(accelerator: string): boolean {
  return getShortcutBackend().unregister(accelerator);
}

let _backend: ShortcutBackend | null = null;
