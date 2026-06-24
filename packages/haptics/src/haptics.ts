import type { HapticImpactStyle, HapticNotificationType, HapticsBackend, HapticsCapabilities } from '@flighthq/types';

// Cancels any in-progress device vibration. Returns false when haptics are unavailable.
export function cancelDeviceVibration(): boolean {
  return getHapticsBackend().cancel();
}

// Builds the default web backend over navigator.vibrate. Every method returns false when the Vibration
// API is absent (jsdom, desktop browsers) or the call fails, rather than throwing. Web vibration is a
// coarse approximation of native haptics: it can only buzz the motor for a duration/pattern.
export function createWebHapticsBackend(): HapticsBackend {
  return {
    cancel(): boolean {
      return webVibrate(0);
    },
    capabilities(out: HapticsCapabilities): HapticsCapabilities {
      const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
      out.amplitudeControl = false;
      out.customEvents = false;
      out.intensity = false;
      out.patterns = supported;
      out.supported = supported;
      return out;
    },
    impact(style: HapticImpactStyle, intensity?: number): boolean {
      const base = style === 'heavy' || style === 'rigid' ? 30 : style === 'medium' ? 20 : style === 'soft' ? 25 : 10;
      const ms = intensity !== undefined ? Math.round(base * Math.max(0, Math.min(1, intensity))) : base;
      return webVibrate(ms);
    },
    isSupported(): boolean {
      return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    },
    notification(type: HapticNotificationType): boolean {
      const pattern = type === 'error' ? [20, 60, 20] : type === 'warning' ? [20, 60, 20, 60] : [15, 50, 15];
      return webVibrate(pattern);
    },
    prepare(): void {
      // No-op on web; native backends may pre-allocate feedback generators to reduce latency.
    },
    selection(): boolean {
      return webVibrate(5);
    },
    vibrate(durationMs: number): boolean {
      return webVibrate(durationMs);
    },
    vibratePattern(pattern: Readonly<number[]>): boolean {
      if (pattern.length === 0) return false;
      return webVibrate(pattern as number[]);
    },
    vibrateWaveform(timings: Readonly<number[]>, _amplitudes: Readonly<number[]>, repeat?: number): boolean {
      // Web backend ignores amplitudes; falls back to vibratePattern. repeat is unsupported on web.
      if (timings.length === 0) return false;
      void repeat;
      return webVibrate(timings as number[]);
    },
  };
}

// The active haptics backend, or a lazily-created web default. There is always a backend.
export function getHapticsBackend(): HapticsBackend {
  if (_backend === null) _backend = createWebHapticsBackend();
  return _backend;
}

// Fills out with the capabilities of the active HapticsBackend. Returns the same out object.
export function getHapticsCapabilities(out: HapticsCapabilities): HapticsCapabilities {
  return getHapticsBackend().capabilities(out);
}

// Returns true if the active backend reports that haptics are available on the current device.
export function isHapticsSupported(): boolean {
  return getHapticsBackend().isSupported();
}

// Warm-up hint to reduce first-trigger latency (mirrors UIFeedbackGenerator.prepare). No-op on
// backends that do not support pre-allocation. Always safe to call.
export function prepareHaptics(): void {
  getHapticsBackend().prepare?.();
}

// Installs a native host haptics backend; pass null to fall back to the web default.
export function setHapticsBackend(backend: HapticsBackend | null): void {
  _backend = backend;
}

// Triggers a physical impact at the given style, with optional continuous intensity (0..1).
// Intensity defaults to 1 when omitted. Returns false when haptics are unavailable.
export function triggerHapticImpact(style: HapticImpactStyle, intensity?: number): boolean {
  return getHapticsBackend().impact(style, intensity);
}

// Triggers a semantic notification cue ('success' | 'warning' | 'error').
// Returns false when haptics are unavailable.
export function triggerHapticNotification(type: HapticNotificationType): boolean {
  return getHapticsBackend().notification(type);
}

// Triggers a light selection tick. Returns false when haptics are unavailable.
export function triggerHapticSelection(): boolean {
  return getHapticsBackend().selection();
}

// Vibrates the device for the given duration in milliseconds. Returns false when unavailable or denied.
export function vibrateDevice(durationMs: number): boolean {
  return getHapticsBackend().vibrate(durationMs);
}

// Vibrates the device using a pattern array [onMs, offMs, onMs, ...] matching the Web Vibration API.
// Returns false on empty pattern or when haptics are unavailable.
export function vibrateDevicePattern(pattern: Readonly<number[]>): boolean {
  if (pattern.length === 0) return false;
  return getHapticsBackend().vibratePattern(pattern);
}

// Vibrates using an amplitude-aware waveform (maps to Android VibrationEffect.createWaveform).
// timings and amplitudes must have equal length; amplitudes are 0..255 (per Android convention).
// repeat is the index into timings at which to loop, or -1 (default) for no repeat.
// Backends that lack native waveform support fall back to vibratePattern(timings).
// Returns false on empty timings or when haptics are unavailable.
export function vibrateDeviceWaveform(
  timings: Readonly<number[]>,
  amplitudes: Readonly<number[]>,
  repeat = -1,
): boolean {
  const backend = getHapticsBackend();
  if (timings.length === 0) return false;
  if (backend.vibrateWaveform !== undefined) {
    return backend.vibrateWaveform(timings, amplitudes, repeat);
  }
  return backend.vibratePattern(timings);
}

let _backend: HapticsBackend | null = null;

function webVibrate(pattern: number | readonly number[]): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    return navigator.vibrate(pattern as number | number[]);
  } catch {
    return false;
  }
}
