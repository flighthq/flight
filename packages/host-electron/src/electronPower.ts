import { createEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
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
export function createElectronPowerBackends(electron: ElectronApi): {
  batteryHealth: PowerBatteryHealthBackend;
  change: PowerChangeBackend;
  idle: PowerIdleBackend;
  keepAwake: PowerKeepAwakeBackend;
  sessionLock: PowerSessionLockBackend;
  status: PowerStatusBackend;
  suspension: PowerSuspensionBackend;
  thermal?: PowerThermalBackend;
} {
  const powerMonitor = electron.powerMonitor;
  const powerSaveBlocker = electron.powerSaveBlocker;
  let blockerId = -1;

  const backends = {
    // The main process reports no battery detail, so every field stays at the domain's unknown
    // encoding. The slot exists because Electron IS the host that would carry it once available.
    batteryHealth: createEntity<PowerBatteryHealthBackend>({
      getBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth {
        return out;
      },
    }),
    change: createEntity<PowerChangeBackend>({
      subscribe(listener: () => void): () => void {
        powerMonitor.on('on-battery', listener);
        powerMonitor.on('on-ac', listener);
        return () => {
          powerMonitor.removeListener('on-battery', listener);
          powerMonitor.removeListener('on-ac', listener);
        };
      },
    }),
    idle: createEntity<PowerIdleBackend>({
      getIdleState(thresholdSeconds: number): PowerIdleState {
        return toIdleState(powerMonitor.getSystemIdleState(thresholdSeconds));
      },
      getIdleTimeSeconds(): number {
        return powerMonitor.getSystemIdleTime();
      },
    }),
    // powerSaveBlocker is synchronous; it lifts into the common async result by resolving immediately,
    // so a caller writes one code path for every host.
    keepAwake: createEntity<PowerKeepAwakeBackend>({
      acquire(mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult> {
        if (blockerId >= 0) return Promise.resolve({ reason: 'ok' });
        try {
          blockerId = powerSaveBlocker.start(
            mode === 'PreventAppSuspension' ? 'prevent-app-suspension' : 'prevent-display-sleep',
          );
          return Promise.resolve({ reason: 'ok' });
        } catch {
          return Promise.resolve({ reason: 'failed' });
        }
      },
      destroy(): void {
        if (blockerId >= 0) {
          powerSaveBlocker.stop(blockerId);
          blockerId = -1;
        }
      },
      isActive(): boolean {
        return blockerId >= 0;
      },
      release(): Promise<PowerKeepAwakeReleaseResult> {
        if (blockerId < 0) return Promise.resolve({ reason: 'inactive' });
        try {
          powerSaveBlocker.stop(blockerId);
        } catch {
          // State is not cleared: the blocker may still be running.
          return Promise.resolve({ reason: 'failed' });
        }
        blockerId = -1;
        return Promise.resolve({ reason: 'ok' });
      },
    }),
    sessionLock: createEntity<PowerSessionLockBackend>({
      subscribeLock(listener: () => void): () => void {
        powerMonitor.on('lock-screen', listener);
        return () => powerMonitor.removeListener('lock-screen', listener);
      },
      subscribeUnlock(listener: () => void): () => void {
        powerMonitor.on('unlock-screen', listener);
        return () => powerMonitor.removeListener('unlock-screen', listener);
      },
    }),
    status: createEntity<PowerStatusBackend>({
      getStatus(out: PowerStatus): PowerStatus {
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
      },
    }),
    suspension: createEntity<PowerSuspensionBackend>({
      subscribeResume(listener: () => void): () => void {
        powerMonitor.on('resume', listener);
        return () => powerMonitor.removeListener('resume', listener);
      },
      subscribeSuspend(listener: () => void): () => void {
        powerMonitor.on('suspend', listener);
        return () => powerMonitor.removeListener('suspend', listener);
      },
    }),
  };

  // ★ THE SLOT EXISTS ONLY IF THE STATE IS READABLE. Electron's thermal-state-change event carries no
  // payload, so an installed API without getCurrentThermalState could only announce that something
  // unobservable had changed. Where the getter is absent the slot is OMITTED and the gap is real,
  // rather than shipping a void event whose state is permanently 'Unknown'.
  if (typeof powerMonitor.getCurrentThermalState !== 'function') return backends;

  return {
    ...backends,
    thermal: createEntity<PowerThermalBackend>({
      getThermalState(): PowerThermalState {
        return readThermalState(powerMonitor);
      },
      subscribeThermalStateChange(listener: (state: PowerThermalState) => void): () => void {
        // The state is read at notification time and DELIVERED, so the event is actionable.
        const onChange = (): void => listener(readThermalState(powerMonitor));
        powerMonitor.on('thermal-state-change', onChange);
        return () => powerMonitor.removeListener('thermal-state-change', onChange);
      },
    }),
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
