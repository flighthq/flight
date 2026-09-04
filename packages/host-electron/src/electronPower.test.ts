import type { PowerStatus, ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createElectronPowerBackends,
  initializeElectronPowerCapabilities,
  initializePowerBatteryHealthBackend,
  initializePowerChangeBackend,
  initializePowerIdleBackend,
  initializePowerKeepAwakeBackend,
  initializePowerSessionLockBackend,
  initializePowerStatusBackend,
  initializePowerSuspensionBackend,
  initializePowerThermalBackend,
} from './electronPower';

function emptyStatus(): PowerStatus {
  return {
    batteryLevel: 0,
    chargingTime: 0,
    dischargingTime: 0,
    isBatteryLow: false,
    isCharging: false,
    isLowPower: false,
    isOnBattery: false,
    thermalState: 'Unknown',
  };
}

function fakeElectron(options: { onBatteryPower?: boolean; startId?: number; thermal?: string | null }): {
  electron: ElectronApi;
  monitorListeners: Map<string, Set<() => void>>;
  blocker: { started: number[]; stopped: number[] };
} {
  const monitorListeners = new Map<string, Set<() => void>>();
  const blocker = { started: [] as number[], stopped: [] as number[] };
  let nextId = options.startId ?? 7;
  const electron = {
    powerMonitor: {
      onBatteryPower: options.onBatteryPower,
      getSystemIdleState: () => 'active',
      getSystemIdleTime: () => 11,
      // `null` models an installed Electron whose powerMonitor has no thermal getter at all.
      getCurrentThermalState: options.thermal === null ? undefined : () => options.thermal ?? 'nominal',
      on: (event: string, listener: () => void) => {
        if (!monitorListeners.has(event)) monitorListeners.set(event, new Set());
        monitorListeners.get(event)?.add(listener);
      },
      removeListener: (event: string, listener: () => void) => {
        monitorListeners.get(event)?.delete(listener);
      },
    },
    powerSaveBlocker: {
      start: () => {
        const id = nextId++;
        blocker.started.push(id);
        return id;
      },
      stop: (id: number) => {
        blocker.stopped.push(id);
      },
      isStarted: () => true,
    },
  } as unknown as ElectronApi;
  return { electron, monitorListeners, blocker };
}

