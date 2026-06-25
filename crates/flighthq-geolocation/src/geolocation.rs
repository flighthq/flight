//! Geolocation free functions and backend management.
//!
//! Ports `@flighthq/geolocation`. The TS package always has a backend: when none
//! is installed it lazily builds the web default over `navigator.geolocation`.
//! There is no `navigator` in the native box, so the in-crate default is a
//! sentinel backend — position reads resolve to `None`, watching returns the
//! `-1` sentinel, and permission requests resolve to `false`. A host installs a
//! real backend via [`set_geolocation_backend`].

use flighthq_types::{
    GeoPosition, GeoPositionResult, GeolocationBackend, GeolocationErrorReason,
    GeolocationPermissionState, GeolocationRequestOptions,
};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

/// The `-1` sentinel for an unavailable watch, expressed as the maximum `u32`.
/// `watch_position` returns this when watching is not available; callers compare
/// against it the way the TS API compares against `-1`.
pub const GEO_WATCH_UNAVAILABLE: u32 = u32::MAX;

/// Cancels an active position watch. No-op when the id is unknown or the backend
/// lacks watching.
pub fn clear_geo_watch(id: u32) {
    get_geolocation_backend().clear_watch(id);
}

/// Allocates a zeroed `GeoPosition`; use as a scratch value or when building a
/// backend.
pub fn create_geo_position() -> GeoPosition {
    GeoPosition::default()
}

/// Builds the default sentinel backend. Position reads resolve to `None` (or a
/// `GeoPositionResult` carrying `Unavailable`), watching returns
/// [`GEO_WATCH_UNAVAILABLE`], permission queries resolve to `Prompt`, and
/// permission requests resolve to `false` — the native box has no
/// `navigator.geolocation`, so location access is not available until a host
/// installs a real backend. The web backend over `navigator.geolocation` lives
/// in `host-web`.
pub fn create_default_geolocation_backend() -> Arc<dyn GeolocationBackend> {
    Arc::new(SentinelGeolocationBackend)
}

/// Resolves the device's current position, or `None` when access is denied or
/// unavailable.
pub async fn get_current_geo_position(options: &GeolocationRequestOptions) -> Option<GeoPosition> {
    get_geolocation_backend()
        .get_current_position(options)
        .await
}

/// Resolves a [`GeoPositionResult`] carrying both the position and the error
/// reason on failure. Use when the caller needs to distinguish denied /
/// unavailable / timeout rather than just `None`.
pub async fn get_current_geo_position_result(
    options: &GeolocationRequestOptions,
) -> GeoPositionResult {
    get_geolocation_backend()
        .get_current_position_result(options)
        .await
}

/// The active geolocation backend, or a lazily-created sentinel default. There
/// is always a backend.
pub fn get_geolocation_backend() -> Arc<dyn GeolocationBackend> {
    let mut guard = BACKEND.lock().expect("geolocation backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_default_geolocation_backend());
    }
    Arc::clone(guard.as_ref().expect("geolocation backend just installed"))
}

/// Resolves the current permission state without triggering a user prompt.
/// Returns `Granted`, `Denied`, or `Prompt` (the user has not yet been asked).
/// Falls back to `Prompt` when permission state cannot be observed.
pub async fn get_geolocation_permission() -> GeolocationPermissionState {
    get_geolocation_backend().get_permission().await
}

/// Returns `true` when the geolocation capability is available in the current
/// context. Synchronous; does not trigger a permission prompt. The native box
/// has no `navigator.geolocation`, so this is `false` — the TS web default's
/// behavior in an environment without a geolocation provider (insecure context,
/// jsdom). A `host-web`/native host that wires geolocation reports availability
/// there.
pub fn is_geolocation_available() -> bool {
    false
}

/// Subscribes to geolocation permission state changes. Invokes `listener`
/// whenever the OS changes the permission (e.g., the user revokes access in
/// Settings mid-session). Returns an unsubscribe function. No-op subscription
/// when permission changes cannot be observed.
pub fn on_geolocation_permission_change(
    listener: Box<dyn Fn(GeolocationPermissionState) + Send + Sync>,
) -> Box<dyn Fn() + Send + Sync> {
    get_geolocation_backend().subscribe_permission(listener)
}

/// Requests location permission. Resolves `true` when granted, `false` when
/// denied or unavailable.
pub async fn request_geolocation_permission() -> bool {
    get_geolocation_backend().request_permission().await
}

/// Installs a native host geolocation backend; pass `None` to fall back to the
/// sentinel default.
pub fn set_geolocation_backend(backend: Option<Arc<dyn GeolocationBackend>>) {
    let mut guard = BACKEND.lock().expect("geolocation backend mutex poisoned");
    *guard = backend;
}

