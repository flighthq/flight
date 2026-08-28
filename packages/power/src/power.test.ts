import { connectSignal } from '@flighthq/signals/contract';
import type { PowerBackend, PowerBatteryHealth, PowerStatus } from '@flighthq/types/contract';

import {
  attachPower,
  createPower,
  createPowerBatteryHealth,
  createPowerStatus,
  detachPower,
  disposePower,
  enablePowerSignals,
  explainPowerBackend,
  getPowerBackend,
  getPowerBatteryHealth,
  getPowerIdlePollingIntervalMs,
  getPowerStatus,
  getPowerSystemIdleState,
  getPowerSystemIdleTime,
  getPowerThermalState,
  hasPowerHostBackend,
  hasPowerKeepAwake,
  installPowerHostBackend,
  observePowerHostResult,
  resetPowerBackendForTest,
  setPowerBackend,
  setPowerIdlePollingIntervalMs,
  setPowerKeepAwake,
} from './power';

function fakeBackend(): PowerBackend & {
  charging: boolean;
  keepAwake: boolean;
  fire: () => void;
  fireLockScreen: () => void;
  fireLowPowerModeChange: () => void;
  fireResume: () => void;
  fireSuspend: () => void;
  fireThermalStateChange: () => void;
  fireUnlockScreen: () => void;
} {
  let listener: (() => void) | null = null;
  let lockListener: (() => void) | null = null;
  let lowPowerModeListener: (() => void) | null = null;
  let resumeListener: (() => void) | null = null;
  let suspendListener: (() => void) | null = null;
  let thermalListener: (() => void) | null = null;
  let unlockListener: (() => void) | null = null;
  return {
    charging: false,
    keepAwake: false,
    destroy() {},
    getBatteryHealth(_out) {
      return null;
    },
    isKeepAwakeActive() {
      return this.keepAwake;
    },
    getStatus(out) {
      out.batteryLevel = 0.5;
      out.chargingTime = -1;
      out.dischargingTime = 3600;
      out.isBatteryLow = false;
      out.isCharging = this.charging;
      out.isLowPower = false;
      out.isOnBattery = !this.charging;
      out.thermalState = 'Nominal';
      return out;
    },
    getSystemIdleState(_threshold) {
      return 'Active';
    },
    getSystemIdleTime() {
      return 42;
    },
    setKeepAwake(enabled) {
      this.keepAwake = enabled;
      return true;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    subscribeLockScreen(l) {
      lockListener = l;
      return () => {
        lockListener = null;
      };
    },
    subscribeLowPowerModeChange(l) {
      lowPowerModeListener = l;
      return () => {
        lowPowerModeListener = null;
      };
    },
    subscribeResume(l) {
      resumeListener = l;
      return () => {
        resumeListener = null;
      };
    },
    subscribeSuspend(l) {
      suspendListener = l;
      return () => {
        suspendListener = null;
      };
    },
    subscribeThermalStateChange(l) {
      thermalListener = l;
      return () => {
        thermalListener = null;
      };
    },
    subscribeUnlockScreen(l) {
      unlockListener = l;
      return () => {
        unlockListener = null;
      };
    },
    fire() {
      listener?.();
    },
    fireLockScreen() {
      lockListener?.();
    },
    fireLowPowerModeChange() {
      lowPowerModeListener?.();
    },
    fireResume() {
      resumeListener?.();
    },
    fireSuspend() {
      suspendListener?.();
    },
    fireThermalStateChange() {
      thermalListener?.();
    },
    fireUnlockScreen() {
      unlockListener?.();
    },
  };
}

afterEach(() => resetPowerBackendForTest());

describe('attachPower', () => {
  it('emits onChange and the charging transition signals', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let changes = 0;
    let charging = 0;
    connectSignal(power.onChange!, () => changes++);
    connectSignal(power.onCharging!, () => charging++);
    attachPower(power);
    backend.charging = true;
    backend.fire();
    expect(changes).toBe(1);
    expect(charging).toBe(1);
  });

  it('emits onSuspend and onResume when the backend fires them', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let suspends = 0;
    let resumes = 0;
    connectSignal(power.onSuspend!, () => suspends++);
    connectSignal(power.onResume!, () => resumes++);
    attachPower(power);
    backend.fireSuspend();
    backend.fireResume();
    expect(suspends).toBe(1);
    expect(resumes).toBe(1);
  });

  it('emits onLockScreen and onUnlockScreen when the backend fires them', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let locks = 0;
    let unlocks = 0;
    connectSignal(power.onLockScreen!, () => locks++);
    connectSignal(power.onUnlockScreen!, () => unlocks++);
    attachPower(power);
    backend.fireLockScreen();
    backend.fireUnlockScreen();
    expect(locks).toBe(1);
    expect(unlocks).toBe(1);
  });

  it('emits onLowPowerModeChange when the backend fires it', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let lowPowerChanges = 0;
    connectSignal(power.onLowPowerModeChange!, () => lowPowerChanges++);
    attachPower(power);
    backend.fireLowPowerModeChange();
    expect(lowPowerChanges).toBe(1);
  });

  it('emits onThermalStateChange when the backend fires it', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let thermalChanges = 0;
    connectSignal(power.onThermalStateChange!, () => thermalChanges++);
    attachPower(power);
    backend.fireThermalStateChange();
    expect(thermalChanges).toBe(1);
  });

  it('is idempotent — a second attach tears down the first subscription', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let changes = 0;
    connectSignal(power.onChange!, () => changes++);
    attachPower(power);
    attachPower(power);
    backend.fire();
    expect(changes).toBe(1);
  });

  it('polls onIdleStateChange when a listener is connected and state transitions', () => {
    vi.useFakeTimers();
    let idleState = 'Active';
    const backend = fakeBackend();
    backend.getSystemIdleState = () => idleState as ReturnType<typeof backend.getSystemIdleState>;
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let idleChanges = 0;
    connectSignal(power.onIdleStateChange!, () => idleChanges++);
    setPowerIdlePollingIntervalMs(100);
    attachPower(power, 30);
    // Change state and advance timer.
    idleState = 'Idle';
    vi.advanceTimersByTime(200);
    expect(idleChanges).toBeGreaterThanOrEqual(1);
    disposePower(power);
    vi.useRealTimers();
    // Restore default interval.
    setPowerIdlePollingIntervalMs(5000);
  });

  it('does not emit onIdleStateChange when no listener is connected', () => {
    vi.useFakeTimers();
    let idleState = 'Active';
    const backend = fakeBackend();
    backend.getSystemIdleState = () => idleState as ReturnType<typeof backend.getSystemIdleState>;
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    // Signals enabled but no listener connected.
    setPowerIdlePollingIntervalMs(100);
    attachPower(power, 30);
    idleState = 'Idle';
    vi.advanceTimersByTime(200);
    // No signal has slots so no emission, no error.
    expect(power.onIdleStateChange!.data).toBeNull();
    disposePower(power);
    vi.useRealTimers();
    setPowerIdlePollingIntervalMs(5000);
  });

  it('stops the idle polling interval after detach', () => {
    vi.useFakeTimers();
    let idleState = 'Active';
    let pollCount = 0;
    const backend = fakeBackend();
    backend.getSystemIdleState = () => {
      pollCount++;
      return idleState as ReturnType<typeof backend.getSystemIdleState>;
    };
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    connectSignal(power.onIdleStateChange!, () => {});
    setPowerIdlePollingIntervalMs(100);
    attachPower(power, 30);
    vi.advanceTimersByTime(150);
    const countAfterAttach = pollCount;
    detachPower(power);
    idleState = 'Idle';
    vi.advanceTimersByTime(300);
    // Polling must stop after detach: poll count should not grow after detach.
    expect(pollCount).toBe(countAfterAttach);
    vi.useRealTimers();
    setPowerIdlePollingIntervalMs(5000);
  });
});

