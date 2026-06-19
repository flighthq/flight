import { connectSignal } from '@flighthq/signals';
import type { PowerBackend, PowerStatus } from '@flighthq/types';

import {
  attachPower,
  createPower,
  createPowerStatus,
  createWebPowerBackend,
  detachPower,
  disposePower,
  getPowerBackend,
  getPowerStatus,
  setPowerBackend,
  setPowerKeepAwake,
} from './power';

function fakeBackend(): PowerBackend & {
  charging: boolean;
  keepAwake: boolean;
  fire: () => void;
  fireSuspend: () => void;
  fireResume: () => void;
} {
  let listener: (() => void) | null = null;
  let suspendListener: (() => void) | null = null;
  let resumeListener: (() => void) | null = null;
  return {
    charging: false,
    keepAwake: false,
    getStatus(out) {
      out.batteryLevel = 0.5;
      out.isCharging = this.charging;
      out.isLowPower = false;
      return out;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    subscribeSuspend(l) {
      suspendListener = l;
      return () => {
        suspendListener = null;
      };
    },
    subscribeResume(l) {
      resumeListener = l;
      return () => {
        resumeListener = null;
      };
    },
    setKeepAwake(enabled) {
      this.keepAwake = enabled;
      return true;
    },
    fire() {
      listener?.();
    },
    fireSuspend() {
      suspendListener?.();
    },
    fireResume() {
      resumeListener?.();
    },
  };
}

afterEach(() => setPowerBackend(null));

describe('attachPower', () => {
  it('emits onChange and the charging transition signals', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    let changes = 0;
    let charging = 0;
    connectSignal(power.onChange, () => changes++);
    connectSignal(power.onCharging, () => charging++);
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
    let suspends = 0;
    let resumes = 0;
    connectSignal(power.onSuspend, () => suspends++);
    connectSignal(power.onResume, () => resumes++);
    attachPower(power);
    backend.fireSuspend();
    backend.fireResume();
    expect(suspends).toBe(1);
    expect(resumes).toBe(1);
  });
});

describe('createPower', () => {
  it('creates an entity with three signals', () => {
    const power = createPower();
    expect(power.onChange).toBeDefined();
    expect(power.onCharging).toBeDefined();
    expect(power.onDischarging).toBeDefined();
    expect(power.onSuspend).toBeDefined();
    expect(power.onResume).toBeDefined();
  });
});

describe('createPowerStatus', () => {
  it('allocates a zeroed status', () => {
    expect(createPowerStatus()).toEqual({ batteryLevel: -1, isCharging: false, isLowPower: false });
  });
});

describe('createWebPowerBackend', () => {
  it('reads a status without throwing', () => {
    const out = createPowerStatus();
    expect(typeof createWebPowerBackend().getStatus(out).isCharging).toBe('boolean');
  });

  it('subscribes without throwing when battery API is absent', () => {
    const unsubscribe = createWebPowerBackend().subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('toggles keep-awake without throwing', () => {
    expect(typeof createWebPowerBackend().setKeepAwake(true)).toBe('boolean');
  });
});

describe('detachPower', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    const power = createPower();
    let changes = 0;
    connectSignal(power.onChange, () => changes++);
    attachPower(power);
    detachPower(power);
    backend.fire();
    expect(changes).toBe(0);
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
});

describe('getPowerBackend', () => {
  it('falls back to a web backend', () => {
    expect(getPowerBackend()).not.toBeNull();
  });
});

describe('getPowerStatus', () => {
  it('fills the out parameter from the backend', () => {
    setPowerBackend(fakeBackend());
    const out = createPowerStatus();
    expect(getPowerStatus(out)).toBe(out);
    expect(out.batteryLevel).toBe(0.5);
  });
});

describe('setPowerBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setPowerBackend(fakeBackend());
    setPowerBackend(null);
    expect(getPowerBackend()).not.toBeNull();
  });
});

describe('setPowerKeepAwake', () => {
  it('delegates to the backend and returns its result', () => {
    const backend = fakeBackend();
    setPowerBackend(backend);
    expect(setPowerKeepAwake(true)).toBe(true);
    expect(backend.keepAwake).toBe(true);
  });
});
