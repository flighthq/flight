// Haptic feedback seam. Free functions in @flighthq/haptics delegate to the active HapticsBackend
// (web default over navigator.vibrate, or a native host's). Each trigger returns false when the host
// lacks haptics or denies the request rather than throwing.
export type HapticImpactStyle = 'light' | 'medium' | 'heavy';
export type HapticNotificationType = 'success' | 'warning' | 'error';

export interface HapticsBackend {
  vibrate(durationMs: number): boolean;
  impact(style: HapticImpactStyle): boolean;
  notification(type: HapticNotificationType): boolean;
  selection(): boolean;
}