describe('createPower', () => {
  it('creates an entity with all signals left null until enabled', () => {
    const power = createPower();
    expect(power.onChange).toBeNull();
    expect(power.onCharging).toBeNull();
    expect(power.onDischarging).toBeNull();
    expect(power.onIdleStateChange).toBeNull();
    expect(power.onLockScreen).toBeNull();
    expect(power.onLowPowerModeChange).toBeNull();
    expect(power.onResume).toBeNull();
    expect(power.onSuspend).toBeNull();
    expect(power.onThermalStateChange).toBeNull();
    expect(power.onUnlockScreen).toBeNull();
  });
});

describe('createPowerBatteryHealth', () => {
  it('allocates a zeroed battery health with all sentinel values', () => {
    const health = createPowerBatteryHealth();
    expect(health.capacityWearLevel).toBe(-1);
    expect(health.cycleCount).toBe(-1);
    expect(health.healthState).toBe('Unknown');
    expect(health.temperatureCelsius).toBe(-1);
    expect(health.voltage).toBe(-1);
  });
});

describe('createPowerStatus', () => {
  it('allocates a zeroed status', () => {
    const status = createPowerStatus();
    expect(status.batteryLevel).toBe(-1);
    expect(status.chargingTime).toBe(-1);
    expect(status.dischargingTime).toBe(-1);
    expect(status.isBatteryLow).toBe(false);
    expect(status.isCharging).toBe(false);
    expect(status.isLowPower).toBe(false);
    expect(status.isOnBattery).toBe(false);
    expect(status.thermalState).toBe('Unknown');
  });
});

