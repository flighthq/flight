import { createEntity } from '@flighthq/entity/contract';
import type { ElectronApi, IpcMessageBackend } from '@flighthq/types/contract';

// The Electron main-process IPC provider. It offers exactly what ipcMain can really do from this side:
// receive messages a renderer sent. The previous backend also declared `send` (a documented no-op) and
// `invoke` (resolving to `undefined`), which made the seam offer two operations no host performed.
//
// The platform supports main→renderer send, targeted send, invoke and handle. Flight has not built them,
// and they are NOT members of this slot: each needs a specific `webContents` target or a request/response
// pair, so each is a distinct capability with its own provider rather than a method hung here.
export function createElectronIpcMessageBackend(electron: ElectronApi): IpcMessageBackend {
  const ipcMain = electron.ipcMain;
  return createEntity<IpcMessageBackend>({
    // The per-subscription cleanup owns everything this call acquired — which is why the slot declares
    // no provider-level destroy: ipcMain itself is the caller's, not this backend's, to tear down.
    subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void {
      const handler = (_event: unknown, ...args: unknown[]): void => listener(args);
      ipcMain.on(channel, handler);
      return () => ipcMain.removeListener(channel, handler);
    },
  });
}
