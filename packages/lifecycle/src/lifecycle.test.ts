import { cancelSignal, connectSignal } from '@flighthq/signals/contract';
import type {
  HasSystemLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
  LifecycleBackend,
  LifecycleOperation,
} from '@flighthq/types/contract';

import {
  attachAppLifecycle,
  createAppLifecycle,
  createWebLifecycleBackend,
  detachAppLifecycle,
  disposeAppLifecycle,
  explainLifecycleOperation,
  getAppLaunchKind,
  getAppLifecycleState,
  hasLifecycleOperation,
  isAppActive,
  isAppBackground,
  isAppInactive,
  requestAppBack,
} from './lifecycle';

type FakeBackend = LifecycleBackend & {
  state: AppLifecycleState;
  fire: () => void;
  fireMemory: (level: AppMemoryPressure) => void;
};

function hostOf(backend: LifecycleBackend): HasSystemLifecycle {
  return { system: { lifecycle: backend } } as HasSystemLifecycle;
}

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

describe('attachAppLifecycle', () => {
  it('emits onPause and onStateChange when leaving active for background', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let changes = 0;
    let pauses = 0;
    connectSignal(app.onStateChange, () => changes++);
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(host, app);
    backend.state = 'background';
    backend.fire();
    expect(changes).toBe(1);
    expect(pauses).toBe(1);
  });

  it('emits onPause when leaving active for inactive', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let pauses = 0;
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(host, app);
    backend.state = 'inactive';
    backend.fire();
    expect(pauses).toBe(1);
  });

  it('does not double-fire onPause for inactive → background', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let pauses = 0;
    connectSignal(app.onPause, () => pauses++);
    attachAppLifecycle(host, app);
    backend.state = 'background';
    backend.fire();
    // inactive → background should not re-fire onPause (already paused)
    expect(pauses).toBe(0);
  });

  it('emits onResume when returning to active from background', () => {
    const backend = fakeBackend();
    backend.state = 'background';
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let resumes = 0;
    connectSignal(app.onResume, () => resumes++);
    attachAppLifecycle(host, app);
    backend.state = 'active';
    backend.fire();
    expect(resumes).toBe(1);
  });

  it('emits onResume when returning to active from inactive', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let resumes = 0;
    connectSignal(app.onResume, () => resumes++);
    attachAppLifecycle(host, app);
    backend.state = 'active';
    backend.fire();
    expect(resumes).toBe(1);
  });

  it('is idempotent — re-attaching tears down the prior subscription', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(host, app);
    attachAppLifecycle(host, app);
    backend.state = 'background';
    backend.fire();
    // Only one subscription should be active.
    expect(changes).toBe(1);
  });

  it('emits onSaveState when leaving active', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let saved = false;
    connectSignal(app.onSaveState, (bag) => {
      bag['key'] = 'value';
      saved = true;
    });
    attachAppLifecycle(host, app);
    backend.state = 'background';
    backend.fire();
    expect(saved).toBe(true);
  });

  it('emits onRestoreState with saved bag when returning to active', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    connectSignal(app.onSaveState, (bag) => {
      bag['x'] = 42;
    });
    let restored: Readonly<Record<string, unknown>> | null = null;
    connectSignal(app.onRestoreState, (state) => {
      restored = state;
    });
    attachAppLifecycle(host, app);
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
    const host = hostOf(backend);
    const app = createAppLifecycle();
    const levels: AppMemoryPressure[] = [];
    connectSignal(app.onMemoryWarning, (level) => levels.push(level));
    attachAppLifecycle(host, app);
    backend.fireMemory('critical');
    expect(levels).toEqual(['critical']);
  });

  // Property/fuzz coverage over transition storms. These validate the already-documented edge
  // contract — onStateChange is raw (one emit per backend notification), while onResume/onPause are
  // deduped 'active'↔non-'active' boundary edges — against random sequences of the three states,
  // rather than a single hand-picked path. The invariants are derived independently from the same
  // model the implementation describes, so a regression in the dedup logic surfaces as a mismatch.
  it('property: onStateChange fires exactly once per backend notification across random storms', () => {
    const states: AppLifecycleState[] = ['active', 'inactive', 'background'];
    for (let trial = 0; trial < 200; trial++) {
      const backend = fakeBackend();
      const host = hostOf(backend);
      const app = createAppLifecycle();
      let changes = 0;
      connectSignal(app.onStateChange, () => changes++);
      attachAppLifecycle(host, app);
      const fireCount = 1 + Math.floor(Math.random() * 30);
      for (let i = 0; i < fireCount; i++) {
        backend.state = states[Math.floor(Math.random() * states.length)];
        backend.fire();
      }
      // Raw, not deduped: every notification emits, even when the derived state is unchanged.
      expect(changes).toBe(fireCount);
      detachAppLifecycle(app);
    }
  });

  it('property: onResume/onPause collapse a random storm to the minimal active-boundary edge set', () => {
    const states: AppLifecycleState[] = ['active', 'inactive', 'background'];
    for (let trial = 0; trial < 200; trial++) {
      const backend = fakeBackend();
      const start = states[Math.floor(Math.random() * states.length)];
      backend.state = start;
      const host = hostOf(backend);
      const app = createAppLifecycle();
      let pauses = 0;
      let resumes = 0;
      connectSignal(app.onPause, () => pauses++);
      connectSignal(app.onResume, () => resumes++);
      attachAppLifecycle(host, app);

      // Drive a random storm while computing the expected edge counts from an independent model:
      // a pause edge is every 'active' → non-'active' transition, a resume edge every
      // non-'active' → 'active' transition. inactive↔background never fires either.
      let previous = start;
      let expectedPauses = 0;
      let expectedResumes = 0;
      const fireCount = 1 + Math.floor(Math.random() * 30);
      for (let i = 0; i < fireCount; i++) {
        const next = states[Math.floor(Math.random() * states.length)];
        backend.state = next;
        backend.fire();
        if (previous === 'active' && next !== 'active') expectedPauses++;
        else if (previous !== 'active' && next === 'active') expectedResumes++;
        previous = next;
      }
      expect(pauses).toBe(expectedPauses);
      expect(resumes).toBe(expectedResumes);
      detachAppLifecycle(app);
    }
  });

  it('property: a focus/blur flutter that never leaves active emits no pause or resume', () => {
    // A common real storm: rapid blur→focus while the document stays visible. Every notification
    // re-reads 'active' (the fake holds 'active'), so onStateChange fires each time but the deduped
    // edges stay silent — there is no active-boundary crossing.
    for (let trial = 0; trial < 100; trial++) {
      const backend = fakeBackend();
      backend.state = 'active';
      const host = hostOf(backend);
      const app = createAppLifecycle();
      let changes = 0;
      let pauses = 0;
      let resumes = 0;
      connectSignal(app.onStateChange, () => changes++);
      connectSignal(app.onPause, () => pauses++);
      connectSignal(app.onResume, () => resumes++);
      attachAppLifecycle(host, app);
      const fireCount = 1 + Math.floor(Math.random() * 30);
      for (let i = 0; i < fireCount; i++) backend.fire();
      expect(changes).toBe(fireCount);
      expect(pauses).toBe(0);
      expect(resumes).toBe(0);
      detachAppLifecycle(app);
    }
  });

  it('property: pause and resume counts stay balanced within one across any storm', () => {
    // Across a full storm the deduped edges alternate (pause then resume then pause …) starting
    // from whichever side of the active boundary the storm began on, so the running counts can
    // never differ by more than one — the structural guarantee a state machine of one boolean
    // ('was active') provides.
    const states: AppLifecycleState[] = ['active', 'inactive', 'background'];
    for (let trial = 0; trial < 200; trial++) {
      const backend = fakeBackend();
      backend.state = states[Math.floor(Math.random() * states.length)];
      const host = hostOf(backend);
      const app = createAppLifecycle();
      let pauses = 0;
      let resumes = 0;
      connectSignal(app.onPause, () => pauses++);
      connectSignal(app.onResume, () => resumes++);
      attachAppLifecycle(host, app);
      const fireCount = 1 + Math.floor(Math.random() * 30);
      for (let i = 0; i < fireCount; i++) {
        backend.state = states[Math.floor(Math.random() * states.length)];
        backend.fire();
      }
      expect(Math.abs(pauses - resumes)).toBeLessThanOrEqual(1);
      detachAppLifecycle(app);
    }
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
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(host, app);
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
    const host = hostOf(backend);
    const app = createAppLifecycle();
    attachAppLifecycle(host, app);
    expect(() => disposeAppLifecycle(app)).not.toThrow();
  });

  it('stops delivery after dispose', () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    const app = createAppLifecycle();
    let changes = 0;
    connectSignal(app.onStateChange, () => changes++);
    attachAppLifecycle(host, app);
    disposeAppLifecycle(app);
    backend.fire();
    expect(changes).toBe(0);
  });
});

