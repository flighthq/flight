import type { PowerBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's PowerBackend onto Electron's powerMonitor and powerSaveBlocker. The main process has
// no battery-level reading, so getStatus reports batteryLevel -1 and infers charging from the AC/
// battery flag. setKeepAwake holds a single display-sleep blocker id across calls.
export function createElectronPowerBackend(electron: ElectronApi): PowerBackend {
  const powerMonitor = electron.powerMonitor;
  const powerSaveBlocker = electron.powerSaveBlocker;
  let blockerId = -1;
  return {
    getStatus(out) {
      out.batteryLevel = -1;
      out.isCharging = powerMonitor.onBatteryPower === false;
      out.isLowPower = false;
      return out;
    },
    subscribe(listener) {
      powerMonitor.on('on-battery', listener);
      powerMonitor.on('on-ac', listener);
      return () => {
        powerMonitor.removeListener('on-battery', listener);
        powerMonitor.removeListener('on-ac', listener);
      };
    },
    subscribeSuspend(listener) {
      powerMonitor.on('suspend', listener);
      return () => powerMonitor.removeListener('suspend', listener);
    },
    subscribeResume(listener) {
      powerMonitor.on('resume', listener);
      return () => powerMonitor.removeListener('resume', listener);
    },
    setKeepAwake(enabled) {
      try {
        if (enabled && blockerId < 0) {
          blockerId = powerSaveBlocker.start('prevent-display-sleep');
          return true;
        }
        if (!enabled && blockerId >= 0) {
          powerSaveBlocker.stop(blockerId);
          blockerId = -1;
          return true;
        }
        return enabled;
      } catch {
        return false;
      }
    },
  };
}
