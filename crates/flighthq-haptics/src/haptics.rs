//! Haptics free functions and backend management.
//!
//! Ports the TypeScript `@flighthq/haptics` package. The TS package always has
//! a backend: it lazily creates a web backend over `navigator.vibrate` that
//! returns `false` for every method when the Vibration API is absent. In the
//! Rust port there is no `navigator`, so the in-box default is a sentinel
//! backend that no-ops and returns `false` for every method — the same observed
//! behavior as the TS web backend in jsdom or on a desktop browser. A native
//! mobile host fills the real backend later via [`set_haptics_backend`].

use flighthq_types::{
    HapticImpactStyle, HapticNotificationType, HapticsBackend, HapticsCapabilities,
};
use std::sync::{Arc, Mutex};

/// Cancels any in-progress device vibration. Returns `false` when haptics are
/// unavailable.
pub fn cancel_device_vibration() -> bool {
    get_haptics_backend().cancel()
}

/// Builds the default haptics backend. Every method returns `false` without
/// performing any vibration, mirroring the TS web backend when the Vibration
/// API is unavailable. A native host replaces this via [`set_haptics_backend`].
pub fn create_default_haptics_backend() -> Arc<dyn HapticsBackend> {
    Arc::new(DefaultHapticsBackend)
}

/// Fills `out` with the capabilities of the active backend (mirrors the TS
/// `getHapticsCapabilities(out)` out-param).
pub fn get_haptics_capabilities(out: &mut HapticsCapabilities) {
    get_haptics_backend().capabilities(out);
}

/// Returns the active haptics backend, or a lazily-created default. There is
/// always a backend.
pub fn get_haptics_backend() -> Arc<dyn HapticsBackend> {
    let mut guard = BACKEND.lock().expect("haptics backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_default_haptics_backend());
    }
    Arc::clone(guard.as_ref().expect("haptics backend just initialized"))
}

/// Returns `true` if the active backend reports that haptics are available on
/// the current device.
pub fn is_haptics_supported() -> bool {
    get_haptics_backend().is_supported()
}

/// Warm-up hint to reduce first-trigger latency. No-op on backends that do not
/// support pre-allocation. Always safe to call.
pub fn prepare_haptics() {
    get_haptics_backend().prepare();
}

/// Installs a native host haptics backend. Pass `None` to fall back to the
/// default backend.
pub fn set_haptics_backend(backend: Option<Arc<dyn HapticsBackend>>) {
    let mut guard = BACKEND.lock().expect("haptics backend mutex poisoned");
    *guard = backend;
}

/// Triggers a physical impact with optional continuous intensity (0..1).
/// `None` intensity uses the style default. Returns `false` when haptics are
/// unavailable.
pub fn trigger_haptic_impact(style: HapticImpactStyle, intensity: Option<f64>) -> bool {
    get_haptics_backend().impact(style, intensity)
}

/// Triggers a notification cue. Returns `false` when haptics are unavailable.
pub fn trigger_haptic_notification(notification_type: HapticNotificationType) -> bool {
    get_haptics_backend().notification(notification_type)
}

/// Triggers a light selection tick. Returns `false` when haptics are
/// unavailable.
pub fn trigger_haptic_selection() -> bool {
    get_haptics_backend().selection()
}

/// Vibrates the device for `duration_ms`. Returns `false` when unavailable or
/// denied.
pub fn vibrate_device(duration_ms: u32) -> bool {
    get_haptics_backend().vibrate(duration_ms)
}

/// Vibrates the device using a pattern array `[onMs, offMs, onMs, ...]`.
/// Returns `false` on an empty pattern or when haptics are unavailable.
pub fn vibrate_device_pattern(pattern: &[u32]) -> bool {
    if pattern.is_empty() {
        return false;
    }
    get_haptics_backend().vibrate_pattern(pattern)
}

