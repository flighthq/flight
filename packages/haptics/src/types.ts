// Generated from crates/flight-haptics/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Physical impact styles supported by a haptics provider.
 */
export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';

/**
 * Notification feedback categories supported by a haptics provider.
 */
export type HapticNotificationType = 'success' | 'warning' | 'error';

/**
 * Every operation exposed by [`HostHapticsCapability`].
 */
export type HapticsOperation =
  | 'cancel'
  | 'capabilities'
  | 'impact'
  | 'isSupported'
  | 'notification'
  | 'prepare'
  | 'selection'
  | 'vibrate'
  | 'vibratePattern'
  | 'vibrateWaveform';

/**
 * Snapshot of the features exposed by a selected haptics provider.
 */
export interface HapticsCapabilities {
  amplitudeControl: boolean;
  customEvents: boolean;
  intensity: boolean;
  patterns: boolean;
  supported: boolean;
}

/**
 * Caller-supplied haptics provider. No native or ambient host is selected by this crate.
 */
export interface HostHapticsCapability {
  cancel: () => boolean;
  capabilities: (arg0: HapticsCapabilities) => void;
  impact: (arg0: HapticImpactStyle, arg1: number | undefined) => boolean;
  isSupported: () => boolean;
  notification: (arg0: HapticNotificationType) => boolean;
  prepare?: () => void;
  selection: () => boolean;
  vibrate: (arg0: number) => boolean;
  vibratePattern: (arg0: Readonly<number[]>) => boolean;
  vibrateWaveform?: (arg0: Readonly<number[]>, arg1: Readonly<number[]>, arg2: number | undefined) => boolean;
}

/**
 * Optional haptics provider slot aggregated by the future host package.
 */
export interface HostHapticsCapabilities {
  readonly engine?: HostHapticsCapability;
}

export function getHapticImpactStyleString(value: HapticImpactStyle): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'light':
        return 'light';
      case 'medium':
        return 'medium';
      case 'heavy':
        return 'heavy';
      case 'soft':
        return 'soft';
      case 'rigid':
        return 'rigid';
    }
  })();
}

export function getHapticNotificationTypeString(value: HapticNotificationType): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
    }
  })();
}

export function getHapticsOperationString(value: HapticsOperation): string {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'cancel':
        return 'cancel';
      case 'capabilities':
        return 'capabilities';
      case 'impact':
        return 'impact';
      case 'isSupported':
        return 'isSupported';
      case 'notification':
        return 'notification';
      case 'prepare':
        return 'prepare';
      case 'selection':
        return 'selection';
      case 'vibrate':
        return 'vibrate';
      case 'vibratePattern':
        return 'vibratePattern';
      case 'vibrateWaveform':
        return 'vibrateWaveform';
    }
  })();
}

export function parseHapticImpactStyle(value: string): HapticImpactStyle | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'light':
        return 'light';
      case 'medium':
        return 'medium';
      case 'heavy':
        return 'heavy';
      case 'soft':
        return 'soft';
      case 'rigid':
        return 'rigid';
      default:
        return undefined;
    }
  })();
}

export function parseHapticNotificationType(value: string): HapticNotificationType | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'success':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return undefined;
    }
  })();
}

export function parseHapticsOperation(value: string): HapticsOperation | undefined {
  return (() => {
    const matchValue = value;
    switch (matchValue) {
      case 'cancel':
        return 'cancel';
      case 'capabilities':
        return 'capabilities';
      case 'impact':
        return 'impact';
      case 'isSupported':
        return 'isSupported';
      case 'notification':
        return 'notification';
      case 'prepare':
        return 'prepare';
      case 'selection':
        return 'selection';
      case 'vibrate':
        return 'vibrate';
      case 'vibratePattern':
        return 'vibratePattern';
      case 'vibrateWaveform':
        return 'vibrateWaveform';
      default:
        return undefined;
    }
  })();
}