describe('detachPower', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    enablePowerSignals(power);
    let changes = 0;
    connectSignal(power.onChange!, () => changes++);
    attachPower(power);
    detachPower(power);
    backend.fire();
    expect(changes).toBe(0);
  });

  it('is safe when called on an unattached power entity', () => {
    const power = createPower();
    expect(() => detachPower(power)).not.toThrow();
  });
});

describe('disposePower', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    attachPower(power);
    expect(() => disposePower(power)).not.toThrow();
  });

  it('is idempotent', () => {
    const power = createPower();
    expect(() => {
      disposePower(power);
      disposePower(power);
    }).not.toThrow();
  });
});

describe('enablePowerSignals', () => {
  it('allocates the null signals so callers can connect and receive emissions', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    expect(power.onChange).toBeNull();
    enablePowerSignals(power);
    expect(power.onChange).not.toBeNull();
    expect(power.onCharging).not.toBeNull();
    expect(power.onDischarging).not.toBeNull();
    expect(power.onIdleStateChange).not.toBeNull();
    expect(power.onLockScreen).not.toBeNull();
    expect(power.onLowPowerModeChange).not.toBeNull();
    expect(power.onResume).not.toBeNull();
    expect(power.onSuspend).not.toBeNull();
    expect(power.onThermalStateChange).not.toBeNull();
    expect(power.onUnlockScreen).not.toBeNull();
    let changes = 0;
    connectSignal(power.onChange!, () => changes++);
    attachPower(power);
    backend.fire();
    expect(changes).toBe(1);
  });

  it('is idempotent — a second call keeps the same signal objects', () => {
    const power = createPower();
    enablePowerSignals(power);
    const signal = power.onChange;
    enablePowerSignals(power);
    expect(power.onChange).toBe(signal);
  });
});

describe('explainPowerBackend', () => {
  afterEach(() => resetPowerBackendForTest());

  it('reports host-not-enabled when no backend is installed', () => {
    resetPowerBackendForTest();
    const explanation = explainPowerBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when a custom backend is set', () => {
    setPowerBackend(fakeBackend());
    expect(explainPowerBackend().layer).toBe('custom');
  });

  it('reports host layer when a host backend is installed', () => {
    installPowerHostBackend(fakeBackend());
    expect(explainPowerBackend().layer).toBe('host');
  });

  it('reports conflict when two different host backends are installed', () => {
    installPowerHostBackend(fakeBackend());
    installPowerHostBackend(fakeBackend());
    expect(explainPowerBackend().conflict).toBe(true);
  });
});