/// Vibrates using an amplitude-aware waveform (maps to Android
/// `VibrationEffect.createWaveform`). `repeat` is the index into `timings` to
/// loop at, or `-1` for no repeat. Backends that lack native waveform support
/// fall back to `vibrate_pattern(timings)`. Returns `false` on empty timings or
/// when haptics are unavailable.
pub fn vibrate_device_waveform(timings: &[u32], amplitudes: &[u32], repeat: i64) -> bool {
    if timings.is_empty() {
        return false;
    }
    let backend = get_haptics_backend();
    match backend.vibrate_waveform(timings, amplitudes, repeat) {
        Some(result) => result,
        None => backend.vibrate_pattern(timings),
    }
}

static BACKEND: Mutex<Option<Arc<dyn HapticsBackend>>> = Mutex::new(None);

// The in-box sentinel backend: no hardware, so every method no-ops and reports
// failure rather than panicking. Matches the TS web backend under jsdom.
struct DefaultHapticsBackend;

impl HapticsBackend for DefaultHapticsBackend {
    fn vibrate(&self, _duration_ms: u32) -> bool {
        false
    }
    fn impact(&self, _style: HapticImpactStyle, _intensity: Option<f64>) -> bool {
        false
    }
    fn notification(&self, _notification_type: HapticNotificationType) -> bool {
        false
    }
    fn selection(&self) -> bool {
        false
    }
    fn cancel(&self) -> bool {
        false
    }
    fn capabilities(&self, out: &mut HapticsCapabilities) {
        // Mirrors the TS web backend with the Vibration API absent: nothing is
        // supported. Read no inputs from `out`; overwrite every field.
        out.amplitude_control = false;
        out.custom_events = false;
        out.intensity = false;
        out.patterns = false;
        out.supported = false;
    }
    fn is_supported(&self) -> bool {
        false
    }
    fn vibrate_pattern(&self, _pattern: &[u32]) -> bool {
        false
    }
    // prepare() defaults to a no-op (the trait default), matching the web backend.
    // The web backend defines vibrate_waveform (it is present, not absent), so it
    // returns Some(false) here rather than None — callers do not fall back to a
    // pattern. An empty-timings call returns false without vibrating.
    fn vibrate_waveform(&self, timings: &[u32], _amplitudes: &[u32], _repeat: i64) -> Option<bool> {
        if timings.is_empty() {
            return Some(false);
        }
        Some(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::{AtomicI64, AtomicU32, AtomicUsize, Ordering};

    // Mirrors the TS `fakeBackend`: records the last forwarded argument, the
    // selection/cancel/prepare counts, and reports success for every method.
    // `has_waveform` toggles the optional waveform path (TS sets
    // `vibrateWaveform = undefined`); when false, `vibrate_waveform` returns
    // `None` so callers fall back to `vibrate_pattern`.
    struct FakeBackend {
        duration: AtomicI64,
        style: AtomicI64,
        // -1 sentinel: no intensity forwarded; otherwise intensity * 1000 rounded.
        style_intensity_milli: AtomicI64,
        notification_type: AtomicI64,
        selections: AtomicU32,
        cancels: AtomicU32,
        prepared: AtomicU32,
        any_call: AtomicUsize,
        last_pattern: Mutex<Option<Vec<u32>>>,
        last_waveform: Mutex<Option<(Vec<u32>, Vec<u32>, i64)>>,
        has_waveform: bool,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Self::with_waveform(true)
        }

        fn with_waveform(has_waveform: bool) -> Arc<Self> {
            Arc::new(FakeBackend {
                duration: AtomicI64::new(-1),
                style: AtomicI64::new(-1),
                style_intensity_milli: AtomicI64::new(-1),
                notification_type: AtomicI64::new(-1),
                selections: AtomicU32::new(0),
                cancels: AtomicU32::new(0),
                prepared: AtomicU32::new(0),
                any_call: AtomicUsize::new(0),
                last_pattern: Mutex::new(None),
                last_waveform: Mutex::new(None),
                has_waveform,
            })
        }
    }

    impl HapticsBackend for FakeBackend {
        fn vibrate(&self, duration_ms: u32) -> bool {
            self.duration.store(duration_ms as i64, Ordering::SeqCst);
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn impact(&self, style: HapticImpactStyle, intensity: Option<f64>) -> bool {
            self.style.store(style as i64, Ordering::SeqCst);
            self.style_intensity_milli.store(
                intensity.map_or(-1, |v| (v * 1000.0).round() as i64),
                Ordering::SeqCst,
            );
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn notification(&self, notification_type: HapticNotificationType) -> bool {
            self.notification_type
                .store(notification_type as i64, Ordering::SeqCst);
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn selection(&self) -> bool {
            self.selections.fetch_add(1, Ordering::SeqCst);
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn cancel(&self) -> bool {
            self.cancels.fetch_add(1, Ordering::SeqCst);
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn capabilities(&self, out: &mut HapticsCapabilities) {
            out.amplitude_control = true;
            out.custom_events = false;
            out.intensity = true;
            out.patterns = true;
            out.supported = true;
        }
        fn is_supported(&self) -> bool {
            true
        }
        fn vibrate_pattern(&self, pattern: &[u32]) -> bool {
            *self.last_pattern.lock().unwrap() = Some(pattern.to_vec());
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn prepare(&self) {
            self.prepared.fetch_add(1, Ordering::SeqCst);
        }
        fn vibrate_waveform(
            &self,
            timings: &[u32],
            amplitudes: &[u32],
            repeat: i64,
        ) -> Option<bool> {
            if !self.has_waveform {
                return None;
            }
            *self.last_waveform.lock().unwrap() =
                Some((timings.to_vec(), amplitudes.to_vec(), repeat));
            self.any_call.fetch_add(1, Ordering::SeqCst);
            Some(true)
        }
    }

    fn ptr_of(backend: &Arc<dyn HapticsBackend>) -> *const () {
        Arc::as_ptr(backend) as *const ()
    }

    // describe('create_default_haptics_backend')
    #[test]
    #[serial]
    fn create_default_haptics_backend_returns_false_for_every_method_without_panicking() {
        let backend = create_default_haptics_backend();
        assert!(!backend.vibrate(10));
        assert!(!backend.impact(HapticImpactStyle::Heavy, None));
        assert!(!backend.impact(HapticImpactStyle::Rigid, None));
        assert!(!backend.impact(HapticImpactStyle::Soft, None));
        assert!(!backend.notification(HapticNotificationType::Error));
        assert!(!backend.selection());
        assert!(!backend.cancel());
        assert!(!backend.is_supported());
        assert!(!backend.vibrate_pattern(&[100, 50, 100]));
    }

    // describe('create_default_haptics_backend') — web-shaped sentinel details
    #[test]
    #[serial]
    fn create_default_haptics_backend_returns_false_for_empty_pattern_without_panicking() {
        let backend = create_default_haptics_backend();
        assert!(!backend.vibrate_pattern(&[]));
    }

    #[test]
    #[serial]
    fn create_default_haptics_backend_returns_false_for_waveform_with_empty_timings() {
        let backend = create_default_haptics_backend();
        assert_eq!(backend.vibrate_waveform(&[], &[], -1), Some(false));
    }

    #[test]
    #[serial]
    fn create_default_haptics_backend_fills_capabilities_all_false() {
        let backend = create_default_haptics_backend();
        let mut out = HapticsCapabilities::default();
        backend.capabilities(&mut out);
        assert!(!out.supported);
        assert!(!out.patterns);
        assert!(!out.intensity);
        assert!(!out.amplitude_control);
        assert!(!out.custom_events);
    }

    #[test]
    #[serial]
    fn create_default_haptics_backend_prepare_is_a_no_op() {
        let backend = create_default_haptics_backend();
        backend.prepare();
    }

    // describe('cancel_device_vibration')
    #[test]
    #[serial]
    fn cancel_device_vibration_forwards_to_backend_cancel() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(cancel_device_vibration());
        assert_eq!(backend.cancels.load(Ordering::SeqCst), 1);
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn cancel_device_vibration_returns_false_when_haptics_unavailable() {
        set_haptics_backend(None);
        assert!(!cancel_device_vibration());
        set_haptics_backend(None);
    }

    // describe('get_haptics_capabilities')
    #[test]
    #[serial]
    fn get_haptics_capabilities_fills_out_via_the_fake_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend));
        let mut out = HapticsCapabilities::default();
        get_haptics_capabilities(&mut out);
        assert!(out.supported);
        assert!(out.intensity);
        assert!(out.patterns);
        assert!(out.amplitude_control);
        assert!(!out.custom_events);
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn get_haptics_capabilities_fills_out_from_default_backend_when_none_set() {
        set_haptics_backend(None);
        let mut out = HapticsCapabilities::default();
        get_haptics_capabilities(&mut out);
        assert!(!out.supported);
        set_haptics_backend(None);
    }

    // describe('is_haptics_supported')
    #[test]
    #[serial]
    fn is_haptics_supported_returns_true_from_fake_backend() {
        set_haptics_backend(Some(FakeBackend::new()));
        assert!(is_haptics_supported());
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn is_haptics_supported_returns_false_when_unavailable() {
        set_haptics_backend(None);
        assert!(!is_haptics_supported());
        set_haptics_backend(None);
    }

    // describe('prepare_haptics')
    #[test]
    #[serial]
    fn prepare_haptics_calls_prepare_on_backends_that_provide_it() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        prepare_haptics();
        assert_eq!(backend.prepared.load(Ordering::SeqCst), 1);
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn prepare_haptics_does_not_panic_with_default_backend() {
        set_haptics_backend(None);
        prepare_haptics();
        set_haptics_backend(None);
    }

    // describe('get_haptics_backend')
    #[test]
    #[serial]
    fn get_haptics_backend_falls_back_to_a_default_backend() {
        set_haptics_backend(None);
        // A backend is always returned; the default reports failure but does not panic.
        let backend = get_haptics_backend();
        assert!(!backend.selection());
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn get_haptics_backend_returns_the_registered_backend() {
        let backend = FakeBackend::new();
        let installed: Arc<dyn HapticsBackend> = backend.clone();
        set_haptics_backend(Some(installed.clone()));
        assert_eq!(ptr_of(&get_haptics_backend()), ptr_of(&installed));
        set_haptics_backend(None);
    }

    // describe('set_haptics_backend')
    #[test]
    #[serial]
    fn set_haptics_backend_clears_back_to_the_default_fallback_when_passed_none() {
        set_haptics_backend(Some(FakeBackend::new()));
        set_haptics_backend(None);
        // Still yields a (default) backend rather than panicking.
        let backend = get_haptics_backend();
        assert!(!backend.vibrate(1));
        set_haptics_backend(None);
    }

    // describe('trigger_haptic_impact')
    #[test]
    #[serial]
    fn trigger_haptic_impact_forwards_style_to_the_active_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(trigger_haptic_impact(HapticImpactStyle::Medium, None));
        assert_eq!(
            backend.style.load(Ordering::SeqCst),
            HapticImpactStyle::Medium as i64
        );
        // No intensity forwarded: sentinel -1.
        assert_eq!(backend.style_intensity_milli.load(Ordering::SeqCst), -1);
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn trigger_haptic_impact_forwards_intensity_to_the_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        trigger_haptic_impact(HapticImpactStyle::Heavy, Some(0.5));
        assert_eq!(
            backend.style.load(Ordering::SeqCst),
            HapticImpactStyle::Heavy as i64
        );
        assert_eq!(backend.style_intensity_milli.load(Ordering::SeqCst), 500);
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn trigger_haptic_impact_supports_rigid_and_soft_styles() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        trigger_haptic_impact(HapticImpactStyle::Rigid, None);
        assert_eq!(
            backend.style.load(Ordering::SeqCst),
            HapticImpactStyle::Rigid as i64
        );
        trigger_haptic_impact(HapticImpactStyle::Soft, None);
        assert_eq!(
            backend.style.load(Ordering::SeqCst),
            HapticImpactStyle::Soft as i64
        );
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn trigger_haptic_impact_default_backend_clamps_intensity_without_panicking() {
        // The default backend ignores intensity (returns false), but must not
        // panic on out-of-range values. Mirrors the TS "web backend clamps".
        set_haptics_backend(None);
        let _ = trigger_haptic_impact(HapticImpactStyle::Heavy, Some(2.0));
        let _ = trigger_haptic_impact(HapticImpactStyle::Heavy, Some(-0.5));
        set_haptics_backend(None);
    }

    // describe('trigger_haptic_notification')
    #[test]
    #[serial]
    fn trigger_haptic_notification_forwards_type_to_the_active_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(trigger_haptic_notification(HapticNotificationType::Success));
        assert_eq!(
            backend.notification_type.load(Ordering::SeqCst),
            HapticNotificationType::Success as i64
        );
        set_haptics_backend(None);
    }

    // describe('trigger_haptic_selection')
    #[test]
    #[serial]
    fn trigger_haptic_selection_triggers_a_selection_on_the_active_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(trigger_haptic_selection());
        assert_eq!(backend.selections.load(Ordering::SeqCst), 1);
        set_haptics_backend(None);
    }

    // describe('vibrate_device')
    #[test]
    #[serial]
    fn vibrate_device_forwards_duration_to_the_active_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(vibrate_device(42));
        assert_eq!(backend.duration.load(Ordering::SeqCst), 42);
        set_haptics_backend(None);
    }

    // describe('vibrate_device_pattern')
    #[test]
    #[serial]
    fn vibrate_device_pattern_forwards_pattern_to_the_active_backend() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(vibrate_device_pattern(&[100, 50, 100]));
        assert_eq!(
            backend.last_pattern.lock().unwrap().as_deref(),
            Some([100, 50, 100].as_slice())
        );
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_pattern_returns_false_for_empty_pattern() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend));
        assert!(!vibrate_device_pattern(&[]));
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_pattern_returns_false_when_haptics_unavailable() {
        set_haptics_backend(None);
        assert!(!vibrate_device_pattern(&[100, 50, 100]));
        set_haptics_backend(None);
    }

    // describe('vibrate_device_waveform')
    #[test]
    #[serial]
    fn vibrate_device_waveform_calls_vibrate_waveform_on_backends_that_support_it() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        assert!(vibrate_device_waveform(&[100, 50, 100], &[255, 0, 128], 0));
        assert_eq!(
            *backend.last_waveform.lock().unwrap(),
            Some((vec![100, 50, 100], vec![255, 0, 128], 0))
        );
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_waveform_passes_explicit_repeat_minus_one() {
        // Rust has no default args; -1 is passed explicitly (TS defaults repeat = -1).
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend.clone()));
        vibrate_device_waveform(&[100], &[255], -1);
        assert_eq!(
            backend.last_waveform.lock().unwrap().as_ref().map(|w| w.2),
            Some(-1)
        );
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_waveform_falls_back_to_pattern_when_backend_lacks_waveform() {
        let backend = FakeBackend::with_waveform(false);
        set_haptics_backend(Some(backend.clone()));
        assert!(vibrate_device_waveform(&[100, 50], &[255, 0], -1));
        assert_eq!(
            backend.last_pattern.lock().unwrap().as_deref(),
            Some([100, 50].as_slice())
        );
        assert!(backend.last_waveform.lock().unwrap().is_none());
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_waveform_returns_false_for_empty_timings() {
        let backend = FakeBackend::new();
        set_haptics_backend(Some(backend));
        assert!(!vibrate_device_waveform(&[], &[], -1));
        set_haptics_backend(None);
    }

    #[test]
    #[serial]
    fn vibrate_device_waveform_returns_false_when_haptics_unavailable() {
        set_haptics_backend(None);
        assert!(!vibrate_device_waveform(&[100], &[255], -1));
        set_haptics_backend(None);
    }
}
