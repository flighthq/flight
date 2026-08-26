import type { HostProbeInstallResult } from '#host-probe/contract';

export async function installElectronHostProbe(): Promise<HostProbeInstallResult> {
  if (window.flightHostProbeElectron === undefined) {
    return {
      changedCapabilities: [],
      results: [
        {
          detail: 'Electron preload bridge is unavailable',
          id: 'runtime.electron-bridge',
          kind: 'runtime',
          status: 'fail',
        },
      ],
    };
  }
  return window.flightHostProbeElectron.run();
}
