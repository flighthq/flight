import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronIpcRenderer,
  ElectronIpcTarget,
  HostIpcCapabilities,
  HostIpcHandleCapability,
  HostIpcInvokeCapability,
  HostIpcMessageCapability,
  HostIpcSendCapability,
  HostIpcTargetedSendCapability,
  EntityConstruction,
} from '@flighthq/types/contract';

// Electron's process sides expose different capability vectors. These constructors keep the slots
// independent so a renderer host carries send/invoke while a main host carries message/handle/targetedSend.

export function electronHostIpc(
  electron: ElectronApi,
): Required<Pick<HostIpcCapabilities, 'handle' | 'message' | 'targetedSend'>> {
  return {
    handle: electronHostIpcHandle(electron),
    message: electronHostIpcMessage(electron),
    targetedSend: electronHostIpcTargetedSend<ElectronIpcTarget>(),
  };
}

export function electronHostIpcHandle(electron: ElectronApi): HostIpcHandleCapability {
  const out = allocateEntity<HostIpcHandleCapability>();
  populateElectronHostIpcHandle(out, electron);
  return finishEntity(out);
}

export function electronHostIpcInvoke(ipcRenderer: ElectronIpcRenderer): HostIpcInvokeCapability {
  const out = allocateEntity<HostIpcInvokeCapability>();
  populateElectronHostIpcInvoke(out, ipcRenderer);
  return finishEntity(out);
}

export function electronHostIpcMessage(electron: ElectronApi): HostIpcMessageCapability {
  const out = allocateEntity<HostIpcMessageCapability>();
  populateElectronHostIpcMessage(out, electron);
  return finishEntity(out);
}

export function electronHostIpcSend(ipcRenderer: ElectronIpcRenderer): HostIpcSendCapability {
  const out = allocateEntity<HostIpcSendCapability>();
  populateElectronHostIpcSend(out, ipcRenderer);
  return finishEntity(out);
}

export function electronHostIpcTargetedSend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): HostIpcTargetedSendCapability<Target> {
  const out = allocateEntity<HostIpcTargetedSendCapability<Target>>();
  populateElectronHostIpcTargetedSend(out);
  return finishEntity(out);
}

export function populateElectronHostIpcHandle(
  out: EntityConstruction<HostIpcHandleCapability>,
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

export function populateElectronHostIpcInvoke(
  out: EntityConstruction<HostIpcInvokeCapability>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.invoke = (channel, args) => {
    return ipcRenderer.invoke(channel, ...args);
  };
}

export function populateElectronHostIpcMessage(
  out: EntityConstruction<HostIpcMessageCapability>,
  electron: ElectronApi,
): void {
  const ipcMain = electron.ipcMain;
  out.subscribe = (channel, listener) => {
    const handler = (_event: unknown, ...args: unknown[]): void => listener(args);
    ipcMain.on(channel, handler);
    return () => ipcMain.removeListener(channel, handler);
  };
}

export function populateElectronHostIpcSend(
  out: EntityConstruction<HostIpcSendCapability>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.send = (channel, args) => {
    ipcRenderer.send(channel, ...args);
  };
}

export function populateElectronHostIpcTargetedSend<Target extends ElectronIpcTarget = ElectronIpcTarget>(
  out: EntityConstruction<HostIpcTargetedSendCapability<Target>>,
): void {
  out.send = (target, channel, args) => {
    target.send(channel, ...args);
  };
}
