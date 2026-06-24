import type { HapticImpactStyle, HapticNotificationType, HapticsBackend, HapticsCapabilities } from '@flighthq/types';

import {
  cancelDeviceVibration,
  createWebHapticsBackend,
  getHapticsBackend,
  getHapticsCapabilities,
  isHapticsSupported,
  prepareHaptics,
  setHapticsBackend,
  triggerHapticImpact,
  triggerHapticNotification,
  triggerHapticSelection,
  vibrateDevice,
  vibrateDevicePattern,
  vibrateDeviceWaveform,
} from './haptics';

function makeCapabilities(overrides: Partial<HapticsCapabilities> = {}): HapticsCapabilities {
  return {
    amplitudeControl: false,
    customEvents: false,
    intensity: false,
    patterns: false,
    supported: false,
    ...overrides,
  };
}

function fakeBackend(): HapticsBackend & {
  cancelCount: number;
  duration: number;
  lastPattern: Readonly<number[]> | null;
  lastWaveform: { amplitudes: Readonly<number[]>; repeat: number | undefined; timings: Readonly<number[]> } | null;
  prepared: number;
  style: HapticImpactStyle | null;
  styleIntensity: number | undefined;
  type: HapticNotificationType | null;
  selections: number;
} {
  return {
    cancelCount: 0,
    duration: -1,
    lastPattern: null,
    lastWaveform: null,
    prepared: 0,
    style: null,
    styleIntensity: undefined,
    type: null,
    selections: 0,
    cancel() {
      this.cancelCount += 1;
      return true;
    },
    capabilities(out: HapticsCapabilities): HapticsCapabilities {
      out.amplitudeControl = true;
      out.customEvents = false;
      out.intensity = true;
      out.patterns = true;
      out.supported = true;
      return out;
    },
    impact(style: HapticImpactStyle, intensity?: number) {
      this.style = style;
      this.styleIntensity = intensity;
      return true;
    },
    isSupported() {
      return true;
    },
    notification(type: HapticNotificationType) {
      this.type = type;
      return true;
    },
    prepare() {
      this.prepared += 1;
    },
    selection() {
      this.selections += 1;
      return true;
    },
    vibrate(durationMs: number) {
      this.duration = durationMs;
      return true;
    },
    vibratePattern(pattern: Readonly<number[]>) {
      this.lastPattern = pattern;
      return true;
    },
    vibrateWaveform(timings: Readonly<number[]>, amplitudes: Readonly<number[]>, repeat?: number) {
      this.lastWaveform = { amplitudes, repeat, timings };
      return true;
    },
  };
}

afterEach(() => setHapticsBackend(null));

describe('cancelDeviceVibration', () => {
  it('forwards to backend cancel', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(cancelDeviceVibration()).toBe(true);
    expect(backend.cancelCount).toBe(1);
  });

  it('returns false when haptics unavailable (jsdom)', () => {
    expect(cancelDeviceVibration()).toBe(false);
  });
});

