import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronPowerCapabilities,
  PowerBatteryHealth,
  PowerBatteryHealthBackend,
  PowerChangeBackend,
  PowerIdleBackend,
  PowerIdleState,
  PowerKeepAwakeAcquireResult,
  PowerKeepAwakeBackend,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  PowerSessionLockBackend,
  PowerStatus,
  PowerStatusBackend,
  PowerSuspensionBackend,
  PowerThermalBackend,
  PowerThermalState,
} from '@flighthq/types/contract';

// Maps Flight's power slots onto Electron's powerMonitor and powerSaveBlocker. Built together because
// keepAwake shares one blocker id across acquire/release; the slots stay separate because their shapes
// and their coverage differ.
//
// Electron omits nothing here except low-power mode, which its powerMonitor cannot report at all — so
// there is no such slot rather than an inert subscription.
export function createElectronPowerBackends(electron: ElectronApi): ElectronPowerCapabilities {
  const powerMonitor = electron.powerMonitor;
  const powerSaveBlocker = electron.powerSaveBlocker;
  let blockerId = -1;

  const backends = allocateEntity<ElectronPowerCapabilities>();
  backends.batteryHealth = (() => {
    const b = allocateEntity<PowerBatteryHealthBackend>();
    b.getBatteryHealth = (out: PowerBatteryHealth): PowerBatteryHealth => {
      return out;
    };
    return finishEntity(b);
  })();
  backends.change = (() => {
    const b = allocateEntity<PowerChangeBackend>();
    b.subscribe = (listener: () => void): (() => void) => {
      powerMonitor.on('on-battery', listener);
      powerMonitor.on('on-ac', listener);
      return () => {
        powerMonitor.removeListener('on-battery', listener);
        powerMonitor.removeListener('on-ac', listener);
      };
    };
    return finishEntity(b);
  })();
  backends.idle = (() => {
    const b = allocateEntity<PowerIdleBackend>();
    b.getIdleState = (thresholdSeconds: number): PowerIdleState => {
      return toIdleState(powerMonitor.getSystemIdleState(thresholdSeconds));
    };
    b.getIdleTimeSeconds = (): number => {
      return powerMonitor.getSystemIdleTime();
    };
    return finishEntity(b);
  })();
  backends.keepAwake = (() => {
    const b = allocateEntity<PowerKeepAwakeBackend>();
    b.acquire = (mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult> => {
      if (blockerId >= 0) return Promise.resolve({ reason: 'ok' });
      try {
        blockerId = powerSaveBlocker.start(
          mode === 'PreventAppSuspension' ? 'prevent-app-suspension' : 'prevent-display-sleep',
        );
        return Promise.resolve({ reason: 'ok' });
      } catch {
        return Promise.resolve({ reason: 'failed' });
      }
    };
    b.destroy = (): void => {
      if (blockerId >= 0) {
        powerSaveBlocker.stop(blockerId);
        blockerId = -1;
      }
    };
    b.isActive = (): boolean => {
      return blockerId >= 0;
    };
    b.release = (): Promise<PowerKeepAwakeReleaseResult> => {
      if (blockerId < 0) return Promise.resolve({ reason: 'inactive' });
      try {
        powerSaveBlocker.stop(blockerId);
      } catch {
        // State is not cleared: the blocker may still be running.
        return Promise.resolve({ reason: 'failed' });
      }
      blockerId = -1;
      return Promise.resolve({ reason: 'ok' });
    };
    return finishEntity(b);
  })();
  backends.sessionLock = (() => {
    const b = allocateEntity<PowerSessionLockBackend>();
    b.subscribeLock = (listener: () => void): (() => void) => {
      powerMonitor.on('lock-screen', listener);
      return () => powerMonitor.removeListener('lock-screen', listener);
    };
    b.subscribeUnlock = (listener: () => void): (() => void) => {
      powerMonitor.on('unlock-screen', listener);
      return () => powerMonitor.removeListener('unlock-screen', listener);
    };
    return finishEntity(b);
  })();
  backends.status = (() => {
    const b = allocateEntity<PowerStatusBackend>();
    b.getStatus = (out: PowerStatus): PowerStatus => {
      const onBattery = powerMonitor.onBatteryPower === true;
      out.batteryLevel = -1;
      out.chargingTime = -1;
      out.dischargingTime = -1;
      out.isBatteryLow = false;
      out.isCharging = !onBattery;
      out.isLowPower = false;
      out.isOnBattery = onBattery;
      out.thermalState = readThermalState(powerMonitor);
      return out;
    };
    return finishEntity(b);
  })();
  backends.suspension = (() => {
    const b = allocateEntity<PowerSuspensionBackend>();
    b.subscribeResume = (listener: () => void): (() => void) => {
      powerMonitor.on('resume', listener);
      return () => powerMonitor.removeListener('resume', listener);
    };
    b.subscribeSuspend = (listener: () => void): (() => void) => {
      powerMonitor.on('suspend', listener);
      return () => powerMonitor.removeListener('suspend', listener);
    };
    return finishEntity(b);
  })();

  // ★ THE SLOT EXISTS ONLY IF THE STATE IS READABLE. Electron's thermal-state-change event carries no
  // payload, so an installed API without getCurrentThermalState could only announce that something
  // unobservable had changed. Where the getter is absent the slot is OMITTED and the gap is real,
  // rather than shipping a void event whose state is permanently 'Unknown'.
  if (typeof powerMonitor.getCurrentThermalState !== 'function') return finishEntity(backends);

  backends.thermal = (() => {
    const b = allocateEntity<PowerThermalBackend>();
    b.getThermalState = (): PowerThermalState => {
      return readThermalState(powerMonitor);
    };
    b.subscribeThermalStateChange = (listener: (state: PowerThermalState) => void): (() => void) => {
      // The state is read at notification time and DELIVERED, so the event is actionable.
      const onChange = (): void => listener(readThermalState(powerMonitor));
      powerMonitor.on('thermal-state-change', onChange);
      return () => powerMonitor.removeListener('thermal-state-change', onChange);
    };
    return finishEntity(b);
  })();
  return finishEntity(backends);
}

function readThermalState(powerMonitor: ElectronApi['powerMonitor']): PowerThermalState {
  const state = powerMonitor.getCurrentThermalState?.();
  if (state === 'nominal') return 'Nominal';
  if (state === 'fair') return 'Fair';
  if (state === 'serious') return 'Serious';
  if (state === 'critical') return 'Critical';
  return 'Unknown';
}

function toIdleState(state: 'active' | 'idle' | 'locked' | 'unknown'): PowerIdleState {
  if (state === 'active') return 'Active';
  if (state === 'idle' || state === 'locked') return 'Idle';
  return 'Unknown';
}