describe('explainLifecycleOperation', () => {
  // The sentinel is gone with the ambient resolver: a host either carries a provider that implements
  // the operation or it does not, and "not implemented" is now a fact about THAT host rather than
  // about a process-wide fallback that answered everything.
  it('reports the host provider as implementing what it provides', () => {
    const host = hostOf(fakeBackend());
    expect(explainLifecycleOperation(host, 'getState')).toEqual({
      implemented: true,
      layer: 'host',
      operation: 'getState',
    });
  });

  it('reports an operation the host provider omits as unimplemented', () => {
    const host = hostOf({ getState: () => 'active', subscribe: () => () => {} } as LifecycleBackend);
    expect(explainLifecycleOperation(host, 'getLaunchKind')).toEqual({
      implemented: false,
      layer: 'sentinel',
      operation: 'getLaunchKind',
    });
  });

  // Two hosts, two answers for the same operation — impossible before the migration, because one
  // process-wide backend answered for every caller.
  it('answers per host rather than process-wide', () => {
    const rich = hostOf(fakeBackend());
    const bare = hostOf({ getState: () => 'active', subscribe: () => () => {} } as LifecycleBackend);
    expect(explainLifecycleOperation(rich, 'subscribeMemoryWarning').implemented).toBe(true);
    expect(explainLifecycleOperation(bare, 'subscribeMemoryWarning').implemented).toBe(false);
  });
});

