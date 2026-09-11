import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronIpcRenderer,
  ElectronIpcTarget,
  HostIpcCapabilities,
  HostIpcHandleProvider,
  HostIpcInvokeProvider,
  HostIpcMessageProvider,
  HostIpcSendProvider,
  HostIpcTargetedSendProvider,
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

export function electronHostIpcHandle(electron: ElectronApi): HostIpcHandleProvider {
  const out = allocateEntity<HostIpcHandleProvider>();
  populateElectronHostIpcHandle(out, electron);
  return finishEntity(out);
}

export function electronHostIpcInvoke(ipcRenderer: ElectronIpcRenderer): HostIpcInvokeProvider {
  const out = allocateEntity<HostIpcInvokeProvider>();
  populateElectronHostIpcInvoke(out, ipcRenderer);
  return finishEntity(out);
}

export function electronHostIpcMessage(electron: ElectronApi): HostIpcMessageProvider {
  const out = allocateEntity<HostIpcMessageProvider>();
  populateElectronHostIpcMessage(out, electron);
  return finishEntity(out);
}

export function electronHostIpcSend(ipcRenderer: ElectronIpcRenderer): HostIpcSendProvider {
  const out = allocateEntity<HostIpcSendProvider>();
  populateElectronHostIpcSend(out, ipcRenderer);
  return finishEntity(out);
}

export function electronHostIpcTargetedSend<
  Target extends ElectronIpcTarget = ElectronIpcTarget,
>(): HostIpcTargetedSendProvider<Target> {
  const out = allocateEntity<HostIpcTargetedSendProvider<Target>>();
  populateElectronHostIpcTargetedSend(out);
  return finishEntity(out);
}

export function populateElectronHostIpcHandle(
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

export function populateElectronHostIpcInvoke(
  out: EntityConstruction<HostIpcInvokeProvider>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.invoke = (channel, args) => {
    return ipcRenderer.invoke(channel, ...args);
  };
}

export function populateElectronHostIpcMessage(
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

export function populateElectronHostIpcSend(
  out: EntityConstruction<HostIpcSendProvider>,
  ipcRenderer: ElectronIpcRenderer,
): void {
  out.send = (channel, args) => {
    ipcRenderer.send(channel, ...args);
  };
}

export function populateElectronHostIpcTargetedSend<Target extends ElectronIpcTarget = ElectronIpcTarget>(
  out: EntityConstruction<HostIpcTargetedSendProvider<Target>>,
): void {
  out.send = (target, channel, args) => {
    target.send(channel, ...args);
  };
}
