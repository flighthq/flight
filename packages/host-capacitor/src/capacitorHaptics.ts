import type {
  HapticImpactStyle,
  HapticsBackend,
  HapticsCapabilities,
  HapticNotificationType,
  CapacitorApi,
} from '@flighthq/types';

// Maps Flight's HapticsBackend onto Capacitor's `@capacitor/haptics`. Every Capacitor call is an async
// void, whereas the HapticsBackend triggers are synchronous booleans, so each adapter method fires the
// async call and forgets, reporting `true` (the request was issued). Flight's five impact styles fold
// onto Capacitor's three ('soft' → LIGHT, 'rigid' → HEAVY); notification types uppercase directly.
// `selection` maps to `selectionChanged`. Capacitor has no cancel, no arbitrary vibration pattern, and
// no amplitude waveform, so cancel/vibratePattern report false and the optional vibrateWaveform is
// omitted; the intensity argument to `impact` is not expressible and is ignored.
export function createCapacitorHapticsBackend(capacitor: CapacitorApi): HapticsBackend {
  const haptics = capacitor.haptics;
  return {
    cancel() {
      // Capacitor exposes no cancel-vibration call.
      return false;
    },
    capabilities(out: HapticsCapabilities): HapticsCapabilities {
      out.supported = true;
      out.intensity = false;
      out.patterns = false;
      out.amplitudeControl = false;
      out.customEvents = false;
      return out;
    },
    impact(style: HapticImpactStyle) {
      haptics.impact({ style: toCapacitorImpactStyle(style) }).catch(() => {});
      return true;
    },
    isSupported() {
      return true;
    },
    notification(type: HapticNotificationType) {
      haptics.notification({ type: type.toUpperCase() }).catch(() => {});
      return true;
    },
    selection() {
      haptics.selectionChanged().catch(() => {});
      return true;
    },
    vibrate(durationMs: number) {
      haptics.vibrate({ duration: durationMs }).catch(() => {});
      return true;
    },
    vibratePattern() {
      // Capacitor's vibrate takes a single duration, not an on/off pattern; report unsupported.
      return false;
    },
  };
}

// Capacitor's ImpactStyle is HEAVY/MEDIUM/LIGHT; Flight's extra 'soft'/'rigid' fold onto the nearest.
function toCapacitorImpactStyle(style: HapticImpactStyle): string {
  if (style === 'heavy' || style === 'rigid') return 'HEAVY';
  if (style === 'light' || style === 'soft') return 'LIGHT';
  return 'MEDIUM';
}