describe('createElectronPowerBackends', () => {
  it('returns Entity-composed slots', () => {
    const slots = createElectronPowerBackends(fakeElectron({}).electron);
    expect(EntityRuntimeKey in slots).toBe(true);
    for (const provider of Object.values(slots)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('getStatus reports no battery level and infers charging from AC power', () => {
    const onAc = createElectronPowerBackends(fakeElectron({ onBatteryPower: false }).electron);
    const status = onAc.status.getStatus(emptyStatus());
    expect(status.batteryLevel).toBe(-1);
    expect(status.isCharging).toBe(true);
    expect(status.isOnBattery).toBe(false);
  });

  it('reads a real thermal state rather than a hardcoded Unknown', () => {
    const slots = createElectronPowerBackends(fakeElectron({ thermal: 'serious' }).electron);
    expect(slots.status.getStatus(emptyStatus()).thermalState).toBe('Serious');
    expect(slots.thermal?.getThermalState()).toBe('Serious');
  });

  // ★ The event DELIVERS the state. A void "something changed" notification whose level the caller
  // cannot then read is not an actionable capability.
  it('delivers the thermal state as the subscription payload', () => {
    const { electron, monitorListeners } = fakeElectron({ thermal: 'critical' });
    const slots = createElectronPowerBackends(electron);
    const seen: string[] = [];
    const stop = slots.thermal!.subscribeThermalStateChange((state) => seen.push(state));
    for (const l of monitorListeners.get('thermal-state-change') ?? []) l();
    expect(seen).toEqual(['Critical']);
    stop();
    for (const l of monitorListeners.get('thermal-state-change') ?? []) l();
    expect(seen).toEqual(['Critical']);
  });

  // ★ If the installed Electron cannot report the level, the slot is OMITTED and the gap is real.
  it('omits the thermal slot entirely when the platform cannot report the level', () => {
    const slots = createElectronPowerBackends(fakeElectron({ thermal: null }).electron);
    expect(slots.thermal).toBeUndefined();
  });

  it('brackets session lock and unlock through the same mechanism', () => {
    const { electron, monitorListeners } = fakeElectron({});
    const slots = createElectronPowerBackends(electron);
    let locked = 0;
    let unlocked = 0;
    const stopLock = slots.sessionLock.subscribeLock(() => locked++);
    const stopUnlock = slots.sessionLock.subscribeUnlock(() => unlocked++);
    for (const l of monitorListeners.get('lock-screen') ?? []) l();
    for (const l of monitorListeners.get('unlock-screen') ?? []) l();
    expect([locked, unlocked]).toEqual([1, 1]);
    stopLock();
    stopUnlock();
    expect(monitorListeners.get('lock-screen')?.size).toBe(0);
    expect(monitorListeners.get('unlock-screen')?.size).toBe(0);
  });

  it('lifts the synchronous blocker into the common async result', async () => {
    const { electron, blocker } = fakeElectron({ startId: 3 });
    const slots = createElectronPowerBackends(electron);
    await expect(slots.keepAwake.acquire('PreventDisplaySleep')).resolves.toEqual({ reason: 'ok' });
    expect(slots.keepAwake.isActive()).toBe(true);
    await expect(slots.keepAwake.release()).resolves.toEqual({ reason: 'ok' });
    expect(blocker.stopped).toEqual([3]);
    // Releasing nothing is an ordinary outcome, reported distinctly from ok.
    await expect(slots.keepAwake.release()).resolves.toEqual({ reason: 'inactive' });
  });

  it('reports idle state and time from the platform', () => {
    const slots = createElectronPowerBackends(fakeElectron({}).electron);
    expect(slots.idle.getIdleState(60)).toBe('Active');
    expect(slots.idle.getIdleTimeSeconds()).toBe(11);
  });
});

describe('electron power slot coverage', () => {
  // ★ EXACT SLOT COVERAGE for E, including the conditional thermal slot.
  it('offers every slot when the platform reports thermal state', () => {
    const slots = createElectronPowerBackends(fakeElectron({}).electron);
    expect(Object.keys(slots).sort()).toEqual([
      'batteryHealth',
      'change',
      'idle',
      'keepAwake',
      'sessionLock',
      'status',
      'suspension',
      'thermal',
    ]);
  });

  it('drops only the thermal slot when the platform cannot report the level', () => {
    const slots = createElectronPowerBackends(fakeElectron({ thermal: null }).electron);
    expect(Object.keys(slots).sort()).toEqual([
      'batteryHealth',
      'change',
      'idle',
      'keepAwake',
      'sessionLock',
      'status',
      'suspension',
    ]);
  });

  it('declares a teardown obligation on keepAwake alone', () => {
    const slots = createElectronPowerBackends(fakeElectron({}).electron);
    expect(typeof slots.keepAwake.destroy).toBe('function');
    expect('destroy' in slots.sessionLock).toBe(false);
    expect('destroy' in slots.status).toBe(false);
  });
});
describe('initializeElectronPowerCapabilities', () => {
  it('is the construction initializer of createElectronPowerCapabilities', () => {
    expect(typeof initializeElectronPowerCapabilities).toBe('function');
  });
});

describe('initializePowerBatteryHealthBackend', () => {
  it('is the construction initializer of createPowerBatteryHealthBackend', () => {
    expect(typeof initializePowerBatteryHealthBackend).toBe('function');
  });
});

describe('initializePowerChangeBackend', () => {
  it('is the construction initializer of createPowerChangeBackend', () => {
    expect(typeof initializePowerChangeBackend).toBe('function');
  });
});

describe('initializePowerIdleBackend', () => {
  it('is the construction initializer of createPowerIdleBackend', () => {
    expect(typeof initializePowerIdleBackend).toBe('function');
  });
});

describe('initializePowerKeepAwakeBackend', () => {
  it('is the construction initializer of createPowerKeepAwakeBackend', () => {
    expect(typeof initializePowerKeepAwakeBackend).toBe('function');
  });
});

describe('initializePowerSessionLockBackend', () => {
  it('is the construction initializer of createPowerSessionLockBackend', () => {
    expect(typeof initializePowerSessionLockBackend).toBe('function');
  });
});

describe('initializePowerStatusBackend', () => {
  it('is the construction initializer of createPowerStatusBackend', () => {
    expect(typeof initializePowerStatusBackend).toBe('function');
  });
});

describe('initializePowerSuspensionBackend', () => {
  it('is the construction initializer of createPowerSuspensionBackend', () => {
    expect(typeof initializePowerSuspensionBackend).toBe('function');
  });
});

describe('initializePowerThermalBackend', () => {
  it('is the construction initializer of createPowerThermalBackend', () => {
    expect(typeof initializePowerThermalBackend).toBe('function');
  });
});
