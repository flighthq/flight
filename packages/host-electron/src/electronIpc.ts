import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronIpcRenderer,
  ElectronIpcTarget,
  EntityWithoutRuntime,
  IpcHandleBackend,
  IpcInvokeBackend,
  IpcMessageBackend,
  IpcSendBackend,
  IpcTargetedSendBackend,
} from '@flighthq/types/contract';

// Electron's process sides expose different capability vectors. These constructors keep the slots
// independent so a renderer host carries send/invoke while a main host carries message/handle/targetedSend.

export function createElectronIpcHandleBackend(electron: ElectronApi): IpcHandleBackend {
  const ipcMain = electron.ipcMain;
  return createEntity<EntityWithoutRuntime<IpcHandleBackend>>({
    handle(channel, handler) {
      ipcMain.handle(channel, (_event, ...args) => handler(...args));
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        ipcMain.removeHandler(channel);
      };
    },
  });
}

export function createElectronIpcInvokeBackend(ipcRenderer: ElectronIpcRenderer): IpcInvokeBackend {
  return createEntity<EntityWithoutRuntime<IpcInvokeBackend>>({
    invoke(channel, args) {
      return ipcRenderer.invoke(channel, ...args);
    },
  });
}

export function createElectronIpcMessageBackend(electron: ElectronApi): IpcMessageBackend {
  const ipcMain = electron.ipcMain;
  return createEntity<EntityWithoutRuntime<IpcMessageBackend>>({
    subscribe(channel, listener) {
      const handler = (_event: unknown, ...args: unknown[]): void => listener(args);
      ipcMain.on(channel, handler);
      return () => ipcMain.removeListener(channel, handler);
    },
  });
}

export function createElectronIpcSendBackend(ipcRenderer: ElectronIpcRenderer): IpcSendBackend {
  return createEntity<EntityWithoutRuntime<IpcSendBackend>>({
    send(channel, args) {
      ipcRenderer.send(channel, ...args);
    },
  });
}

export function createElectronIpcTargetedSendBackend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): IpcTargetedSendBackend<Target> {
  return createEntity<EntityWithoutRuntime<IpcTargetedSendBackend<Target>>>({
    send(target, channel, args) {
      target.send(channel, ...args);
    },
  });
}
