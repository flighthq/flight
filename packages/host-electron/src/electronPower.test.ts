import type { PowerStatus, ElectronApi } from '@flighthq/types';

import { createElectronPowerBackend } from './electronPower';

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

function fakeElectron(options: { onBatteryPower?: boolean; startId?: number }): {
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

describe('createElectronPowerBackend', () => {
  it('getStatus reports no battery level and infers charging from AC power', () => {
    const onAc = createElectronPowerBackend(fakeElectron({ onBatteryPower: false }).electron);
    const status = onAc.getStatus(emptyStatus());
    expect(status).toEqual({
      batteryLevel: -1,
      chargingTime: -1,
      dischargingTime: -1,
      isBatteryLow: false,
      isCharging: true,
      isLowPower: false,
      isOnBattery: false,
      thermalState: 'Unknown',
    });
    const onBattery = createElectronPowerBackend(fakeElectron({ onBatteryPower: true }).electron);
    const batteryStatus = onBattery.getStatus(emptyStatus());
    expect(batteryStatus.isCharging).toBe(false);
    expect(batteryStatus.isOnBattery).toBe(true);
  });

  it('subscribe wires both AC and battery events and unsubscribes both', () => {
    const { electron, monitorListeners } = fakeElectron({});
    const backend = createElectronPowerBackend(electron);
    const unsubscribe = backend.subscribe(() => {});
    expect(monitorListeners.get('on-battery')?.size).toBe(1);
    expect(monitorListeners.get('on-ac')?.size).toBe(1);
    unsubscribe();
    expect(monitorListeners.get('on-battery')?.size).toBe(0);
    expect(monitorListeners.get('on-ac')?.size).toBe(0);
  });

  it('subscribeSuspend and subscribeResume register and remove their listeners', () => {
    const { electron, monitorListeners } = fakeElectron({});
    const backend = createElectronPowerBackend(electron);
    const unsubSuspend = backend.subscribeSuspend(() => {});
    const unsubResume = backend.subscribeResume(() => {});
    expect(monitorListeners.get('suspend')?.size).toBe(1);
    expect(monitorListeners.get('resume')?.size).toBe(1);
    unsubSuspend();
    unsubResume();
    expect(monitorListeners.get('suspend')?.size).toBe(0);
    expect(monitorListeners.get('resume')?.size).toBe(0);
  });

  it('setKeepAwake starts a single blocker and stops it when disabled', () => {
    const { electron, blocker } = fakeElectron({ startId: 42 });
    const backend = createElectronPowerBackend(electron);
    expect(backend.setKeepAwake(true)).toBe(true);
    expect(blocker.started).toEqual([42]);
    // Already held — no second blocker, returns the requested state.
    expect(backend.setKeepAwake(true)).toBe(true);
    expect(blocker.started).toEqual([42]);
    expect(backend.setKeepAwake(false)).toBe(true);
    expect(blocker.stopped).toEqual([42]);
    // Already released.
    expect(backend.setKeepAwake(false)).toBe(false);
  });
});
