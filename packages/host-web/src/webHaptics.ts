import { createEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  HapticImpactStyle,
  HapticNotificationType,
  HapticsBackend,
  HapticsCapabilities,
} from '@flighthq/types/contract';

// The web haptics provider, over navigator.vibrate. Every method returns false when the Vibration API is
// absent (jsdom, desktop browsers) or the call throws, rather than propagating — an unavailable motor is
// an expected outcome here, not a programmer error.
//
// Web vibration is a coarse approximation of native haptics: it can only buzz the motor for a duration or
// a pattern, which is why `capabilities` reports no intensity and no amplitude control even when the API
// is present. `vibrateWaveform` is deliberately absent rather than faked, so callers fall back to
// `vibratePattern` and drop amplitudes honestly instead of silently ignoring them here.
export const webHapticsBackend: HapticsBackend = createEntity<EntityWithoutRuntime<HapticsBackend>>({
  cancel(): boolean {
    return _webVibrate(0);
  },
  capabilities(out: HapticsCapabilities): HapticsCapabilities {
    const supported = _isVibrateAvailable();
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
    return _webVibrate(ms);
  },
  isSupported(): boolean {
    return _isVibrateAvailable();
  },
  notification(type: HapticNotificationType): boolean {
    const pattern = type === 'error' ? [20, 60, 20] : type === 'warning' ? [20, 60, 20, 60] : [15, 50, 15];
    return _webVibrate(pattern);
  },
  prepare(): void {},
  selection(): boolean {
    return _webVibrate(5);
  },
  vibrate(durationMs: number): boolean {
    return _webVibrate(durationMs);
  },
  vibratePattern(pattern: Readonly<number[]>): boolean {
    if (pattern.length === 0) return false;
    return _webVibrate(pattern as number[]);
  },
});

function _isVibrateAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function _webVibrate(pattern: number | readonly number[]): boolean {
  if (!_isVibrateAvailable()) return false;
  try {
    return navigator.vibrate(pattern as number | number[]);
  } catch {
    return false;
  }
}