describe('createWebHapticsBackend', () => {
  it('returns false for every method without throwing when vibrate is unavailable (jsdom)', () => {
    const backend = createWebHapticsBackend();
    expect(backend.vibrate(10)).toBe(false);
    expect(backend.impact('heavy')).toBe(false);
    expect(backend.impact('rigid')).toBe(false);
    expect(backend.impact('soft')).toBe(false);
    expect(backend.notification('error')).toBe(false);
    expect(backend.selection()).toBe(false);
    expect(backend.vibratePattern([100, 50, 100])).toBe(false);
    expect(backend.cancel()).toBe(false);
    expect(backend.isSupported()).toBe(false);
  });

  it('returns false for empty pattern without throwing', () => {
    const backend = createWebHapticsBackend();
    expect(backend.vibratePattern([])).toBe(false);
  });

  it('returns false for waveform with empty timings', () => {
    const backend = createWebHapticsBackend();
    expect(backend.vibrateWaveform!([], [], undefined)).toBe(false);
  });

  it('fills capabilities for web (no vibrate)', () => {
    const backend = createWebHapticsBackend();
    const out = makeCapabilities();
    backend.capabilities(out);
    expect(out.supported).toBe(false);
    expect(out.patterns).toBe(false);
    expect(out.intensity).toBe(false);
    expect(out.amplitudeControl).toBe(false);
    expect(out.customEvents).toBe(false);
  });

  it('prepare is a no-op and does not throw', () => {
    const backend = createWebHapticsBackend();
    expect(() => backend.prepare!()).not.toThrow();
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

describe('getHapticsCapabilities', () => {
  it('fills out via the fake backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    const out = makeCapabilities();
    const result = getHapticsCapabilities(out);
    expect(result).toBe(out);
    expect(out.supported).toBe(true);
    expect(out.intensity).toBe(true);
    expect(out.patterns).toBe(true);
    expect(out.amplitudeControl).toBe(true);
    expect(out.customEvents).toBe(false);
  });

  it('fills out from web backend when no backend is set', () => {
    const out = makeCapabilities();
    getHapticsCapabilities(out);
    expect(out.supported).toBe(false);
  });
});

describe('isHapticsSupported', () => {
  it('returns true from fake backend', () => {
    setHapticsBackend(fakeBackend());
    expect(isHapticsSupported()).toBe(true);
  });

  it('returns false when vibrate is unavailable (jsdom)', () => {
    expect(isHapticsSupported()).toBe(false);
  });
});

describe('prepareHaptics', () => {
  it('calls prepare on backends that provide it', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    prepareHaptics();
    expect(backend.prepared).toBe(1);
  });

  it('does not throw when backend has no prepare method', () => {
    const backend = fakeBackend();
    // Simulate a backend with no optional prepare
    (backend as HapticsBackend & { prepare?: () => void }).prepare = undefined;
    setHapticsBackend(backend);
    expect(() => prepareHaptics()).not.toThrow();
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
    expect(backend.styleIntensity).toBeUndefined();
  });

  it('forwards intensity to the backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    triggerHapticImpact('heavy', 0.5);
    expect(backend.style).toBe('heavy');
    expect(backend.styleIntensity).toBe(0.5);
  });

  it('supports rigid and soft styles', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    triggerHapticImpact('rigid');
    expect(backend.style).toBe('rigid');
    triggerHapticImpact('soft');
    expect(backend.style).toBe('soft');
  });

  it('web backend clamps intensity to 0..1', () => {
    const webBackend = createWebHapticsBackend();
    // Should not throw on out-of-range intensity even if vibrate returns false
    expect(() => webBackend.impact('heavy', 2)).not.toThrow();
    expect(() => webBackend.impact('heavy', -0.5)).not.toThrow();
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

describe('vibrateDevicePattern', () => {
  it('forwards pattern to the active backend', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    const pattern = [100, 50, 100] as const;
    expect(vibrateDevicePattern(pattern)).toBe(true);
    expect(backend.lastPattern).toEqual(pattern);
  });

  it('returns false for empty pattern', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(vibrateDevicePattern([])).toBe(false);
  });

  it('returns false when haptics unavailable (jsdom)', () => {
    expect(vibrateDevicePattern([100, 50, 100])).toBe(false);
  });
});

describe('vibrateDeviceWaveform', () => {
  it('calls vibrateWaveform on backends that support it', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    const timings = [100, 50, 100] as const;
    const amplitudes = [255, 0, 128] as const;
    expect(vibrateDeviceWaveform(timings, amplitudes, 0)).toBe(true);
    expect(backend.lastWaveform).toEqual({ timings, amplitudes, repeat: 0 });
  });

  it('defaults repeat to -1', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    vibrateDeviceWaveform([100], [255]);
    expect(backend.lastWaveform?.repeat).toBe(-1);
  });

  it('falls back to vibratePattern when backend lacks vibrateWaveform', () => {
    const backend = fakeBackend();
    (backend as HapticsBackend).vibrateWaveform = undefined;
    setHapticsBackend(backend);
    const timings = [100, 50] as const;
    const amplitudes = [255, 0] as const;
    expect(vibrateDeviceWaveform(timings, amplitudes)).toBe(true);
    expect(backend.lastPattern).toEqual(timings);
    expect(backend.lastWaveform).toBeNull();
  });

  it('returns false for empty timings', () => {
    const backend = fakeBackend();
    setHapticsBackend(backend);
    expect(vibrateDeviceWaveform([], [], undefined)).toBe(false);
  });

  it('returns false when haptics unavailable (jsdom)', () => {
    expect(vibrateDeviceWaveform([100], [255])).toBe(false);
  });
});