describe('getPowerBackend', () => {
  it('falls back to a web backend', () => {
    expect(getPowerBackend()).not.toBeNull();
  });
});

describe('getPowerBackend (sentinel)', () => {
  it('isKeepAwakeActive returns false when no lock is held', () => {
    expect(getPowerBackend().isKeepAwakeActive()).toBe(false);
  });

  it('reads a status without throwing', () => {
    const out = createPowerStatus();
    expect(typeof getPowerBackend().getStatus(out).isCharging).toBe('boolean');
  });

  it('getStatus is alias-safe when out is the scratch object', () => {
    const backend = getPowerBackend();
    const out = createPowerStatus();
    const result = backend.getStatus(out);
    expect(result).toBe(out);
  });

  it('getBatteryHealth returns null', () => {
    const backend = getPowerBackend();
    const out = createPowerBatteryHealth();
    expect(backend.getBatteryHealth(out)).toBeNull();
  });

  it('getSystemIdleTime returns -1', () => {
    expect(getPowerBackend().getSystemIdleTime()).toBe(-1);
  });

  it('getSystemIdleState returns Unknown', () => {
    expect(getPowerBackend().getSystemIdleState(5)).toBe('Unknown');
  });

  it('subscribeLockScreen and subscribeUnlockScreen return inert no-ops', () => {
    const backend = getPowerBackend();
    expect(() => backend.subscribeLockScreen(() => {})()).not.toThrow();
    expect(() => backend.subscribeUnlockScreen(() => {})()).not.toThrow();
  });

  it('subscribeLowPowerModeChange returns an inert no-op', () => {
    const backend = getPowerBackend();
    expect(() => backend.subscribeLowPowerModeChange(() => {})()).not.toThrow();
  });

  it('subscribeThermalStateChange returns an inert no-op', () => {
    const backend = getPowerBackend();
    expect(() => backend.subscribeThermalStateChange(() => {})()).not.toThrow();
  });

  it('subscribes without throwing', () => {
    const unsubscribe = getPowerBackend().subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('setKeepAwake returns false', () => {
    expect(getPowerBackend().setKeepAwake(true)).toBe(false);
  });

  it('setKeepAwake returns false for PreventAppSuspension mode', () => {
    expect(getPowerBackend().setKeepAwake(true, 'PreventAppSuspension')).toBe(false);
  });

  it('setKeepAwake returns false for PreventDisplaySleep mode', () => {
    expect(getPowerBackend().setKeepAwake(true, 'PreventDisplaySleep')).toBe(false);
  });
});

describe('getPowerBatteryHealth', () => {
  it('returns null from the default web backend', () => {
    const out = createPowerBatteryHealth();
    expect(getPowerBatteryHealth(out)).toBeNull();
  });

  it('returns the out object from a backend that supports health', () => {
    const health: PowerBatteryHealth = {
      capacityWearLevel: 0.9,
      cycleCount: 120,
      healthState: 'Good',
      temperatureCelsius: 30,
      voltage: 12.1,
    };
    setPowerBackend({
      ...fakeBackend(),
      getBatteryHealth(out) {
        out.capacityWearLevel = health.capacityWearLevel;
        out.cycleCount = health.cycleCount;
        out.healthState = health.healthState;
        out.temperatureCelsius = health.temperatureCelsius;
        out.voltage = health.voltage;
        return out;
      },
    });
    const out = createPowerBatteryHealth();
    expect(getPowerBatteryHealth(out)).toBe(out);
    expect(out.healthState).toBe('Good');
    expect(out.cycleCount).toBe(120);
  });
});

describe('getPowerIdlePollingIntervalMs', () => {
  it('returns the default 5000ms interval', () => {
    expect(getPowerIdlePollingIntervalMs()).toBe(5000);
  });
});

describe('getPowerStatus', () => {
  it('fills the out parameter from the backend', () => {
    setPowerBackend(fakeBackend());
    const out = createPowerStatus();
    expect(getPowerStatus(out)).toBe(out);
    expect(out.batteryLevel).toBe(0.5);
  });

  it('fills new fields from the backend', () => {
    setPowerBackend(fakeBackend());
    const out = createPowerStatus();
    getPowerStatus(out);
    expect(out.dischargingTime).toBe(3600);
    expect(out.isOnBattery).toBe(true);
    expect(out.thermalState).toBe('Nominal');
  });
});

describe('getPowerSystemIdleState', () => {
  it('delegates to the backend', () => {
    setPowerBackend(fakeBackend());
    expect(getPowerSystemIdleState(30)).toBe('Active');
  });
});

describe('getPowerSystemIdleTime', () => {
  it('delegates to the backend', () => {
    setPowerBackend(fakeBackend());
    expect(getPowerSystemIdleTime()).toBe(42);
  });
});

describe('getPowerThermalState', () => {
  it('returns the thermal state from the backend', () => {
    setPowerBackend(fakeBackend());
    expect(getPowerThermalState()).toBe('Nominal');
  });
});

describe('hasPowerHostBackend', () => {
  // Reports the SLOT rather than the effective backend. A host package uses this instead of caching
  // "did I install", so that clearing the slot is immediately visible to it.
  it('is false before a host backend is installed and true after', () => {
    resetPowerBackendForTest();
    expect(hasPowerHostBackend()).toBe(false);
    installPowerHostBackend(fakeBackend());
    expect(hasPowerHostBackend()).toBe(true);
  });

  // ★ A CUSTOM BACKEND MUST NOT SUPPRESS HOST INSTALLATION. Custom outranks host for callers, but it
  // occupies a different slot; reporting it here would make a host package skip installing and leave
  // the host slot permanently empty once the custom one is cleared.
  it('stays false when only a custom backend is set', () => {
    resetPowerBackendForTest();
    setPowerBackend(fakeBackend());
    expect(hasPowerHostBackend()).toBe(false);
    resetPowerBackendForTest();
  });
});

describe('hasPowerKeepAwake', () => {
  it('returns false when no lock is held by the web backend', () => {
    expect(hasPowerKeepAwake()).toBe(false);
  });

  it('delegates to the active backend isKeepAwakeActive', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    backend.keepAwake = false;
    expect(hasPowerKeepAwake()).toBe(false);
    backend.keepAwake = true;
    expect(hasPowerKeepAwake()).toBe(true);
  });
});

describe('installPowerHostBackend', () => {
  afterEach(() => resetPowerBackendForTest());

  it('installs a host backend that getPowerBackend returns', () => {
    const backend = fakeBackend();
    installPowerHostBackend(backend);
    expect(getPowerBackend()).toBe(backend);
  });

  it('is first-host-wins: a second different backend sets conflict', () => {
    const first = fakeBackend();
    const second = fakeBackend();
    installPowerHostBackend(first);
    installPowerHostBackend(second);
    expect(getPowerBackend()).toBe(first);
    expect(explainPowerBackend().conflict).toBe(true);
  });
});

describe('observePowerHostResult', () => {
  afterEach(() => resetPowerBackendForTest());

  it('records a successful observation', () => {
    installPowerHostBackend(fakeBackend());
    observePowerHostResult('setKeepAwake', true);
    const explanation = explainPowerBackend();
    expect(explanation.operation).toBe('setKeepAwake');
    expect(explanation.viability).toBe('available');
  });

  it('records a failed observation', () => {
    installPowerHostBackend(fakeBackend());
    observePowerHostResult('setKeepAwake', false);
    expect(explainPowerBackend().viability).toBe('runtime-api-unavailable');
  });
});

describe('resetPowerBackendForTest', () => {
  it('clears all backend slots', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    installPowerHostBackend(fakeBackend());
    observePowerHostResult('setKeepAwake', true);
    resetPowerBackendForTest();
    expect(getPowerBackend()).not.toBe(backend);
    expect(explainPowerBackend().layer).toBe('host-not-enabled');
    expect(explainPowerBackend().conflict).toBe(false);
    expect(explainPowerBackend().viability).toBe('unobserved');
  });
});

