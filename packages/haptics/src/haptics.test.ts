import type { HapticImpactStyle, HapticNotificationType, HapticsBackend } from '@flighthq/types';

import {
  createWebHapticsBackend,
  getHapticsBackend,
  setHapticsBackend,
  triggerHapticImpact,
  triggerHapticNotification,
  triggerHapticSelection,
  vibrateDevice,
} from './haptics';

function fakeBackend(): HapticsBackend & {
  duration: number;
  style: HapticImpactStyle | null;
  type: HapticNotificationType | null;
  selections: number;
} {
  return {
    duration: -1,
    style: null,
    type: null,
    selections: 0,
    vibrate(durationMs) {
      this.duration = durationMs;
      return true;
    },
    impact(style) {
      this.style = style;
      return true;
    },
    notification(type) {
      this.type = type;
      return true;
    },
    selection() {
      this.selections += 1;
      return true;
    },
  };
}

afterEach(() => setHapticsBackend(null));

describe('createWebHapticsBackend', () => {
  it('returns false for every method without throwing when vibrate is unavailable (jsdom)', () => {
    const backend = createWebHapticsBackend();
    expect(backend.vibrate(10)).toBe(false);
    expect(backend.impact('heavy')).toBe(false);
    expect(backend.notification('error')).toBe(false);
    expect(backend.selection()).toBe(false);
  });
});

describe('getHapticsBackend', () => {
  it('falls back to a web backend', () => {
    expect(getHapticsBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(getHapticsBackend()).toBe(backend);
  });
});

describe('setHapticsBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setHapticsBackend(fakeBackend());
    setHapticsBackend(null);
    expect(getHapticsBackend()).not.toBeNull();
  });
});

describe('triggerHapticImpact', () => {
  it('forwards style to the active backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(triggerHapticImpact('medium')).toBe(true);
    expect(backend.style).toBe('medium');
  });
});

describe('triggerHapticNotification', () => {
  it('forwards type to the active backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(triggerHapticNotification('success')).toBe(true);
    expect(backend.type).toBe('success');
  });
});

describe('triggerHapticSelection', () => {
  it('triggers a selection on the active backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(triggerHapticSelection()).toBe(true);
    expect(backend.selections).toBe(1);
  });
});

describe('vibrateDevice', () => {
  it('forwards duration to the active backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(vibrateDevice(42)).toBe(true);
    expect(backend.duration).toBe(42);
  });
});
