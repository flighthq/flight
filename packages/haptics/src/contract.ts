// Generated from crates/flight-haptics/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  cancelDeviceVibration,
  getHapticsCapabilities,
  isHapticsSupported,
  prepareHaptics,
  triggerHapticImpact,
  triggerHapticNotification,
  triggerHapticSelection,
  vibrateDevice,
  vibrateDevicePattern,
  vibrateDeviceWaveform,
} from './haptics.ts';
export {
  getHapticImpactStyleString,
  getHapticNotificationTypeString,
  getHapticsOperationString,
  parseHapticImpactStyle,
  parseHapticNotificationType,
  parseHapticsOperation,
} from './types.ts';
export type {
  HapticImpactStyle,
  HapticNotificationType,
  HapticsCapabilities,
  HapticsOperation,
  HostHapticsCapabilities,
  HostHapticsCapability,
} from './types.ts';
