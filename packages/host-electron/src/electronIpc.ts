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
  EntityConstruction,
} from '@flighthq/types/contract';

// Electron's process sides expose different capability vectors. These constructors keep the slots
// independent so a renderer host carries send/invoke while a main host carries message/handle/targetedSend.

export function createElectronIpcHandleBackend(electron: ElectronApi): IpcHandleBackend {
  const out = allocateEntity<IpcHandleBackend>();
  initializeElectronIpcHandleBackend(out, electron);
  return finishEntity(out);
}

export function createElectronIpcInvokeBackend(ipcRenderer: ElectronIpcRenderer): IpcInvokeBackend {
  const out = allocateEntity<IpcInvokeBackend>();
  initializeElectronIpcInvokeBackend(out, ipcRenderer);
  return finishEntity(out);
}

export function createElectronIpcMessageBackend(electron: ElectronApi): IpcMessageBackend {
  const out = allocateEntity<IpcMessageBackend>();
  initializeElectronIpcMessageBackend(out, electron);
  return finishEntity(out);
}

export function createElectronIpcSendBackend(ipcRenderer: ElectronIpcRenderer): IpcSendBackend {
  const out = allocateEntity<IpcSendBackend>();
  initializeElectronIpcSendBackend(out, ipcRenderer);
  return finishEntity(out);
}

export function createElectronIpcTargetedSendBackend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): IpcTargetedSendBackend<Target> {
  const out = allocateEntity<IpcTargetedSendBackend<Target>>();
  initializeElectronIpcTargetedSendBackend(out);
  return finishEntity(out);
}

export function initializeElectronIpcHandleBackend(
  out: EntityConstruction<IpcHandleBackend>,
  electron: ElectronApi,
): void {
  const ipcMain = electron.ipcMain;
  out.handle = (channel, handler) => {
    ipcMain.handle(channel, (_event, ...args) => handler(...args));
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      ipcMain.removeHandler(channel);
    };
  };
}

export function initializeElectronIpcInvokeBackend(
  out: EntityConstruction<IpcInvokeBackend>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.invoke = (channel, args) => {
    return ipcRenderer.invoke(channel, ...args);
  };
}

export function initializeElectronIpcMessageBackend(
  out: EntityConstruction<IpcMessageBackend>,
  electron: ElectronApi,
): void {
  const ipcMain = electron.ipcMain;
  out.subscribe = (channel, listener) => {
    const handler = (_event: unknown, ...args: unknown[]): void => listener(args);
    ipcMain.on(channel, handler);
    return () => ipcMain.removeListener(channel, handler);
  };
}

export function initializeElectronIpcSendBackend(
  out: EntityConstruction<IpcSendBackend>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.send = (channel, args) => {
    ipcRenderer.send(channel, ...args);
  };
}

export function initializeElectronIpcTargetedSendBackend(
  out: EntityConstruction<IpcTargetedSendBackend<Target>>,
): void {
  out.send = (target, channel, args) => {
    target.send(channel, ...args);
  };
}
