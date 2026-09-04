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
  EntityConstruction,
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

  const batteryHealth = (() => {
    const b = allocateEntity<PowerBatteryHealthBackend>();
    initializePowerBatteryHealthBackend(b);
    return finishEntity(b);
  })();
  const change = (() => {
    const b = allocateEntity<PowerChangeBackend>();
    initializePowerChangeBackend(b, powerMonitor);
    return finishEntity(b);
  })();
  const idle = (() => {
    const b = allocateEntity<PowerIdleBackend>();
    initializePowerIdleBackend(b, powerMonitor);
    return finishEntity(b);
  })();
  const keepAwake = (() => {
    const b = allocateEntity<PowerKeepAwakeBackend>();
    initializePowerKeepAwakeBackend(b, powerSaveBlocker);
    return finishEntity(b);
  })();
  const sessionLock = (() => {
    const b = allocateEntity<PowerSessionLockBackend>();
    initializePowerSessionLockBackend(b, powerMonitor);
    return finishEntity(b);
  })();
  const status = (() => {
    const b = allocateEntity<PowerStatusBackend>();
    initializePowerStatusBackend(b, powerMonitor);
    return finishEntity(b);
  })();
  const suspension = (() => {
    const b = allocateEntity<PowerSuspensionBackend>();
    initializePowerSuspensionBackend(b, powerMonitor);
    return finishEntity(b);
  })();

  const backends = allocateEntity<ElectronPowerCapabilities>();
  initializeElectronPowerCapabilities(
    backends,
    batteryHealth,
    change,
    idle,
    keepAwake,
    sessionLock,
    status,
    suspension,
  );

  // ★ THE SLOT EXISTS ONLY IF THE STATE IS READABLE. Electron's thermal-state-change event carries no
  // payload, so an installed API without getCurrentThermalState could only announce that something
  // unobservable had changed. Where the getter is absent the slot is OMITTED and the gap is real,
  // rather than shipping a void event whose state is permanently 'Unknown'.
  if (typeof powerMonitor.getCurrentThermalState !== 'function') return finishEntity(backends);

  backends.thermal = (() => {
    const b = allocateEntity<PowerThermalBackend>();
    initializePowerThermalBackend(b, powerMonitor);
    return finishEntity(b);
  })();
  return finishEntity(backends);
}

export function initializeElectronPowerCapabilities(
  out: EntityConstruction<ElectronPowerCapabilities>,
  batteryHealth: PowerBatteryHealthBackend,
  change: PowerChangeBackend,
  idle: PowerIdleBackend,
  keepAwake: PowerKeepAwakeBackend,
  sessionLock: PowerSessionLockBackend,
  status: PowerStatusBackend,
  suspension: PowerSuspensionBackend,
): void {
  out.batteryHealth = batteryHealth;
  out.change = change;
  out.idle = idle;
  out.keepAwake = keepAwake;
  out.sessionLock = sessionLock;
  out.status = status;
  out.suspension = suspension;
}

export function initializePowerBatteryHealthBackend(out: EntityConstruction<PowerBatteryHealthBackend>): void {
  out.getBatteryHealth = (out: PowerBatteryHealth): PowerBatteryHealth => {
    return out;
  };
}

export function initializePowerChangeBackend(
  out: EntityConstruction<PowerChangeBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.subscribe = (listener: () => void): (() => void) => {
    powerMonitor.on('on-battery', listener);
    powerMonitor.on('on-ac', listener);
    return () => {
      powerMonitor.removeListener('on-battery', listener);
      powerMonitor.removeListener('on-ac', listener);
    };
  };
}

export function initializePowerIdleBackend(
  out: EntityConstruction<PowerIdleBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.getIdleState = (thresholdSeconds: number): PowerIdleState => {
    return toIdleState(powerMonitor.getSystemIdleState(thresholdSeconds));
  };
  out.getIdleTimeSeconds = (): number => {
    return powerMonitor.getSystemIdleTime();
  };
}

export function initializePowerKeepAwakeBackend(
  out: EntityConstruction<PowerKeepAwakeBackend>,
  powerSaveBlocker: ElectronApi['powerSaveBlocker'],
): void {
  let blockerId = -1;
  out.acquire = (mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult> => {
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
  out.destroy = (): void => {
    if (blockerId >= 0) {
      powerSaveBlocker.stop(blockerId);
      blockerId = -1;
    }
  };
  out.isActive = (): boolean => {
    return blockerId >= 0;
  };
  out.release = (): Promise<PowerKeepAwakeReleaseResult> => {
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
}

export function initializePowerSessionLockBackend(
  out: EntityConstruction<PowerSessionLockBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.subscribeLock = (listener: () => void): (() => void) => {
    powerMonitor.on('lock-screen', listener);
    return () => powerMonitor.removeListener('lock-screen', listener);
  };
  out.subscribeUnlock = (listener: () => void): (() => void) => {
    powerMonitor.on('unlock-screen', listener);
    return () => powerMonitor.removeListener('unlock-screen', listener);
  };
}

export function initializePowerStatusBackend(
  out: EntityConstruction<PowerStatusBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.getStatus = (out: PowerStatus): PowerStatus => {
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
}

export function initializePowerSuspensionBackend(
  out: EntityConstruction<PowerSuspensionBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.subscribeResume = (listener: () => void): (() => void) => {
    powerMonitor.on('resume', listener);
    return () => powerMonitor.removeListener('resume', listener);
  };
  out.subscribeSuspend = (listener: () => void): (() => void) => {
    powerMonitor.on('suspend', listener);
    return () => powerMonitor.removeListener('suspend', listener);
  };
}

export function initializePowerThermalBackend(
  out: EntityConstruction<PowerThermalBackend>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.getThermalState = (): PowerThermalState => {
    return readThermalState(powerMonitor);
  };
  out.subscribeThermalStateChange = (listener: (state: PowerThermalState) => void): (() => void) => {
    // The state is read at notification time and DELIVERED, so the event is actionable.
    const onChange = (): void => listener(readThermalState(powerMonitor));
    powerMonitor.on('thermal-state-change', onChange);
    return () => powerMonitor.removeListener('thermal-state-change', onChange);
  };
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
