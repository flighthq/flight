import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsBackend,
  HapticsCapabilities,
} from '@flighthq/types/contract';

export function cancelDeviceVibration(): boolean {
  return getHapticsBackend().cancel();
}

// Builds the default web backend over navigator.vibrate. Every method returns false when the Vibration
// API is absent (jsdom, desktop browsers) or the call fails, rather than throwing. Web vibration is a
// coarse approximation of native haptics: it can only buzz the motor for a duration/pattern.
export function createWebHapticsBackend(): HapticsBackend {
  return {
    cancel(): boolean {
      return _webVibrate(0, 'cancel');
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
      return _webVibrate(ms, 'impact');
    },
    isSupported(): boolean {
      return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    },
    notification(type: HapticNotificationType): boolean {
      const pattern = type === 'error' ? [20, 60, 20] : type === 'warning' ? [20, 60, 20, 60] : [15, 50, 15];
      return _webVibrate(pattern, 'notification');
    },
    prepare(): void {},
    selection(): boolean {
      return _webVibrate(5, 'selection');
    },
    vibrate(durationMs: number): boolean {
      return _webVibrate(durationMs, 'vibrate');
    },
    vibratePattern(pattern: Readonly<number[]>): boolean {
      if (pattern.length === 0) return false;
      return _webVibrate(pattern as number[], 'vibratePattern');
    },
    vibrateWaveform(timings: Readonly<number[]>, _amplitudes: Readonly<number[]>, repeat?: number): boolean {
      if (timings.length === 0) return false;
      void repeat;
      return _webVibrate(timings as number[], 'vibrateWaveform');
    },
  };
}

export function explainHapticsBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getHapticsBackend(): HapticsBackend {
  return _custom ?? _host ?? _sentinel;
}

export function getHapticsCapabilities(out: HapticsCapabilities): HapticsCapabilities {
  return getHapticsBackend().capabilities(out);
}

export function installHapticsHostBackend(backend: HapticsBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function isHapticsSupported(): boolean {
  return getHapticsBackend().isSupported();
}

export function observeHapticsHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function prepareHaptics(): void {
  getHapticsBackend().prepare?.();
}

export function resetHapticsBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

export function setHapticsBackend(backend: HapticsBackend | null): void {
  _custom = backend;
}

export function triggerHapticImpact(style: HapticImpactStyle, intensity?: number): boolean {
  return getHapticsBackend().impact(style, intensity ?? 1);
}

export function triggerHapticNotification(type: HapticNotificationType): boolean {
  return getHapticsBackend().notification(type);
}

export function triggerHapticSelection(): boolean {
  return getHapticsBackend().selection();
}

export function vibrateDevice(durationMs: number): boolean {
  return getHapticsBackend().vibrate(durationMs);
}

export function vibrateDevicePattern(pattern: Readonly<number[]>): boolean {
  if (pattern.length === 0) return false;
  return getHapticsBackend().vibratePattern(pattern);
}

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

let _custom: HapticsBackend | null = null;
let _host: HapticsBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;

const _sentinel: HapticsBackend = {
  cancel(): boolean {
    return false;
  },
  capabilities(out: HapticsCapabilities): HapticsCapabilities {
    out.amplitudeControl = false;
    out.customEvents = false;
    out.intensity = false;
    out.patterns = false;
    out.supported = false;
    return out;
  },
  impact(): boolean {
    return false;
  },
  isSupported(): boolean {
    return false;
  },
  notification(): boolean {
    return false;
  },
  prepare(): void {},
  selection(): boolean {
    return false;
  },
  vibrate(): boolean {
    return false;
  },
  vibratePattern(): boolean {
    return false;
  },
};

function _webVibrate(pattern: number | readonly number[], operation: string): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator) || typeof navigator.vibrate !== 'function') {
    observeHapticsHostResult(operation, false);
    return false;
  }
  try {
    const result = navigator.vibrate(pattern as number | number[]);
    observeHapticsHostResult(operation, result);
    return result;
  } catch {
    observeHapticsHostResult(operation, false);
    return false;
  }
}
