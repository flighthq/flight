import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsCapabilities,
  HasInputHaptics,
} from '@flighthq/types/contract';

export function cancelDeviceVibration(host: HasInputHaptics): boolean {
  return host.input.haptics.cancel();
}

export function getHapticsCapabilities(host: HasInputHaptics, out: HapticsCapabilities): HapticsCapabilities {
  return host.input.haptics.capabilities(out);
}

export function isHapticsSupported(host: HasInputHaptics): boolean {
  return host.input.haptics.isSupported();
}

// Warm-up hint. `prepare` is optional on the backend, so a host whose provider does not pre-allocate
// simply does nothing here — that is the absence of a capability, not a failure.
export function prepareHaptics(host: HasInputHaptics): void {
  host.input.haptics.prepare?.();
}

export function triggerHapticImpact(host: HasInputHaptics, style: HapticImpactStyle, intensity?: number): boolean {
  return host.input.haptics.impact(style, intensity ?? 1);
}

export function triggerHapticNotification(host: HasInputHaptics, type: HapticNotificationType): boolean {
  return host.input.haptics.notification(type);
}

export function triggerHapticSelection(host: HasInputHaptics): boolean {
  return host.input.haptics.selection();
}

export function vibrateDevice(host: HasInputHaptics, durationMs: number): boolean {
  return host.input.haptics.vibrate(durationMs);
}

export function vibrateDevicePattern(host: HasInputHaptics, pattern: Readonly<number[]>): boolean {
  if (pattern.length === 0) return false;
  return host.input.haptics.vibratePattern(pattern);
}

// Amplitude-aware waveform, falling back to a plain timing pattern when the selected provider does not
// implement one. The fallback drops amplitudes rather than failing: every backend can express timings.
export function vibrateDeviceWaveform(
  host: HasInputHaptics,
  timings: Readonly<number[]>,
  amplitudes: Readonly<number[]>,
  repeat = -1,
): boolean {
  const backend = host.input.haptics;
  if (timings.length === 0) return false;
  if (backend.vibrateWaveform !== undefined) {
    return backend.vibrateWaveform(timings, amplitudes, repeat);
  }
  return backend.vibratePattern(timings);
}
