import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HasPowerKeepAwake,
  PowerAttachHost,
  PowerIdleState,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types/contract';

import {
  acquirePowerKeepAwake,
  attachPower,
  createPower,
  destroyPowerKeepAwake,
  detachPower,
  disposePower,
  enablePowerSignals,
  getPowerBatteryHealth,
  getPowerIdlePollingIntervalMs,
  getPowerStatus,
  getPowerSystemIdleState,
  getPowerSystemIdleTime,
  getPowerThermalState,
  isPowerKeepAwakeActive,
  makePowerBatteryHealth,
  makePowerStatus,
  releasePowerKeepAwake,
  setPowerIdlePollingIntervalMs,
} from './power';

// A host built from exactly the slots a test needs. Nothing installs anywhere, so two hosts can be live
// at once — the property the ambient seam could not express.
function statusHost(status: Partial<PowerStatus>): PowerAttachHost & { emitChange(): void } {
  const listeners = new Set<() => void>();
  return {
    emitChange(): void {
      for (const l of listeners) l();
    },
    power: {
      change: {
        subscribe(listener: () => void): () => void {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      status: {
        getStatus(out: PowerStatus): PowerStatus {
          return Object.assign(out, status);
        },
      },
    },
  };
}

function keepAwakeHost(overrides: Partial<HasPowerKeepAwake['power']['keepAwake']> = {}): HasPowerKeepAwake {
  return {
    power: {
      keepAwake: {
        acquire: async () => ({ reason: 'ok' }) as const,
        isActive: () => false,
        release: async () => ({ reason: 'ok' }) as const,
        ...overrides,
      },
    },
  };
}

describe('acquirePowerKeepAwake', () => {
  it('forwards the mode and resolves the provider outcome', async () => {
    let seen = '';
    const host = keepAwakeHost({
      acquire: async (mode) => {
        seen = mode;
        return { reason: 'denied' } as const;
      },
    });
    await expect(acquirePowerKeepAwake(host, 'PreventAppSuspension')).resolves.toEqual({ reason: 'denied' });
    expect(seen).toBe('PreventAppSuspension');
  });

  it('defaults to PreventDisplaySleep', async () => {
    let seen = '';
    const host = keepAwakeHost({
      acquire: async (mode) => {
        seen = mode;
        return { reason: 'ok' } as const;
      },
    });
    await acquirePowerKeepAwake(host);
    expect(seen).toBe('PreventDisplaySleep');
  });
});

describe('attachPower', () => {
  it('emits a FRESH status per event, never one shared buffer', () => {
    const host = statusHost({ isCharging: false });
    const power = createPower();
    enablePowerSignals(power);
    const seen: Readonly<PowerStatus>[] = [];
    connectSignal(power.onChange!, (status) => seen.push(status));
    attachPower(host, power);
    host.emitChange();
    host.emitChange();
    expect(seen).toHaveLength(2);
    // ★ The old seam handed every listener one long-lived module scratch, so a retained payload mutated
    // underneath its holder on the next event. Distinct objects is the property that prevents that.
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('derives charging transitions from status changes', () => {
    let charging = false;
    const listeners = new Set<() => void>();
    const host: PowerAttachHost = {
      power: {
        change: {
          subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        status: {
          getStatus(out: PowerStatus): PowerStatus {
            out.isCharging = charging;
            return out;
          },
        },
      },
    };
    const power = createPower();
    enablePowerSignals(power);
    let charged = 0;
    let discharged = 0;
    connectSignal(power.onCharging!, () => charged++);
    connectSignal(power.onDischarging!, () => discharged++);
    attachPower(host, power);
    charging = true;
    for (const l of listeners) l();
    charging = false;
    for (const l of listeners) l();
    expect(charged).toBe(1);
    expect(discharged).toBe(1);
  });

  it('delivers the thermal state as the event payload', () => {
    const listeners = new Set<(state: PowerThermalState) => void>();
    const host: PowerAttachHost = {
      power: {
        thermal: {
          getThermalState: () => 'Serious',
          subscribeThermalStateChange(listener: (state: PowerThermalState) => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      },
    };
    const power = createPower();
    enablePowerSignals(power);
    const seen: PowerThermalState[] = [];
    connectSignal(power.onThermalStateChange!, (state) => seen.push(state));
    attachPower(host, power);
    for (const l of listeners) l('Critical');
    // ★ An event that only said "something changed" left the state unreadable; the payload is the point.
    expect(seen).toEqual(['Critical']);
  });

  it('never polls when the host offers no idle slot', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const power = createPower();
    attachPower(statusHost({}), power);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('re-attaching replaces its own subscription rather than stacking', () => {
    const host = statusHost({});
    const power = createPower();
    enablePowerSignals(power);
    let count = 0;
    connectSignal(power.onChange!, () => count++);
    attachPower(host, power);
    attachPower(host, power);
    host.emitChange();
    expect(count).toBe(1);
  });
});

describe('createPower', () => {
  it('allocates an Entity with inert signals', () => {
    const power = createPower();
    expect(EntityRuntimeKey in power).toBe(true);
    expect(power.onChange).toBeNull();
  });
});

describe('destroyPowerKeepAwake', () => {
  // Builds the provider ONCE so two hosts can genuinely alias the same object; spreading it per host
  // would silently make them distinct and the alias assertion would prove nothing.
  function keepAwakeProvider(destroy?: () => void): HasPowerKeepAwake['power']['keepAwake'] {
    return {
      acquire: async () => ({ reason: 'ok' }) as const,
      destroy,
      isActive: () => false,
      release: async () => ({ reason: 'ok' }) as const,
    };
  }

  function keepAwakeHostWith(provider: HasPowerKeepAwake['power']['keepAwake']): HasPowerKeepAwake {
    return { power: { keepAwake: provider } };
  }

  // ★ ALIAS SAFETY: two hosts sharing one provider. Destroying twice would double-release an OS lock.
  it('destroys each distinct provider exactly once, even when hosts alias one', () => {
    let destroyed = 0;
    const shared = keepAwakeProvider(() => destroyed++);
    destroyPowerKeepAwake(keepAwakeHostWith(shared), keepAwakeHostWith(shared));
    expect(destroyed).toBe(1);
  });

  it('attempts every provider and rethrows the first error after the siblings run', () => {
    let secondDestroyed = false;
    const failing = keepAwakeProvider(() => {
      throw new Error('first failed');
    });
    const healthy = keepAwakeProvider(() => (secondDestroyed = true));
    expect(() => destroyPowerKeepAwake(keepAwakeHostWith(failing), keepAwakeHostWith(healthy))).toThrow('first failed');
    expect(secondDestroyed).toBe(true);
  });

  it('retries a failed obligation and leaves the succeeded one released', () => {
    let attempts = 0;
    let healthyDestroyed = 0;
    const flaky = keepAwakeProvider(() => {
      attempts++;
      if (attempts === 1) throw new Error('transient');
    });
    const healthy = keepAwakeProvider(() => healthyDestroyed++);
    expect(() => destroyPowerKeepAwake(keepAwakeHostWith(flaky), keepAwakeHostWith(healthy))).toThrow();
    expect(() => destroyPowerKeepAwake(keepAwakeHostWith(flaky), keepAwakeHostWith(healthy))).not.toThrow();
    expect(attempts).toBe(2);
    expect(healthyDestroyed).toBe(1);
  });
});

describe('detachPower', () => {
  it('stops delivery and is safe when never attached', () => {
    const host = statusHost({});
    const power = createPower();
    enablePowerSignals(power);
    let count = 0;
    connectSignal(power.onChange!, () => count++);
    attachPower(host, power);
    detachPower(power);
    host.emitChange();
    expect(count).toBe(0);
    expect(() => detachPower(createPower())).not.toThrow();
  });

  // ★ ATTEMPT-ALL teardown: one throwing unsubscribe must not strand the rest, or every subscription
  // after the first failure leaks.
  it('runs every teardown even when one throws', () => {
    let unlockTornDown = false;
    const host: PowerAttachHost = {
      power: {
        sessionLock: {
          subscribeLock: () => () => {
            throw new Error('lock teardown failed');
          },
          subscribeUnlock: () => () => {
            unlockTornDown = true;
          },
        },
      },
    };
    const power = createPower();
    attachPower(host, power);
    expect(() => detachPower(power)).toThrow('lock teardown failed');
    expect(unlockTornDown).toBe(true);
  });

  it('ends only its own subscriptions', () => {
    const host = statusHost({});
    const kept = createPower();
    const dropped = createPower();
    enablePowerSignals(kept);
    let count = 0;
    connectSignal(kept.onChange!, () => count++);
    attachPower(host, kept);
    attachPower(host, dropped);
    detachPower(dropped);
    host.emitChange();
    expect(count).toBe(1);
  });
});

describe('disposePower', () => {
  it('detaches and clears the entity signals', () => {
    const host = statusHost({});
    const power = createPower();
    enablePowerSignals(power);
    let count = 0;
    connectSignal(power.onChange!, () => count++);
    attachPower(host, power);
    disposePower(power);
    host.emitChange();
    expect(count).toBe(0);
  });
});

describe('enablePowerSignals', () => {
  it('allocates every signal and is idempotent', () => {
    const power = createPower();
    enablePowerSignals(power);
    const first = power.onChange;
    enablePowerSignals(power);
    expect(power.onChange).toBe(first);
    expect(power.onSuspend).not.toBeNull();
    expect(power.onUnlockScreen).not.toBeNull();
  });
});

describe('getPowerBatteryHealth', () => {
  it('fills and returns the caller-owned out parameter', () => {
    const out = makePowerBatteryHealth();
    const host = {
      power: {
        batteryHealth: {
          getBatteryHealth(target: typeof out): typeof out {
            target.cycleCount = 12;
            return target;
          },
        },
      },
    };
    expect(getPowerBatteryHealth(host, out)).toBe(out);
    expect(out.cycleCount).toBe(12);
  });
});

describe('getPowerIdlePollingIntervalMs', () => {
  it('reports the configured interval', () => {
    setPowerIdlePollingIntervalMs(1234);
    expect(getPowerIdlePollingIntervalMs()).toBe(1234);
    setPowerIdlePollingIntervalMs(5000);
  });
});

describe('getPowerStatus', () => {
  it('fills the caller-owned out parameter', () => {
    const out = makePowerStatus();
    expect(getPowerStatus(statusHost({ isCharging: true }) as never, out)).toBe(out);
    expect(out.isCharging).toBe(true);
  });
});

describe('getPowerSystemIdleState', () => {
  it('forwards the threshold', () => {
    let seen = -1;
    const host = {
      power: {
        idle: {
          getIdleState(t: number): PowerIdleState {
            seen = t;
            return 'Idle';
          },
          getIdleTimeSeconds: () => 0,
        },
      },
    };
    expect(getPowerSystemIdleState(host, 90)).toBe('Idle');
    expect(seen).toBe(90);
  });
});

describe('getPowerSystemIdleTime', () => {
  it('returns the provider value', () => {
    const host = {
      power: { idle: { getIdleState: (): PowerIdleState => 'Active', getIdleTimeSeconds: () => 42 } },
    };
    expect(getPowerSystemIdleTime(host)).toBe(42);
  });
});

describe('getPowerThermalState', () => {
  it('returns the provider value', () => {
    const host = {
      power: {
        thermal: { getThermalState: (): PowerThermalState => 'Fair', subscribeThermalStateChange: () => () => {} },
      },
    };
    expect(getPowerThermalState(host)).toBe('Fair');
  });
});

describe('isPowerKeepAwakeActive', () => {
  it('reports the provider state', () => {
    expect(isPowerKeepAwakeActive(keepAwakeHost({ isActive: () => true }))).toBe(true);
  });
});

describe('makePowerBatteryHealth', () => {
  it('carries the complete unknown encoding', () => {
    expect(makePowerBatteryHealth()).toEqual({
      capacityWearLevel: -1,
      cycleCount: -1,
      healthState: 'Unknown',
      temperatureCelsius: -1,
      voltage: -1,
    });
  });

  // A value, not an entity: it is filled by a query and never carries identity.
  it('is not an Entity', () => {
    expect(EntityRuntimeKey in makePowerBatteryHealth()).toBe(false);
  });
});

describe('makePowerStatus', () => {
  it('carries the complete unknown encoding', () => {
    const status = makePowerStatus();
    expect(status.batteryLevel).toBe(-1);
    expect(status.chargingTime).toBe(-1);
    expect(status.dischargingTime).toBe(-1);
    expect(status.thermalState).toBe('Unknown');
    expect(status.isCharging).toBe(false);
  });

  it('allocates a distinct value per call', () => {
    expect(makePowerStatus()).not.toBe(makePowerStatus());
  });

  it('is not an Entity', () => {
    expect(EntityRuntimeKey in makePowerStatus()).toBe(false);
  });
});

describe('releasePowerKeepAwake', () => {
  it('resolves the provider outcome', async () => {
    const host = keepAwakeHost({ release: async () => ({ reason: 'inactive' }) as const });
    await expect(releasePowerKeepAwake(host)).resolves.toEqual({ reason: 'inactive' });
  });
});

describe('setPowerIdlePollingIntervalMs', () => {
  it('clamps a non-positive interval to 1ms', () => {
    setPowerIdlePollingIntervalMs(0);
    expect(getPowerIdlePollingIntervalMs()).toBe(1);
    setPowerIdlePollingIntervalMs(5000);
  });
});
