import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronPowerCapabilities,
  PowerBatteryHealth,
  HostPowerBatteryHealthProvider,
  HostPowerChangeProvider,
  HostPowerIdleProvider,
  PowerIdleState,
  PowerKeepAwakeAcquireResult,
  HostPowerKeepAwakeProvider,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  HostPowerSessionLockProvider,
  PowerStatus,
  HostPowerStatusProvider,
  HostPowerSuspensionProvider,
  HostPowerThermalProvider,
  PowerThermalState,
  Entity,
  EntityConstruction,
} from '@flighthq/types/contract';

function finishProvider<Provider extends Entity>(populate: (out: EntityConstruction<Provider>) => void): Provider {
  const out = allocateEntity<Provider>();
  populate(out);
  return finishEntity(out);
}

// Maps Flight's power slots onto Electron's powerMonitor and powerSaveBlocker. Built together because
// keepAwake shares one blocker id across acquire/release; the slots stay separate because their shapes
// and their coverage differ.
//
// Electron omits nothing here except low-power mode, which its powerMonitor cannot report at all — so
// there is no such slot rather than an inert subscription.
export function electronHostPower(electron: ElectronApi): ElectronPowerCapabilities {
  const providers = allocateEntity<ElectronPowerCapabilities>();
  populateElectronHostPower(
    providers,
    electronHostPowerBatteryHealth(electron),
    electronHostPowerChange(electron),
    electronHostPowerIdle(electron),
    electronHostPowerKeepAwake(electron),
    electronHostPowerSessionLock(electron),
    electronHostPowerStatus(electron),
    electronHostPowerSuspension(electron),
  );

  // ★ THE SLOT EXISTS ONLY IF THE STATE IS READABLE. Electron's thermal-state-change event carries no
  // payload, so an installed API without getCurrentThermalState could only announce that something
  // unobservable had changed. Where the getter is absent the slot is OMITTED and the gap is real,
  // rather than shipping a void event whose state is permanently 'Unknown'.
  const thermal = electronHostPowerThermal(electron);
  if (thermal !== undefined) providers.thermal = thermal;
  return finishEntity(providers);
}

export function electronHostPowerBatteryHealth(_electron: ElectronApi): HostPowerBatteryHealthProvider {
  return finishProvider(populateElectronHostPowerBatteryHealth);
}

export function electronHostPowerChange(electron: ElectronApi): HostPowerChangeProvider {
  return finishProvider((out) => populateElectronHostPowerChange(out, electron.powerMonitor));
}

export function electronHostPowerIdle(electron: ElectronApi): HostPowerIdleProvider {
  return finishProvider((out) => populateElectronHostPowerIdle(out, electron.powerMonitor));
}

export function electronHostPowerKeepAwake(electron: ElectronApi): HostPowerKeepAwakeProvider {
  return finishProvider((out) => populateElectronHostPowerKeepAwake(out, electron.powerSaveBlocker));
}

export function electronHostPowerSessionLock(electron: ElectronApi): HostPowerSessionLockProvider {
  return finishProvider((out) => populateElectronHostPowerSessionLock(out, electron.powerMonitor));
}

export function electronHostPowerStatus(electron: ElectronApi): HostPowerStatusProvider {
  return finishProvider((out) => populateElectronHostPowerStatus(out, electron.powerMonitor));
}

export function electronHostPowerSuspension(electron: ElectronApi): HostPowerSuspensionProvider {
  return finishProvider((out) => populateElectronHostPowerSuspension(out, electron.powerMonitor));
}

export function electronHostPowerThermal(electron: ElectronApi): HostPowerThermalProvider | undefined {
  if (typeof electron.powerMonitor.getCurrentThermalState !== 'function') return undefined;
  return finishProvider<HostPowerThermalProvider>((out) =>
    populateElectronHostPowerThermal(out, electron.powerMonitor),
  );
}

export function populateElectronHostPower(
  out: EntityConstruction<ElectronPowerCapabilities>,
  batteryHealth: HostPowerBatteryHealthProvider,
  change: HostPowerChangeProvider,
  idle: HostPowerIdleProvider,
  keepAwake: HostPowerKeepAwakeProvider,
  sessionLock: HostPowerSessionLockProvider,
  status: HostPowerStatusProvider,
  suspension: HostPowerSuspensionProvider,
): void {
  out.batteryHealth = batteryHealth;
  out.change = change;
  out.idle = idle;
  out.keepAwake = keepAwake;
  out.sessionLock = sessionLock;
  out.status = status;
  out.suspension = suspension;
}

export function populateElectronHostPowerBatteryHealth(out: EntityConstruction<HostPowerBatteryHealthProvider>): void {
  out.getBatteryHealth = (out: PowerBatteryHealth): PowerBatteryHealth => {
    return out;
  };
}

export function populateElectronHostPowerChange(
  out: EntityConstruction<HostPowerChangeProvider>,
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

export function populateElectronHostPowerIdle(
  out: EntityConstruction<HostPowerIdleProvider>,
  powerMonitor: ElectronApi['powerMonitor'],
): void {
  out.getIdleState = (thresholdSeconds: number): PowerIdleState => {
    return toIdleState(powerMonitor.getSystemIdleState(thresholdSeconds));
  };
  out.getIdleTimeSeconds = (): number => {
    return powerMonitor.getSystemIdleTime();
  };
}

export function populateElectronHostPowerKeepAwake(
  out: EntityConstruction<HostPowerKeepAwakeProvider>,
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

export function populateElectronHostPowerSessionLock(
  out: EntityConstruction<HostPowerSessionLockProvider>,
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

export function populateElectronHostPowerStatus(
  out: EntityConstruction<HostPowerStatusProvider>,
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

export function populateElectronHostPowerSuspension(
  out: EntityConstruction<HostPowerSuspensionProvider>,
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

export function populateElectronHostPowerThermal(
  out: EntityConstruction<HostPowerThermalProvider>,
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
