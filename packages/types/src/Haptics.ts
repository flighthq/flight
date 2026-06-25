// Haptic feedback seam. Free functions in @flighthq/haptics delegate to the active HapticsBackend
// (web default over navigator.vibrate, or a native host's). Each trigger returns false when the host
// lacks haptics or denies the request rather than throwing.
export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type HapticNotificationType = 'success' | 'warning' | 'error';

// Snapshot of what the active backend supports. Filled into a caller-owned `out` value; absent
// features resolve to false rather than throwing.
export interface HapticsCapabilities {
  amplitudeControl: boolean;
  customEvents: boolean;
  intensity: boolean;
  patterns: boolean;
  supported: boolean;
}

export interface HapticsBackend {
  // Cancels any in-progress vibration. Returns false when haptics are unavailable.
  cancel(): boolean;
  // Fills `out` with the backend's capabilities and returns it.
  capabilities(out: HapticsCapabilities): HapticsCapabilities;
  // Triggers a physical impact, with optional continuous intensity (0..1).
  impact(style: HapticImpactStyle, intensity?: number): boolean;
  // Reports whether haptics are available on the current device.
  isSupported(): boolean;
  notification(type: HapticNotificationType): boolean;
  // Warm-up hint to reduce first-trigger latency. Optional; no-op on backends without pre-allocation.
  prepare?(): void;
  selection(): boolean;
  vibrate(durationMs: number): boolean;
  // Vibrates with a pattern [onMs, offMs, ...]. Returns false on empty pattern or when unavailable.
  vibratePattern(pattern: Readonly<number[]>): boolean;
  // Amplitude-aware waveform (Android VibrationEffect.createWaveform). Optional; callers fall back to
  // vibratePattern(timings) when absent. repeat is the loop index into timings, or -1 for no repeat.
  vibrateWaveform?(timings: Readonly<number[]>, amplitudes: Readonly<number[]>, repeat?: number): boolean;
}