describe('getAppLaunchKind', () => {
  it("returns 'warm' when backend does not implement getLaunchKind", () => {
    const backend = fakeBackend();
    const host = hostOf(backend);
    expect(getAppLaunchKind(host)).toBe('warm');
  });

  it('delegates to backend.getLaunchKind when present', () => {
    const backend: LifecycleBackend = {
      getState: () => 'active',
      subscribe: () => () => {},
      getLaunchKind: () => 'cold',
    };
    const host = hostOf(backend);
    expect(getAppLaunchKind(host)).toBe('cold');
  });
});

describe('getAppLifecycleState', () => {
  it('reads from the active backend', () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    const host = hostOf(backend);
    expect(getAppLifecycleState(host)).toBe('inactive');
  });
});

describe('hasLifecycleOperation', () => {
  it('agrees with explainLifecycleOperation for the same host', () => {
    const host = hostOf(fakeBackend());
    expect(hasLifecycleOperation(host, 'getState')).toBe(explainLifecycleOperation(host, 'getState').implemented);
  });

  it('is false for an operation the host provider omits', () => {
    const host = hostOf({ getState: () => 'active', subscribe: () => () => {} } as LifecycleBackend);
    expect(hasLifecycleOperation(host, 'getLaunchKind')).toBe(false);
  });
});

describe('isAppActive', () => {
  it("returns true when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    const host = hostOf(backend);
    expect(isAppActive(host)).toBe(true);
  });

  it("returns false when state is 'background'", () => {
    const backend = fakeBackend();
    backend.state = 'background';
    const host = hostOf(backend);
    expect(isAppActive(host)).toBe(false);
  });

  it("returns false when state is 'inactive'", () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    const host = hostOf(backend);
    expect(isAppActive(host)).toBe(false);
  });
});

describe('isAppBackground', () => {
  it("returns true when state is 'background'", () => {
    const backend = fakeBackend();
    backend.state = 'background';
    const host = hostOf(backend);
    expect(isAppBackground(host)).toBe(true);
  });

  it("returns false when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    const host = hostOf(backend);
    expect(isAppBackground(host)).toBe(false);
  });
});

// Per-operation availability for LifecycleBackend. The operations below are the ones the interface declares
// OPTIONAL, so a host that omits them is compliant rather than broken — that is the absence-of-an-export
// ruling, and this is the query that makes it observable.
const OPTIONAL_OPERATIONS: readonly LifecycleOperation[] = ['getLaunchKind', 'subscribeMemoryWarning'];

// A host implementing only the REQUIRED members — partial support declared by absence.
function partialBackend(): LifecycleBackend {
  return {
    getState: (() => undefined) as never,
    subscribe: (() => undefined) as never,
  } as LifecycleBackend;
}

describe('isAppInactive', () => {
  it("returns true when state is 'inactive'", () => {
    const backend = fakeBackend();
    backend.state = 'inactive';
    const host = hostOf(backend);
    expect(isAppInactive(host)).toBe(true);
  });

  it("returns false when state is 'active'", () => {
    const backend = fakeBackend();
    backend.state = 'active';
    const host = hostOf(backend);
    expect(isAppInactive(host)).toBe(false);
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
