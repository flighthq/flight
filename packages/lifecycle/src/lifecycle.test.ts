import { connectSignal } from '@flighthq/signals';
import type { AppLifecycleState, LifecycleBackend } from '@flighthq/types';

import {
  attachAppLifecycle,
  createAppLifecycle,
  createWebLifecycleBackend,
  detachAppLifecycle,
  disposeAppLifecycle,
  getAppLifecycleState,
  getLifecycleBackend,
  setLifecycleBackend,
} from './lifecycle';

function fakeBackend(): LifecycleBackend & { state: AppLifecycleState; fire: () => void } {
  let listener: (() => void) | null = null;
  return {
    state: 'active',
    getState() {
      return this.state;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    fire() {
      listener?.();
    },
  };
}

afterEach(() => setLifecycleBackend(null));

describe('attachAppLifecycle', () => {
  it('emits onStateChange and onPause when leaving active', () => {
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

  it('emits onResume when returning to active', () => {
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
});

describe('createAppLifecycle', () => {
  it('creates an entity with four signals', () => {
    const app = createAppLifecycle();
    expect(app.onStateChange).toBeDefined();
    expect(app.onResume).toBeDefined();
    expect(app.onPause).toBeDefined();
    expect(app.onBackButton).toBeDefined();
  });
});

describe('createWebLifecycleBackend', () => {
  it('reads a state without throwing', () => {
    expect(typeof createWebLifecycleBackend().getState()).toBe('string');
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
});

describe('disposeAppLifecycle', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setLifecycleBackend(backend);
    const app = createAppLifecycle();
    attachAppLifecycle(app);
    expect(() => disposeAppLifecycle(app)).not.toThrow();
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

describe('setLifecycleBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setLifecycleBackend(fakeBackend());
    setLifecycleBackend(null);
    expect(getLifecycleBackend()).not.toBeNull();
  });
});
