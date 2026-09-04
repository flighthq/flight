import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronIpcRenderer,
  ElectronIpcTarget,
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
  const out = allocateEntity<IpcHandleBackend>();
  out.handle = (channel, handler) => {
    ipcMain.handle(channel, (_event, ...args) => handler(...args));
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      ipcMain.removeHandler(channel);
    };
  };
  return finishEntity(out);
}

export function createElectronIpcInvokeBackend(ipcRenderer: ElectronIpcRenderer): IpcInvokeBackend {
  const out = allocateEntity<IpcInvokeBackend>();
  out.invoke = (channel, args) => {
    return ipcRenderer.invoke(channel, ...args);
  };
  return finishEntity(out);
}

export function createElectronIpcMessageBackend(electron: ElectronApi): IpcMessageBackend {
  const ipcMain = electron.ipcMain;
  const out = allocateEntity<IpcMessageBackend>();
  out.subscribe = (channel, listener) => {
    const handler = (_event: unknown, ...args: unknown[]): void => listener(args);
    ipcMain.on(channel, handler);
    return () => ipcMain.removeListener(channel, handler);
  };
  return finishEntity(out);
}

export function createElectronIpcSendBackend(ipcRenderer: ElectronIpcRenderer): IpcSendBackend {
  const out = allocateEntity<IpcSendBackend>();
  out.send = (channel, args) => {
    ipcRenderer.send(channel, ...args);
  };
  return finishEntity(out);
}

export function createElectronIpcTargetedSendBackend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): IpcTargetedSendBackend<Target> {
  const out = allocateEntity<IpcTargetedSendBackend<Target>>();
  out.send = (target, channel, args) => {
    target.send(channel, ...args);
  };
  return finishEntity(out);
}
