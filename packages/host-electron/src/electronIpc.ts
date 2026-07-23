import type { IpcBackend, ElectronApi } from '@flighthq/types';

// Maps Flight's IpcBackend onto Electron's ipcMain. This is the main-process side: it can receive
// messages from renderers (subscribe) but cannot itself send or invoke without a webContents target,
// so send no-ops and invoke resolves to undefined — the same inert shape the web default uses.
export function createElectronIpcBackend(electron: ElectronApi): IpcBackend {
  const ipcMain = electron.ipcMain;
  return {
    send() {
      // Main-to-renderer send needs a specific webContents; out of scope for this generic backend.
    },
    invoke() {
      // The main side has no invoke target; resolve to the undefined sentinel.
      return Promise.resolve(undefined);
    },
    subscribe(channel, listener) {
      const handler = (_event: unknown, ...args: unknown[]) => listener(args);
      ipcMain.on(channel, handler);
      return () => ipcMain.removeListener(channel, handler);
    },
  };
}
