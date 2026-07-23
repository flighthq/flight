import type { PowerBackend, PowerIdleState, ElectronApi } from '@flighthq/types';

// Maps Flight's PowerBackend onto Electron's powerMonitor and powerSaveBlocker. The main process has
// no battery-level reading, so getStatus reports batteryLevel -1 and infers charging from the AC/
// battery flag. setKeepAwake holds a single display-sleep blocker id across calls.
export function createElectronPowerBackend(electron: ElectronApi): PowerBackend {
  const powerMonitor = electron.powerMonitor;
  const powerSaveBlocker = electron.powerSaveBlocker;
  let blockerId = -1;
  return {
    getStatus(out) {
      const onBattery = powerMonitor.onBatteryPower === true;
      out.batteryLevel = -1;
      out.chargingTime = -1;
      out.dischargingTime = -1;
      out.isBatteryLow = false;
      out.isCharging = !onBattery;
      out.isLowPower = false;
      out.isOnBattery = onBattery;
      out.thermalState = 'Unknown';
      return out;
    },
    getBatteryHealth() {
      // Electron's main process exposes no battery-health detail; report none.
      return null;
    },
    getSystemIdleState(thresholdSeconds) {
      return toIdleState(powerMonitor.getSystemIdleState(thresholdSeconds));
    },
    getSystemIdleTime() {
      return powerMonitor.getSystemIdleTime();
    },
    isKeepAwakeActive() {
      return blockerId >= 0;
    },
    subscribe(listener) {
      powerMonitor.on('on-battery', listener);
      powerMonitor.on('on-ac', listener);
      return () => {
        powerMonitor.removeListener('on-battery', listener);
        powerMonitor.removeListener('on-ac', listener);
      };
    },
    subscribeLockScreen(listener) {
      powerMonitor.on('lock-screen', listener);
      return () => powerMonitor.removeListener('lock-screen', listener);
    },
    subscribeLowPowerModeChange() {
      // Electron's powerMonitor has no low-power-mode event; inert unsubscribe.
      return () => {};
    },
    subscribeResume(listener) {
      powerMonitor.on('resume', listener);
      return () => powerMonitor.removeListener('resume', listener);
    },
    subscribeSuspend(listener) {
      powerMonitor.on('suspend', listener);
      return () => powerMonitor.removeListener('suspend', listener);
    },
    subscribeThermalStateChange(listener) {
      powerMonitor.on('thermal-state-change', listener);
      return () => powerMonitor.removeListener('thermal-state-change', listener);
    },
    subscribeUnlockScreen(listener) {
      powerMonitor.on('unlock-screen', listener);
      return () => powerMonitor.removeListener('unlock-screen', listener);
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

function toIdleState(state: 'active' | 'idle' | 'locked' | 'unknown'): PowerIdleState {
  if (state === 'active') return 'Active';
  if (state === 'idle' || state === 'locked') return 'Idle';
  return 'Unknown';
}
