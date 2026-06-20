import type { ShortcutBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's ShortcutBackend onto Electron's `globalShortcut` module. Electron's unregister returns
// void, so it is treated as always succeeding (true) to satisfy Flight's boolean contract.
export function createElectronShortcutBackend(electron: ElectronApi): ShortcutBackend {
  const globalShortcut = electron.globalShortcut;
  return {
    register(accelerator, listener) {
      return globalShortcut.register(accelerator, listener);
    },
    unregister(accelerator) {
      globalShortcut.unregister(accelerator);
      return true;
    },
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
    isRegistered(accelerator) {
      return globalShortcut.isRegistered(accelerator);
    },
  };
}
