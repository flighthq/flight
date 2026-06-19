import type { ScreenBackend, ScreenInfo } from '@flighthq/types';

import {
  createScreenInfo,
  createWebScreenBackend,
  getPrimaryScreen,
  getScreenBackend,
  getScreens,
  onScreenChange,
  setScreenBackend,
} from './screen';

function fakeBackend(count: number): ScreenBackend & { fire: () => void } {
  let listener: (() => void) | null = null;
  return {
    getScreens(out) {
      out.length = count;
      for (let i = 0; i < count; i += 1) {
        if (out[i] === undefined) out[i] = createScreenInfo();
        out[i].id = i;
        out[i].width = 100 + i;
        out[i].isPrimary = i === 0;
      }
      return out;
    },
    getPrimaryScreen(out) {
      out.id = 0;
      out.width = 100;
      out.isPrimary = true;
      return out;
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

afterEach(() => setScreenBackend(null));

describe('createScreenInfo', () => {
  it('allocates a zeroed info with scaleFactor 1 and isPrimary false', () => {
    const info = createScreenInfo();
    expect(info.scaleFactor).toBe(1);
    expect(info.isPrimary).toBe(false);
    expect(info.width).toBe(0);
    expect(info.height).toBe(0);
  });
});

describe('createWebScreenBackend', () => {
  it('returns a backend whose reads fill out without throwing', () => {
    const backend = createWebScreenBackend();
    const primary = createScreenInfo();
    expect(() => backend.getPrimaryScreen(primary)).not.toThrow();
    const screens: ScreenInfo[] = [];
    expect(() => backend.getScreens(screens)).not.toThrow();
    expect(Array.isArray(screens)).toBe(true);
  });

  it('returns an unsubscribe function from subscribe without throwing', () => {
    const backend = createWebScreenBackend();
    let unsubscribe: (() => void) | undefined;
    expect(() => {
      unsubscribe = backend.subscribe(() => {});
    }).not.toThrow();
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe?.()).not.toThrow();
  });
});

describe('getPrimaryScreen', () => {
  it('fills and returns the passed out object', () => {
    setScreenBackend(fakeBackend(2));
    const out = createScreenInfo();
    const result = getPrimaryScreen(out);
    expect(result).toBe(out);
    expect(out.isPrimary).toBe(true);
  });
});

describe('getScreenBackend', () => {
  it('falls back to a web backend', () => {
    expect(getScreenBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend(1);
    setScreenBackend(backend);
    expect(getScreenBackend()).toBe(backend);
  });
});

describe('getScreens', () => {
  it('fills the out array to the screen count and returns it', () => {
    setScreenBackend(fakeBackend(3));
    const out: ScreenInfo[] = [];
    const result = getScreens(out);
    expect(result).toBe(out);
    expect(out.length).toBe(3);
    expect(out[0].isPrimary).toBe(true);
  });
});

describe('onScreenChange', () => {
  it('delivers backend changes to the listener and unsubscribes', () => {
    const backend = fakeBackend(1);
    setScreenBackend(backend);
    let changes = 0;
    const unsubscribe = onScreenChange(() => changes++);
    backend.fire();
    expect(changes).toBe(1);
    unsubscribe();
    backend.fire();
    expect(changes).toBe(1);
  });
});

describe('setScreenBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setScreenBackend(fakeBackend(1));
    setScreenBackend(null);
    expect(getScreenBackend()).not.toBeNull();
  });
});
