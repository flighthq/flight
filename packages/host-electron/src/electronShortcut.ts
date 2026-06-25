import type { ShortcutBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's ShortcutBackend onto Electron's `globalShortcut` module. Electron's unregister returns
// void, so it is treated as always succeeding (true) to satisfy Flight's boolean contract. Electron's
// callback is bare; the seam synthesizes the ShortcutEvent (carrying the accelerator) Flight delivers.
// The set of registered accelerators is tracked here since Electron exposes no enumeration.
export function createElectronShortcutBackend(electron: ElectronApi): ShortcutBackend {
  const globalShortcut = electron.globalShortcut;
  const registered = new Set<string>();
  return {
    getRegistered() {
      return [...registered];
    },
    register(accelerator, listener) {
      const ok = globalShortcut.register(accelerator, () => listener({ accelerator }));
      if (ok) registered.add(accelerator);
      return ok;
    },
    setAllEnabled(_enabled) {
      // Electron's globalShortcut has no enable/disable toggle; a caller must unregister/re-register.
      // Reported as a no-op rather than silently re-registering.
    },
    setEnabled(_accelerator, _enabled) {
      // Electron has no per-accelerator enable toggle; report unsupported via false.
      return false;
    },
    unregister(accelerator) {
      globalShortcut.unregister(accelerator);
      registered.delete(accelerator);
      return true;
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
      registered.clear();
    },
    isRegistered(accelerator) {
      return globalShortcut.isRegistered(accelerator);
    },
  };
}
