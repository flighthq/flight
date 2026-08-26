import electron from 'electron';

import type { ElectronHostProbeBridge } from '#host-probe/contract';

const { contextBridge, ipcRenderer } = electron;

const bridge: ElectronHostProbeBridge = {
  run: () => ipcRenderer.invoke('flight:host-probe'),
};

contextBridge.exposeInMainWorld('flightHostProbeElectron', bridge);
