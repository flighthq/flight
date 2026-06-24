import { cancelSignal, connectSignal } from '@flighthq/signals';
import type { AppLifecycleState, AppMemoryPressure, LifecycleBackend } from '@flighthq/types';

import {
  attachAppLifecycle,
  createAppLifecycle,
  createWebLifecycleBackend,
  detachAppLifecycle,
  disposeAppLifecycle,
  getAppLaunchKind,
  getAppLifecycleState,
  getLifecycleBackend,
  isAppActive,
  isAppBackground,
  isAppInactive,
  requestAppBack,
  setLifecycleBackend,
} from './lifecycle';

type FakeBackend = LifecycleBackend & {
  state: AppLifecycleState;
  fire: () => void;
  fireMemory: (level: AppMemoryPressure) => void;
};

function fakeBackend(): FakeBackend {
  let stateListener: (() => void) | null = null;
  let memoryListener: ((level: AppMemoryPressure) => void) | null = null;
  return {
    state: 'active',
    getState() {
      return this.state;
    },
    subscribe(l) {
      stateListener = l;
      return () => {
        stateListener = null;
      };
    },
    subscribeMemoryWarning(l) {
      memoryListener = l;
      return () => {
        memoryListener = null;
      };
    },
    fire() {
      stateListener?.();
    },
    fireMemory(level: AppMemoryPressure) {
      memoryListener?.(level);
    },
  };
}

afterEach(() => setLifecycleBackend(null));

describe('attachAppLifecycle', () => {
  it('emits onPause and onStateChange when leaving active for background', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let changes = 0;
    let pauses = 0;
    connectSignal(app.onStateChange, () => changes++);
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(app);
    backend.state = 'background';
    backend.fire();
    expect(changes).toBe(1);
    expect(pauses).toBe(1);
  });

  it('emits onPause when leaving active for inactive', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let pauses = 0;
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(app);
    backend.state = 'inactive';
    backend.fire();
    expect(pauses).toBe(1);
  });

  it('does not double-fire onPause for inactive → background', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let pauses = 0;
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(app);
    backend.state = 'background';
    backend.fire();
    // inactive → background should not re-fire onPause (already paused)
    expect(pauses).toBe(0);
  });

  it('emits onResume when returning to active from background', () => {
    const backend = fakeBackend();
    backend.state = 'background';
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let resumes = 0;
    connectSignal(app.onResume, () => resumes++);
    attachAppLifecycle(app);
    backend.state = 'active';
    backend.fire();
    expect(resumes).toBe(1);
  });

  it('emits onResume when returning to active from inactive', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let resumes = 0;
    connectSignal(app.onResume, () => resumes++);
    attachAppLifecycle(app);
    backend.state = 'active';
    backend.fire();
    expect(resumes).toBe(1);
  });

  it('is idempotent — re-attaching tears down the prior subscription', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(app);
    attachAppLifecycle(app);
    backend.state = 'background';
    backend.fire();
    // Only one subscription should be active.
    expect(changes).toBe(1);
  });

  it('emits onSaveState when leaving active', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let saved = false;
    connectSignal(app.onSaveState, (bag) => {
      bag['key'] = 'value';
      saved = true;
    });
    attachAppLifecycle(app);
    backend.state = 'background';
    backend.fire();
    expect(saved).toBe(true);
  });

  it('emits onRestoreState with saved bag when returning to active', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    connectSignal(app.onSaveState, (bag) => {
      bag['x'] = 42;
    });
    let restored: Readonly<Record<string, unknown>> | null = null;
    connectSignal(app.onRestoreState, (state) => {
      restored = state;
    });
    attachAppLifecycle(app);
    // Transition away to trigger save.
    backend.state = 'background';
    backend.fire();
    // Transition back to trigger restore.
    backend.state = 'active';
    backend.fire();
    expect(restored).not.toBeNull();
    expect(restored?.['x']).toBe(42);
  });

  it('subscribes to memory warnings when backend supports it', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    const levels: AppMemoryPressure[] = [];
    connectSignal(app.onMemoryWarning, (level) => levels.push(level));
    attachAppLifecycle(app);
    backend.fireMemory('critical');
    expect(levels).toEqual(['critical']);
  });
});

describe('createAppLifecycle', () => {
  it('creates an entity with all seven signals', () => {
    const app = createAppLifecycle();
    expect(app.onStateChange).toBeDefined();
    expect(app.onResume).toBeDefined();
    expect(app.onPause).toBeDefined();
    expect(app.onBackButton).toBeDefined();
    expect(app.onMemoryWarning).toBeDefined();
    expect(app.onSaveState).toBeDefined();
    expect(app.onRestoreState).toBeDefined();
  });
});