/// Starts a position watch, invoking `handler` on each update. Returns the watch
/// id, or [`GEO_WATCH_UNAVAILABLE`] (the `-1` sentinel) when watching is
/// unavailable. Pair with [`clear_geo_watch`]. Pass `on_error` to receive
/// ongoing failure reasons (e.g., permission revoked mid-watch).
pub fn watch_geo_position(
    handler: Box<dyn Fn(GeoPosition) + Send + Sync>,
    options: &GeolocationRequestOptions,
    on_error: Option<Box<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
) -> u32 {
    get_geolocation_backend().watch_position(handler, options, on_error)
}

static BACKEND: Mutex<Option<Arc<dyn GeolocationBackend>>> = Mutex::new(None);

// The in-box default: a backend that reports geolocation as unavailable rather
// than panicking, mirroring the TS web default's behavior in an environment
// without `navigator.geolocation` (insecure context, jsdom).
struct SentinelGeolocationBackend;

impl GeolocationBackend for SentinelGeolocationBackend {
    fn get_current_position(
        &self,
        _options: &GeolocationRequestOptions,
    ) -> Pin<Box<dyn Future<Output = Option<GeoPosition>> + Send>> {
        Box::pin(async { None })
    }

    fn get_current_position_result(
        &self,
        _options: &GeolocationRequestOptions,
    ) -> Pin<Box<dyn Future<Output = GeoPositionResult> + Send>> {
        Box::pin(async {
            GeoPositionResult {
                position: None,
                reason: Some(GeolocationErrorReason::Unavailable),
            }
        })
    }

    fn watch_position(
        &self,
        _listener: Box<dyn Fn(GeoPosition) + Send + Sync>,
        _options: &GeolocationRequestOptions,
        _on_error: Option<Box<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
    ) -> u32 {
        GEO_WATCH_UNAVAILABLE
    }

    fn clear_watch(&self, _id: u32) {
        // Expected no-op: the sentinel backend never issued a watch.
    }

    fn get_permission(&self) -> Pin<Box<dyn Future<Output = GeolocationPermissionState> + Send>> {
        Box::pin(async { GeolocationPermissionState::Prompt })
    }

    fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
        Box::pin(async { false })
    }

    fn subscribe_permission(
        &self,
        _listener: Box<dyn Fn(GeolocationPermissionState) + Send + Sync>,
    ) -> Box<dyn Fn() + Send + Sync> {
        // No way to observe permission changes without a host; the subscription
        // is an immediate no-op unsubscribe.
        Box::new(|| {})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

    // Mirrors the TS `fakeBackend`: getCurrentPosition / getCurrentPositionResult
    // yield (1, 2), watchPosition delivers latitude 3, calls onError with
    // `Denied`, and returns an incrementing id, clearWatch records ids,
    // getPermission resolves Granted, requestPermission resolves true.
    struct FakeBackend {
        cleared: Mutex<Vec<u32>>,
        last_watch: AtomicU32,
    }

    impl FakeBackend {
        fn new() -> Arc<FakeBackend> {
            Arc::new(FakeBackend {
                cleared: Mutex::new(Vec::new()),
                last_watch: AtomicU32::new(0),
            })
        }
    }

    impl GeolocationBackend for FakeBackend {
        fn get_current_position(
            &self,
            _options: &GeolocationRequestOptions,
        ) -> Pin<Box<dyn Future<Output = Option<GeoPosition>> + Send>> {
            Box::pin(async {
                let mut position = create_geo_position();
                position.latitude = 1.0;
                position.longitude = 2.0;
                Some(position)
            })
        }

        fn get_current_position_result(
            &self,
            _options: &GeolocationRequestOptions,
        ) -> Pin<Box<dyn Future<Output = GeoPositionResult> + Send>> {
            Box::pin(async {
                let mut position = create_geo_position();
                position.latitude = 1.0;
                position.longitude = 2.0;
                GeoPositionResult {
                    position: Some(position),
                    reason: None,
                }
            })
        }

        fn watch_position(
            &self,
            listener: Box<dyn Fn(GeoPosition) + Send + Sync>,
            _options: &GeolocationRequestOptions,
            on_error: Option<Box<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
        ) -> u32 {
            let mut position = create_geo_position();
            position.latitude = 3.0;
            listener(position);
            if let Some(on_error) = on_error {
                on_error(GeolocationErrorReason::Denied);
            }
            self.last_watch.fetch_add(1, Ordering::SeqCst) + 1
        }

        fn clear_watch(&self, id: u32) {
            self.cleared.lock().unwrap().push(id);
        }

        fn get_permission(
            &self,
        ) -> Pin<Box<dyn Future<Output = GeolocationPermissionState> + Send>> {
            Box::pin(async { GeolocationPermissionState::Granted })
        }

        fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
            Box::pin(async { true })
        }

        fn subscribe_permission(
            &self,
            _listener: Box<dyn Fn(GeolocationPermissionState) + Send + Sync>,
        ) -> Box<dyn Fn() + Send + Sync> {
            Box::new(|| {})
        }
    }

    fn reset() {
        set_geolocation_backend(None);
    }

    fn options() -> GeolocationRequestOptions {
        GeolocationRequestOptions::default()
    }

    #[test]
    #[serial_test::serial]
    fn clear_geo_watch_forwards_the_id_to_the_active_backend() {
        reset();
        let backend = FakeBackend::new();
        set_geolocation_backend(Some(backend.clone()));
        clear_geo_watch(7);
        assert_eq!(*backend.cleared.lock().unwrap(), vec![7]);
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn clear_geo_watch_does_not_panic_on_the_default_backend() {
        reset();
        clear_geo_watch(0);
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn create_geo_position_allocates_a_zeroed_position() {
        let position = create_geo_position();
        assert_eq!(position.latitude, 0.0);
        assert_eq!(position.longitude, 0.0);
        assert_eq!(position.accuracy, 0.0);
        assert_eq!(position.altitude, 0.0);
        assert_eq!(position.altitude_accuracy, 0.0);
        assert_eq!(position.floor_level, 0.0);
        assert_eq!(position.heading, 0.0);
        assert_eq!(position.speed, 0.0);
        assert_eq!(position.timestamp, 0.0);
    }

    #[test]
    #[serial_test::serial]
    fn create_default_geolocation_backend_resolves_sentinels_without_panicking() {
        let backend = create_default_geolocation_backend();
        assert!(pollster::block_on(backend.get_current_position(&options())).is_none());
        let result = pollster::block_on(backend.get_current_position_result(&options()));
        assert!(result.position.is_none());
        assert_eq!(result.reason, Some(GeolocationErrorReason::Unavailable));
        assert_eq!(
            backend.watch_position(Box::new(|_| {}), &options(), None),
            GEO_WATCH_UNAVAILABLE
        );
        backend.clear_watch(GEO_WATCH_UNAVAILABLE);
        assert_eq!(
            pollster::block_on(backend.get_permission()),
            GeolocationPermissionState::Prompt
        );
        assert!(!pollster::block_on(backend.request_permission()));
    }

    #[test]
    #[serial_test::serial]
    fn get_current_geo_position_returns_the_backend_position() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        let position = pollster::block_on(get_current_geo_position(&options())).unwrap();
        assert_eq!(position.latitude, 1.0);
        assert_eq!(position.longitude, 2.0);
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_current_geo_position_result_returns_position_and_null_reason_on_success() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        let result = pollster::block_on(get_current_geo_position_result(&options()));
        assert!(result.position.is_some());
        assert_eq!(result.position.unwrap().latitude, 1.0);
        assert!(result.reason.is_none());
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_current_geo_position_result_returns_unavailable_from_the_default_backend() {
        reset();
        let result = pollster::block_on(get_current_geo_position_result(&options()));
        assert!(result.position.is_none());
        assert_eq!(result.reason, Some(GeolocationErrorReason::Unavailable));
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_geolocation_backend_falls_back_to_a_default_backend() {
        reset();
        // A default exists; the sentinel reports unavailable rather than panic.
        let backend = get_geolocation_backend();
        assert_eq!(
            backend.watch_position(Box::new(|_| {}), &options(), None),
            GEO_WATCH_UNAVAILABLE
        );
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_geolocation_backend_returns_the_registered_backend() {
        reset();
        let backend = FakeBackend::new();
        set_geolocation_backend(Some(backend.clone()));
        let active = get_geolocation_backend();
        assert!(Arc::ptr_eq(
            &(backend as Arc<dyn GeolocationBackend>),
            &active
        ));
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_geolocation_permission_reflects_the_backend_state() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        assert_eq!(
            pollster::block_on(get_geolocation_permission()),
            GeolocationPermissionState::Granted
        );
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn get_geolocation_permission_returns_prompt_from_the_default_backend() {
        reset();
        assert_eq!(
            pollster::block_on(get_geolocation_permission()),
            GeolocationPermissionState::Prompt
        );
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn is_geolocation_available_returns_false_from_the_default_backend() {
        reset();
        assert!(!is_geolocation_available());
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn on_geolocation_permission_change_returns_an_unsubscribe_function() {
        reset();
        let unsubscribe = on_geolocation_permission_change(Box::new(|_| {}));
        unsubscribe();
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn on_geolocation_permission_change_uses_the_backend_subscribe_permission() {
        reset();

        struct SubscribingBackend {
            subscribed: Arc<AtomicBool>,
            unsubscribed: Arc<AtomicBool>,
        }

        impl GeolocationBackend for SubscribingBackend {
            fn get_current_position(
                &self,
                _options: &GeolocationRequestOptions,
            ) -> Pin<Box<dyn Future<Output = Option<GeoPosition>> + Send>> {
                Box::pin(async { None })
            }

            fn get_current_position_result(
                &self,
                _options: &GeolocationRequestOptions,
            ) -> Pin<Box<dyn Future<Output = GeoPositionResult> + Send>> {
                Box::pin(async { GeoPositionResult::default() })
            }

            fn watch_position(
                &self,
                _listener: Box<dyn Fn(GeoPosition) + Send + Sync>,
                _options: &GeolocationRequestOptions,
                _on_error: Option<Box<dyn Fn(GeolocationErrorReason) + Send + Sync>>,
            ) -> u32 {
                GEO_WATCH_UNAVAILABLE
            }

            fn clear_watch(&self, _id: u32) {}

            fn get_permission(
                &self,
            ) -> Pin<Box<dyn Future<Output = GeolocationPermissionState> + Send>> {
                Box::pin(async { GeolocationPermissionState::Prompt })
            }

            fn request_permission(&self) -> Pin<Box<dyn Future<Output = bool> + Send>> {
                Box::pin(async { false })
            }

            fn subscribe_permission(
                &self,
                _listener: Box<dyn Fn(GeolocationPermissionState) + Send + Sync>,
            ) -> Box<dyn Fn() + Send + Sync> {
                self.subscribed.store(true, Ordering::SeqCst);
                let unsubscribed = self.unsubscribed.clone();
                Box::new(move || unsubscribed.store(true, Ordering::SeqCst))
            }
        }

        let subscribed = Arc::new(AtomicBool::new(false));
        let unsubscribed = Arc::new(AtomicBool::new(false));
        set_geolocation_backend(Some(Arc::new(SubscribingBackend {
            subscribed: subscribed.clone(),
            unsubscribed: unsubscribed.clone(),
        })));

        let unsub = on_geolocation_permission_change(Box::new(|_| {}));
        assert!(subscribed.load(Ordering::SeqCst));
        unsub();
        assert!(unsubscribed.load(Ordering::SeqCst));
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn request_geolocation_permission_reflects_the_backend_result() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        assert!(pollster::block_on(request_geolocation_permission()));
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn request_geolocation_permission_returns_false_from_the_default_backend() {
        reset();
        assert!(!pollster::block_on(request_geolocation_permission()));
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn set_geolocation_backend_clears_back_to_the_default_when_passed_none() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        set_geolocation_backend(None);
        // The default fallback is reinstated; the sentinel reports unavailable.
        let backend = get_geolocation_backend();
        assert_eq!(
            backend.watch_position(Box::new(|_| {}), &options(), None),
            GEO_WATCH_UNAVAILABLE
        );
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn watch_geo_position_delivers_positions_and_returns_a_watch_id() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        let seen = Arc::new(AtomicU32::new(0));
        let captured = seen.clone();
        let id = watch_geo_position(
            Box::new(move |position| {
                captured.store(position.latitude as u32, Ordering::SeqCst);
            }),
            &options(),
            None,
        );
        assert_eq!(id, 1);
        assert_eq!(seen.load(Ordering::SeqCst), 3);
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn watch_geo_position_delivers_error_reasons_when_on_error_is_provided() {
        reset();
        set_geolocation_backend(Some(FakeBackend::new()));
        let errors: Arc<Mutex<Vec<GeolocationErrorReason>>> = Arc::new(Mutex::new(Vec::new()));
        let captured = errors.clone();
        watch_geo_position(
            Box::new(|_| {}),
            &options(),
            Some(Box::new(move |reason| {
                captured.lock().unwrap().push(reason)
            })),
        );
        assert_eq!(
            *errors.lock().unwrap(),
            vec![GeolocationErrorReason::Denied]
        );
        reset();
    }

    #[test]
    #[serial_test::serial]
    fn watch_geo_position_returns_the_sentinel_from_the_default_backend() {
        reset();
        assert_eq!(
            watch_geo_position(Box::new(|_| {}), &options(), None),
            GEO_WATCH_UNAVAILABLE
        );
        reset();
    }
}
