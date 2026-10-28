// Generated from crates/flight-haptics/src/haptics.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { HapticImpactStyle, HapticNotificationType, HapticsCapabilities, HostHapticsCapability } from './types.ts';

export function cancelDeviceVibration(hostHaptics: Readonly<HostHapticsCapability>): boolean {
  return hostHaptics.cancel();
}

export function getHapticsCapabilities(out: HapticsCapabilities, hostHaptics: Readonly<HostHapticsCapability>): void {
  hostHaptics.capabilities(out);
}

export function isHapticsSupported(hostHaptics: Readonly<HostHapticsCapability>): boolean {
  return hostHaptics.isSupported();
}

export function prepareHaptics(hostHaptics: Readonly<HostHapticsCapability>): void {
  hostHaptics.prepare?.();
}

export function triggerHapticImpact(
  hostHaptics: Readonly<HostHapticsCapability>,
  style: HapticImpactStyle,
  intensity?: number,
): boolean {
  return hostHaptics.impact(style, intensity ?? 1.0);
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
  if (pattern.length === 0) {
    return false;
  }
  return hostHaptics.vibratePattern(pattern);
}

export function vibrateDeviceWaveform(
  hostHaptics: Readonly<HostHapticsCapability>,
  timings: Readonly<number[]>,
  amplitudes: Readonly<number[]>,
  repeat?: number,
): boolean {
  if (timings.length === 0) {
    return false;
  }
  if (hostHaptics.vibrateWaveform !== undefined) {
    return hostHaptics.vibrateWaveform(timings, amplitudes, repeat ?? -1);
  }
  return hostHaptics.vibratePattern(timings);
}