describe('createWebLifecycleBackend', () => {
  it("getLaunchKind returns 'cold' when no performance navigation entries", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'warm' for back_forward navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'back_forward' } as PerformanceNavigationTiming,
    ]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('warm');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for reload navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for navigate navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it('reads a state without throwing', () => {
    expect(typeof createWebLifecycleBackend().getState()).toBe('string');
  });

  it('subscribeMemoryWarning fires critical when memory-pressure event fires', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    // Simulate a memory-pressure event with 'critical' pressure detail.
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['critical']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires moderate when memory-pressure event fires with moderate pressure', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'moderate' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['moderate']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires normal when memory-pressure-relieved event fires', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    const event = new CustomEvent('memory-pressure-relieved');
    window.dispatchEvent(event);
    expect(levels).toEqual(['normal']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning stops delivering after unsubscribe', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    unsubscribe?.();
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toHaveLength(0);
  });

  it('subscribes and unsubscribes without throwing', () => {
    const unsubscribe = createWebLifecycleBackend().subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('detachAppLifecycle', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(app);
    detachAppLifecycle(app);
    backend.fire();
    expect(changes).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const app = createAppLifecycle();
    expect(() => detachAppLifecycle(app)).not.toThrow();
  });
});

describe('disposeAppLifecycle', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    attachAppLifecycle(app);
    expect(() => disposeAppLifecycle(app)).not.toThrow();
  });

  it('stops delivery after dispose', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(app);
    disposeAppLifecycle(app);
    backend.fire();
    expect(changes).toBe(0);
  });
});

describe('getAppLaunchKind', () => {
  it("returns 'warm' when backend does not implement getLaunchKind", () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    expect(getAppLaunchKind()).toBe('warm');
  });

  it('delegates to backend.getLaunchKind when present', () => {
    const backend: LifecycleBackend = {
      getState: () => 'active',
      subscribe: () => () => {},
      getLaunchKind: () => 'cold',
    };
    setLifecycleBackend(backend);
    expect(getAppLaunchKind()).toBe('cold');
  });
});

describe('getAppLifecycleState', () => {
  it('reads from the active backend', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    setLifecycleBackend(backend);
    expect(getAppLifecycleState()).toBe('inactive');
  });
});

describe('getLifecycleBackend', () => {
  it('falls back to a web backend', () => {
    expect(getLifecycleBackend()).not.toBeNull();
  });
});

describe('isAppActive', () => {
  it("returns true when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    setLifecycleBackend(backend);
    expect(isAppActive()).toBe(true);
  });

  it("returns false when state is 'background'", () => {
    const backend = fakeBackend();
    backend.state = 'background';
    setLifecycleBackend(backend);
    expect(isAppActive()).toBe(false);
  });

  it("returns false when state is 'inactive'", () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    setLifecycleBackend(backend);
    expect(isAppActive()).toBe(false);
  });
});

describe('isAppBackground', () => {
  it("returns true when state is 'background'", () => {
    const backend = fakeBackend();
    backend.state = 'background';
    setLifecycleBackend(backend);
    expect(isAppBackground()).toBe(true);
  });

  it("returns false when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    setLifecycleBackend(backend);
    expect(isAppBackground()).toBe(false);
  });
});

describe('isAppInactive', () => {
  it("returns true when state is 'inactive'", () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    setLifecycleBackend(backend);
    expect(isAppInactive()).toBe(true);
  });

  it("returns false when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    setLifecycleBackend(backend);
    expect(isAppInactive()).toBe(false);
  });
});

describe('requestAppBack', () => {
  it('returns true when no listener vetoes', () => {
    const app = createAppLifecycle();
    expect(requestAppBack(app)).toBe(true);
  });

  it('returns false when a listener calls cancelSignal', () => {
    const app = createAppLifecycle();
    connectSignal(app.onBackButton, () => cancelSignal(app.onBackButton));
    expect(requestAppBack(app)).toBe(false);
  });

  it('emits onBackButton', () => {
    const app = createAppLifecycle();
    let fired = 0;
    connectSignal(app.onBackButton, () => fired++);
    requestAppBack(app);
    expect(fired).toBe(1);
  });
});

describe('setLifecycleBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setLifecycleBackend(fakeBackend());
    setLifecycleBackend(null);
    expect(getLifecycleBackend()).not.toBeNull();
  });
});
