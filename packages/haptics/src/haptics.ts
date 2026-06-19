import type { HapticImpactStyle, HapticNotificationType, HapticsBackend } from '@flighthq/types';

// Builds the default web backend over navigator.vibrate. Every method returns false when the Vibration
// API is absent (jsdom, desktop browsers) or the call fails, rather than throwing. Web vibration is a
// coarse approximation of native haptics: it can only buzz the motor for a duration/pattern.
export function createWebHapticsBackend(): HapticsBackend {
  return {
    vibrate(durationMs: number): boolean {
      return webVibrate(durationMs);
    },
    impact(style: HapticImpactStyle): boolean {
      return webVibrate(style === 'heavy' ? 30 : style === 'medium' ? 20 : 10);
    },
    notification(type: HapticNotificationType): boolean {
      const pattern = type === 'error' ? [20, 60, 20] : type === 'warning' ? [20, 60, 20, 60] : [15, 50, 15];
      return webVibrate(pattern);
    },
    selection(): boolean {
      return webVibrate(5);
    },
  };
}

// The active haptics backend, or a lazily-created web default. There is always a backend.
export function getHapticsBackend(): HapticsBackend {
  if (_backend === null) _backend = createWebHapticsBackend();
  return _backend;
}

// Installs a native host haptics backend; pass null to fall back to the web default.
export function setHapticsBackend(backend: HapticsBackend | null): void {
  _backend = backend;
}

// Triggers a physical impact ('light' | 'medium' | 'heavy'). Returns false when haptics are unavailable.
export function triggerHapticImpact(style: HapticImpactStyle): boolean {
  return getHapticsBackend().impact(style);
}

// Triggers a notification cue ('success' | 'warning' | 'error'). Returns false when haptics are unavailable.
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