describe('setPowerBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setPowerBackend(fakeBackend());
    setPowerBackend(null);
    expect(getPowerBackend()).not.toBeNull();
  });

  it('destroys the outgoing backend while it is still the active backend', () => {
    const order: string[] = [];
    const first = fakeBackend();
    first.destroy = () => {
      order.push('destroy');
      order.push(`sees-self:${getPowerBackend() === first}`);
    };
    const second = fakeBackend();
    setPowerBackend(first);
    setPowerBackend(second);
    expect(order).toEqual(['destroy', 'sees-self:true']);
    expect(getPowerBackend()).toBe(second);
  });

  it('does not install replacement when outgoing destroy throws', () => {
    const first = fakeBackend();
    first.destroy = () => {
      throw new Error('teardown failed');
    };
    const second = fakeBackend();
    setPowerBackend(first);
    expect(() => setPowerBackend(second)).toThrow('teardown failed');
    expect(getPowerBackend()).toBe(first);
  });

  it('does not destroy a backend that is being re-assigned to the same slot', () => {
    let destroyCalls = 0;
    const backend = fakeBackend();
    backend.destroy = () => destroyCalls++;
    setPowerBackend(backend);
    setPowerBackend(backend);
    expect(destroyCalls).toBe(0);
  });

  it('is safe to call destroy twice (idempotent)', () => {
    let destroyCalls = 0;
    const backend = fakeBackend();
    backend.destroy = () => destroyCalls++;
    setPowerBackend(backend);
    setPowerBackend(null);
    expect(destroyCalls).toBe(1);
    setPowerBackend(null);
    expect(destroyCalls).toBe(1);
  });

  it('destroys when clearing to null', () => {
    let destroyed = false;
    const backend = fakeBackend();
    backend.destroy = () => (destroyed = true);
    setPowerBackend(backend);
    expect(destroyed).toBe(false);
    setPowerBackend(null);
    expect(destroyed).toBe(true);
  });

  it('does not destroy a backend that is still retained in the host slot', () => {
    let destroyCalls = 0;
    const shared = fakeBackend();
    shared.destroy = () => destroyCalls++;
    installPowerHostBackend(shared);
    setPowerBackend(shared);
    setPowerBackend(null);
    expect(destroyCalls).toBe(0);
  });
});

describe('setPowerIdlePollingIntervalMs', () => {
  it('updates the polling interval returned by getPowerIdlePollingIntervalMs', () => {
    setPowerIdlePollingIntervalMs(1000);
    expect(getPowerIdlePollingIntervalMs()).toBe(1000);
    // Restore default.
    setPowerIdlePollingIntervalMs(5000);
  });
});

describe('setPowerKeepAwake', () => {
  it('delegates to the backend and returns its result', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    expect(setPowerKeepAwake(true)).toBe(true);
    expect(backend.keepAwake).toBe(true);
  });

  it('passes the mode to the backend', () => {
    let capturedMode: string | undefined;
    const backend = fakeBackend();
    const originalSetKeepAwake = backend.setKeepAwake.bind(backend);
    backend.setKeepAwake = (enabled, mode) => {
      capturedMode = mode;
      return originalSetKeepAwake(enabled, mode);
    };
    setPowerBackend(backend);
    setPowerKeepAwake(true, 'PreventDisplaySleep');
    expect(capturedMode).toBe('PreventDisplaySleep');
  });
});
