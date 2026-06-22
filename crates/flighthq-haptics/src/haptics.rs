//! Haptics free functions and backend management.
//!
//! Ports the TypeScript `@flighthq/haptics` package. The TS package always has
//! a backend: it lazily creates a web backend over `navigator.vibrate` that
//! returns `false` for every method when the Vibration API is absent. In the
//! Rust port there is no `navigator`, so the in-box default is a sentinel
//! backend that no-ops and returns `false` for every method — the same observed
//! behavior as the TS web backend in jsdom or on a desktop browser. A native
//! mobile host fills the real backend later via [`set_haptics_backend`].

use flighthq_types::{HapticImpactStyle, HapticNotificationType, HapticsBackend};
use std::sync::{Arc, Mutex};

/// Builds the default haptics backend. Every method returns `false` without
/// performing any vibration, mirroring the TS web backend when the Vibration
/// API is unavailable. A native host replaces this via [`set_haptics_backend`].
pub fn create_default_haptics_backend() -> Arc<dyn HapticsBackend> {
    Arc::new(DefaultHapticsBackend)
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

/// Installs a native host haptics backend. Pass `None` to fall back to the
/// default backend.
pub fn set_haptics_backend(backend: Option<Arc<dyn HapticsBackend>>) {
    let mut guard = BACKEND.lock().expect("haptics backend mutex poisoned");
    *guard = backend;
}

/// Triggers a physical impact. Returns `false` when haptics are unavailable.
pub fn trigger_haptic_impact(style: HapticImpactStyle) -> bool {
    get_haptics_backend().impact(style)
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

static BACKEND: Mutex<Option<Arc<dyn HapticsBackend>>> = Mutex::new(None);

// The in-box sentinel backend: no hardware, so every method no-ops and reports
// failure rather than panicking. Matches the TS web backend under jsdom.
struct DefaultHapticsBackend;

impl HapticsBackend for DefaultHapticsBackend {
    fn vibrate(&self, _duration_ms: u32) -> bool {
        false
    }
    fn impact(&self, _style: HapticImpactStyle) -> bool {
        false
    }
    fn notification(&self, _notification_type: HapticNotificationType) -> bool {
        false
    }
    fn selection(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::sync::atomic::{AtomicI64, AtomicU32, AtomicUsize, Ordering};

    // Mirrors the TS `fakeBackend`: records the last forwarded argument and the
    // selection count, and reports success for every method.
    struct FakeBackend {
        duration: AtomicI64,
        style: AtomicI64,
        notification_type: AtomicI64,
        selections: AtomicU32,
        any_call: AtomicUsize,
    }

    impl FakeBackend {
        fn new() -> Arc<Self> {
            Arc::new(FakeBackend {
                duration: AtomicI64::new(-1),
                style: AtomicI64::new(-1),
                notification_type: AtomicI64::new(-1),
                selections: AtomicU32::new(0),
                any_call: AtomicUsize::new(0),
            })
        }
    }

    impl HapticsBackend for FakeBackend {
        fn vibrate(&self, duration_ms: u32) -> bool {
            self.duration.store(duration_ms as i64, Ordering::SeqCst);
            self.any_call.fetch_add(1, Ordering::SeqCst);
            true
        }
        fn impact(&self, style: HapticImpactStyle) -> bool {
            self.style.store(style as i64, Ordering::SeqCst);
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
        assert!(!backend.impact(HapticImpactStyle::Heavy));
        assert!(!backend.notification(HapticNotificationType::Error));
        assert!(!backend.selection());
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
        assert!(trigger_haptic_impact(HapticImpactStyle::Medium));
        assert_eq!(
            backend.style.load(Ordering::SeqCst),
            HapticImpactStyle::Medium as i64
        );
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
}
