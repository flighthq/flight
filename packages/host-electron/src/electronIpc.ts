import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronIpcRenderer,
  ElectronIpcTarget,
  HostIpcHandleProvider,
  HostIpcInvokeProvider,
  HostIpcMessageProvider,
  HostIpcSendProvider,
  HostIpcTargetedSendProvider,
  EntityConstruction,
} from '@flighthq/types/contract';

// Electron's process sides expose different capability vectors. These constructors keep the slots
// independent so a renderer host carries send/invoke while a main host carries message/handle/targetedSend.

export function createElectronIpcHandleBackend(electron: ElectronApi): HostIpcHandleProvider {
  const out = allocateEntity<HostIpcHandleProvider>();
  initializeElectronIpcHandleBackend(out, electron);
  return finishEntity(out);
}

export function createElectronIpcInvokeBackend(ipcRenderer: ElectronIpcRenderer): HostIpcInvokeProvider {
  const out = allocateEntity<HostIpcInvokeProvider>();
  initializeElectronIpcInvokeBackend(out, ipcRenderer);
  return finishEntity(out);
}

export function createElectronIpcMessageBackend(electron: ElectronApi): HostIpcMessageProvider {
  const out = allocateEntity<HostIpcMessageProvider>();
  initializeElectronIpcMessageBackend(out, electron);
  return finishEntity(out);
}

export function createElectronIpcSendBackend(ipcRenderer: ElectronIpcRenderer): HostIpcSendProvider {
  const out = allocateEntity<HostIpcSendProvider>();
  initializeElectronIpcSendBackend(out, ipcRenderer);
  return finishEntity(out);
}

export function createElectronIpcTargetedSendBackend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): HostIpcTargetedSendProvider<Target> {
  const out = allocateEntity<HostIpcTargetedSendProvider<Target>>();
  initializeElectronIpcTargetedSendBackend(out);
  return finishEntity(out);
}

export function initializeElectronIpcHandleBackend(
  out: EntityConstruction<HostIpcHandleProvider>,
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
  out: EntityConstruction<HostIpcInvokeProvider>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.invoke = (channel, args) => {
    return ipcRenderer.invoke(channel, ...args);
  };
}

export function initializeElectronIpcMessageBackend(
  out: EntityConstruction<HostIpcMessageProvider>,
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
  out: EntityConstruction<HostIpcSendProvider>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.send = (channel, args) => {
    ipcRenderer.send(channel, ...args);
  };
}

export function initializeElectronIpcTargetedSendBackend<Target extends ElectronIpcTarget = ElectronIpcTarget>(
  out: EntityConstruction<HostIpcTargetedSendProvider<Target>>,
): void {
  out.send = (target, channel, args) => {
    target.send(channel, ...args);
  };
}
