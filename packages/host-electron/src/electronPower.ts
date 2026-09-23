import type {
  ElectronApi,
  ElectronPowerCapabilities,
  HostPowerBatteryHealthCapability,
  HostPowerChangeCapability,
  HostPowerIdleCapability,
  HostPowerKeepAwakeCapability,
  HostPowerSessionLockCapability,
  HostPowerStatusCapability,
  HostPowerSuspensionCapability,
  HostPowerThermalCapability,
  PowerBatteryHealth,
  PowerIdleState,
  PowerKeepAwakeAcquireResult,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types/contract';

function finishProvider<Provider>(populate: (out: Provider) => void): Provider {
  const out = {} as Provider;
  populate(out);
  return out;
}

// Maps Flight's power slots onto Electron's powerMonitor and powerSaveBlocker. Built together because
// keepAwake shares one blocker id across acquire/release; the slots stay separate because their shapes
// and their coverage differ.
//
// Electron omits nothing here except low-power mode, which its powerMonitor cannot report at all — so
// there is no such slot rather than an inert subscription.
export function electronHostPower(electron: ElectronApi): ElectronPowerCapabilities {
  const providers = {} as { -readonly [K in keyof ElectronPowerCapabilities]: ElectronPowerCapabilities[K] };
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
  return Object.freeze(providers) as ElectronPowerCapabilities;
}

export function electronHostPowerBatteryHealth(_electron: ElectronApi): HostPowerBatteryHealthCapability {
  return finishProvider(populateElectronHostPowerBatteryHealth);
}

export function electronHostPowerChange(electron: ElectronApi): HostPowerChangeCapability {
  return finishProvider((out) => populateElectronHostPowerChange(out, electron.powerMonitor));
}

export function electronHostPowerIdle(electron: ElectronApi): HostPowerIdleCapability {
  return finishProvider((out) => populateElectronHostPowerIdle(out, electron.powerMonitor));
}

export function electronHostPowerKeepAwake(electron: ElectronApi): HostPowerKeepAwakeCapability {
  return finishProvider((out) => populateElectronHostPowerKeepAwake(out, electron.powerSaveBlocker));
}

export function electronHostPowerSessionLock(electron: ElectronApi): HostPowerSessionLockCapability {
  return finishProvider((out) => populateElectronHostPowerSessionLock(out, electron.powerMonitor));
}

export function electronHostPowerStatus(electron: ElectronApi): HostPowerStatusCapability {
  return finishProvider((out) => populateElectronHostPowerStatus(out, electron.powerMonitor));
}

export function electronHostPowerSuspension(electron: ElectronApi): HostPowerSuspensionCapability {
  return finishProvider((out) => populateElectronHostPowerSuspension(out, electron.powerMonitor));
}

export function electronHostPowerThermal(electron: ElectronApi): HostPowerThermalCapability | undefined {
  if (typeof electron.powerMonitor.getCurrentThermalState !== 'function') return undefined;
  return finishProvider<HostPowerThermalCapability>((out) =>
    populateElectronHostPowerThermal(out, electron.powerMonitor),
  );
}

export function populateElectronHostPower(
  out: { -readonly [K in keyof ElectronPowerCapabilities]: ElectronPowerCapabilities[K] },
  batteryHealth: HostPowerBatteryHealthCapability,
  change: HostPowerChangeCapability,
  idle: HostPowerIdleCapability,
  keepAwake: HostPowerKeepAwakeCapability,
  sessionLock: HostPowerSessionLockCapability,
  status: HostPowerStatusCapability,
  suspension: HostPowerSuspensionCapability,
): void {
  out.batteryHealth = batteryHealth;
  out.change = change;
  out.idle = idle;
  out.keepAwake = keepAwake;
  out.sessionLock = sessionLock;
  out.status = status;
  out.suspension = suspension;
}

export function populateElectronHostPowerBatteryHealth(out: HostPowerBatteryHealthCapability): void {
  out.getBatteryHealth = (out: PowerBatteryHealth): PowerBatteryHealth => {
    return out;
  };
}

export function populateElectronHostPowerChange(
  out: HostPowerChangeCapability,
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
  out: HostPowerIdleCapability,
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
  out: HostPowerKeepAwakeCapability,
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
  out: HostPowerSessionLockCapability,
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
  out: HostPowerStatusCapability,
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
  out: HostPowerSuspensionCapability,
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
  out: HostPowerThermalCapability,
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
