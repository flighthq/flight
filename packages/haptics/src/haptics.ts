import type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsCapabilities,
  HostHapticsCapability,
} from '@flighthq/types/contract';

export function cancelDeviceVibration(hostHaptics: Readonly<HostHapticsCapability>): boolean {
  return hostHaptics.cancel();
}

export function getHapticsCapabilities(
  hostHaptics: Readonly<HostHapticsCapability>,
  out: HapticsCapabilities,
): HapticsCapabilities {
  return hostHaptics.capabilities(out);
}

export function isHapticsSupported(hostHaptics: Readonly<HostHapticsCapability>): boolean {
  return hostHaptics.isSupported();
}

// Warm-up hint. `prepare` is optional on the backend, so a host whose provider does not pre-allocate
// simply does nothing here — that is the absence of a capability, not a failure.
export function prepareHaptics(hostHaptics: Readonly<HostHapticsCapability>): void {
  hostHaptics.prepare?.();
}

export function triggerHapticImpact(
  hostHaptics: Readonly<HostHapticsCapability>,
  style: HapticImpactStyle,
  intensity?: number,
): boolean {
  return hostHaptics.impact(style, intensity ?? 1);
}

export function triggerHapticNotification(
  hostHaptics: Readonly<HostHapticsCapability>,
  type: HapticNotificationType,
): boolean {
  return hostHaptics.notification(type);
}

export function triggerHapticSelection(hostHaptics: Readonly<HostHapticsCapability>): boolean {
  return hostHaptics.selection();
}

export function vibrateDevice(hostHaptics: Readonly<HostHapticsCapability>, durationMs: number): boolean {
  return hostHaptics.vibrate(durationMs);
}

export function vibrateDevicePattern(
  hostHaptics: Readonly<HostHapticsCapability>,
  pattern: Readonly<number[]>,
): boolean {
  if (pattern.length === 0) return false;
  return hostHaptics.vibratePattern(pattern);
}

// Amplitude-aware waveform, falling back to a plain timing pattern when the selected provider does not
// implement one. The fallback drops amplitudes rather than failing: every backend can express timings.
export function vibrateDeviceWaveform(
  hostHaptics: Readonly<HostHapticsCapability>,
  timings: Readonly<number[]>,
  amplitudes: Readonly<number[]>,
  repeat = -1,
): boolean {
  const backend = hostHaptics;
  if (timings.length === 0) return false;
  if (backend.vibrateWaveform !== undefined) {
    return backend.vibrateWaveform(timings, amplitudes, repeat);
  }
  return backend.vibratePattern(timings);
}
