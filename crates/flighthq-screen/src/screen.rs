//! Screen enumeration, coordinate conversion, modes, cursor, and signals over a
//! swappable backend.
//!
//! Free functions report attached displays and their metrics, convert between
//! DIP (logical) and physical screen coordinates, enumerate display modes, track
//! the cursor screen, and fan display-change events out to a [`ScreenSignals`]
//! group. All delegate to the active [`ScreenBackend`]; a native default backend
//! is lazily installed so every function works without a host.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::{
    RectangleLike, ScreenBackend, ScreenChangeEvent, ScreenChangeKind, ScreenChangeListener,
    ScreenDetailPermission, ScreenInfo, ScreenMode, ScreenSignals, Vector2Like,
};

/// Attaches the active backend's change subscription to `signals`, fanning out
/// events to the appropriate signal for each [`ScreenChangeKind`]. Idempotent: a
/// prior subscription is torn down first. Pair with [`detach_screen_signals`] /
/// [`dispose_screen_signals`].
pub fn attach_screen_signals(signals: &ScreenSignals) {
    detach_screen_signals(signals);

    let on_screen_added = signals.on_screen_added.clone();
    let on_screen_removed = signals.on_screen_removed.clone();
    let on_screen_metrics_changed = signals.on_screen_metrics_changed.clone();

    let unsubscribe = get_screen_backend().subscribe(Box::new(move |event: &ScreenChangeEvent| {
        match event.kind {
            ScreenChangeKind::ScreenAdded => emit_signal(&on_screen_added, &event.screen),
            ScreenChangeKind::ScreenRemoved => emit_signal(&on_screen_removed, &event.screen),
            ScreenChangeKind::ScreenMetricsChanged => {
                emit_signal(&on_screen_metrics_changed, event)
            }
        }
    }));

    let key = signals as *const ScreenSignals as usize;
    let mut guard = SUBSCRIPTIONS
        .lock()
        .expect("screen subscriptions mutex poisoned");
    guard
        .get_or_insert_with(HashMap::new)
        .insert(key, unsubscribe);
}

/// Builds the default native backend. It reports the host's displays; the
/// fallback returns no screens until a native host (winit/Electron/Tauri)
/// replaces it via [`set_screen_backend`] to enumerate every attached monitor.
pub fn create_native_screen_backend() -> Arc<dyn ScreenBackend> {
    Arc::new(NativeScreenBackend)
}

/// Allocates a zeroed [`ScreenInfo`]; use as the `out` for [`get_primary_screen`]
/// or as an array slot for [`get_screens`]. `scale_factor` defaults to `1` (no
/// scaling) and `is_primary` to false; sentinel fields default to `-1` / `""` /
/// `false`.
pub fn create_screen_info() -> ScreenInfo {
    ScreenInfo::default()
}

/// Allocates a zeroed [`ScreenMode`]; use as an array slot for
/// [`get_screen_modes`] / [`get_screen_current_mode`].
pub fn create_screen_mode() -> ScreenMode {
    ScreenMode::default()
}

/// Allocates a [`ScreenSignals`] group with inert signals; call
/// [`attach_screen_signals`] to start delivery.
pub fn create_screen_signals() -> ScreenSignals {
    ScreenSignals::default()
}

/// Stops delivery to `signals` and forgets its subscription. Safe to call when
/// not attached.
pub fn detach_screen_signals(signals: &ScreenSignals) {
    let key = signals as *const ScreenSignals as usize;
    let unsubscribe = {
        let mut guard = SUBSCRIPTIONS
            .lock()
            .expect("screen subscriptions mutex poisoned");
        guard.as_mut().and_then(|map| map.remove(&key))
    };
    if let Some(unsubscribe) = unsubscribe {
        unsubscribe();
    }
}

/// Converts a point from DIP (logical) coordinates to physical screen pixel
/// coordinates relative to `screen`'s origin. Alias-safe: `out` may be the same
/// object as `point`.
///
/// `physical_x = (point.x - screen.x) * screen.scale_factor`
pub fn dip_to_screen_point<'a>(
    screen: &ScreenInfo,
    point: &Vector2Like,
    out: &'a mut Vector2Like,
) -> &'a mut Vector2Like {
    let px = point.x;
    let py = point.y;
    out.x = (px - screen.x) * screen.scale_factor;
    out.y = (py - screen.y) * screen.scale_factor;
    out
}

/// Converts a rectangle from DIP (logical) coordinates to physical screen pixel
/// coordinates relative to `screen`'s origin. Alias-safe: `out` may be the same
/// object as `rect`.
pub fn dip_to_screen_rect<'a>(
    screen: &ScreenInfo,
    rect: &RectangleLike,
    out: &'a mut RectangleLike,
) -> &'a mut RectangleLike {
    let rx = rect.x;
    let ry = rect.y;
    let rw = rect.width;
    let rh = rect.height;
    let sf = screen.scale_factor;
    out.x = (rx - screen.x) * sf;
    out.y = (ry - screen.y) * sf;
    out.width = rw * sf;
    out.height = rh * sf;
    out
}

/// Releases `signals` for garbage collection by detaching its backend
/// subscription. The signals remain plain memory afterward.
pub fn dispose_screen_signals(signals: &ScreenSignals) {
    detach_screen_signals(signals);
}

/// Enables a signals group for screen change events. Signals stay inert until
/// [`attach_screen_signals`] is called. This is the opt-in; the cost is paid when
/// attached.
pub fn enable_screen_signals() -> ScreenSignals {
    create_screen_signals()
}

/// Fills `out` with the primary display and returns it. The fallback reports one
/// screen; a native host its OS-designated primary monitor.
pub fn get_primary_screen(out: &mut ScreenInfo) -> &mut ScreenInfo {
    let backend = get_screen_backend();
    backend.get_primary_screen(out)
}

/// Returns the active screen backend, lazily installing the native default when
/// none has been set. There is always a backend.
pub fn get_screen_backend() -> Arc<dyn ScreenBackend> {
    let mut guard = BACKEND.lock().expect("screen backend mutex poisoned");
    if guard.is_none() {
        *guard = Some(create_native_screen_backend());
    }
    Arc::clone(guard.as_ref().expect("screen backend installed above"))
}

/// Fills `out` with the bounds rectangle of the given screen and returns it.
/// Convenience accessor over the flat fields.
pub fn get_screen_bounds<'a>(
    screen: &ScreenInfo,
    out: &'a mut RectangleLike,
) -> &'a mut RectangleLike {
    out.x = screen.x;
    out.y = screen.y;
    out.width = screen.width;
    out.height = screen.height;
    out
}

/// Fills `out` with the screen whose id is `id` and returns `Some(out)`, or
/// `None` when no screen matches. Sentinel `None` means not found.
pub fn get_screen_by_id(id: u32, out: &mut ScreenInfo) -> Option<&mut ScreenInfo> {
    let mut screens: Vec<ScreenInfo> = Vec::new();
    get_screens(&mut screens);
    for screen in &screens {
        if screen.id == id {
            copy_screen_info(screen, out);
            return Some(out);
        }
    }
    None
}

/// Fills `out` with the screen whose bounds contain `rect` (largest-overlap
/// strategy) and returns it. Falls back to the screen nearest to the rectangle's
/// center when no screen contains it.
pub fn get_screen_containing_rect<'a>(
    rect: &RectangleLike,
    out: &'a mut ScreenInfo,
) -> &'a mut ScreenInfo {
    let mut screens: Vec<ScreenInfo> = Vec::new();
    get_screens(&mut screens);
    if screens.is_empty() {
        fill_default_screen_info(out);
        return out;
    }

    let mut best_index = 0usize;
    let mut best_overlap = -1.0f32;

    for (i, screen) in screens.iter().enumerate() {
        let ox = (f32::min(rect.x + rect.width, screen.x + screen.width)
            - f32::max(rect.x, screen.x))
        .max(0.0);
        let oy = (f32::min(rect.y + rect.height, screen.y + screen.height)
            - f32::max(rect.y, screen.y))
        .max(0.0);
        let overlap = ox * oy;
        if overlap > best_overlap {
            best_overlap = overlap;
            best_index = i;
        }
    }

    // No overlap — fall back to nearest by center distance.
    if best_overlap <= 0.0 {
        let cx = rect.x + rect.width / 2.0;
        let cy = rect.y + rect.height / 2.0;
        let mut best_dist = f32::INFINITY;
        for (i, screen) in screens.iter().enumerate() {
            let scx = screen.x + screen.width / 2.0;
            let scy = screen.y + screen.height / 2.0;
            let dx = cx - scx;
            let dy = cy - scy;
            let dist = dx * dx + dy * dy;
            if dist < best_dist {
                best_dist = dist;
                best_index = i;
            }
        }
    }

    copy_screen_info(&screens[best_index], out);
    out
}

/// Fills `out` with the current mode for the given screen (the active
/// resolution/refresh pair) and returns it. The native fallback returns a
/// synthetic single mode derived from [`ScreenInfo`] fields.
pub fn get_screen_current_mode<'a>(
    screen: &ScreenInfo,
    out: &'a mut ScreenMode,
) -> &'a mut ScreenMode {
    out.width = screen.width;
    out.height = screen.height;
    out.refresh_rate = screen.refresh_rate;
    out.color_depth = screen.color_depth;
    out.pixel_format = String::new();
    out
}

/// Fills `out` with the current cursor position in virtual-desktop coordinates
/// and returns it. Uses the active backend's `get_cursor_position`. Returns
/// `(0, 0)` before the first reported move, or when unavailable.
pub fn get_screen_cursor_position(out: &mut Vector2Like) -> &mut Vector2Like {
    get_screen_backend().get_cursor_position(out)
}

/// Fills `out` with the screen currently containing the cursor and returns it.
/// Composites [`get_screen_cursor_position`] with [`get_screen_nearest_point`].
pub fn get_screen_cursor_screen(out: &mut ScreenInfo) -> &mut ScreenInfo {
    let mut pos = Vector2Like::default();
    get_screen_cursor_position(&mut pos);
    get_screen_nearest_point(&pos, out)
}

/// Returns the permission state for the host's multi-monitor detail API. The
/// native fallback reports [`ScreenDetailPermission::Prompt`]; a host backend
/// resolves the real state.
pub fn get_screen_detail_permission() -> ScreenDetailPermission {
    ScreenDetailPermission::Prompt
}

/// Fills `out` with all available display modes for the given screen and returns
/// it. Uses the active backend's `get_modes` when implemented; otherwise derives
/// a single synthetic entry from the screen's current fields.
pub fn get_screen_modes<'a>(
    screen: &ScreenInfo,
    out: &'a mut Vec<ScreenMode>,
) -> &'a mut Vec<ScreenMode> {
    let backend = get_screen_backend();
    if backend.get_modes(screen, out).is_some() {
        return out;
    }
    // Fallback: a single synthetic mode from the screen's current fields.
    out.clear();
    let mut mode = create_screen_mode();
    get_screen_current_mode(screen, &mut mode);
    out.push(mode);
    out
}

/// Fills `out` with the screen whose bounds contain `point` (virtual-desktop
/// coordinates) and returns it. Falls back to the closest screen by Euclidean
/// distance when the point lies outside all screens.
pub fn get_screen_nearest_point<'a>(
    point: &Vector2Like,
    out: &'a mut ScreenInfo,
) -> &'a mut ScreenInfo {
    let mut screens: Vec<ScreenInfo> = Vec::new();
    get_screens(&mut screens);
    if screens.is_empty() {
        fill_default_screen_info(out);
        return out;
    }

    // Prefer the screen that contains the point.
    for screen in &screens {
        if point.x >= screen.x
            && point.x < screen.x + screen.width
            && point.y >= screen.y
            && point.y < screen.y + screen.height
        {
            copy_screen_info(screen, out);
            return out;
        }
    }

    // Fall back to the nearest screen by distance from point to screen center.
    let mut best_index = 0usize;
    let mut best_dist = f32::INFINITY;
    for (i, screen) in screens.iter().enumerate() {
        let cx = screen.x + screen.width / 2.0;
        let cy = screen.y + screen.height / 2.0;
        let dx = point.x - cx;
        let dy = point.y - cy;
        let dist = dx * dx + dy * dy;
        if dist < best_dist {
            best_dist = dist;
            best_index = i;
        }
    }

    copy_screen_info(&screens[best_index], out);
    out
}

/// Fills `out` with the screen whose bounds contain `rect` by largest overlap,
/// falling back to nearest by center distance, and returns it. This is Electron's
/// `getDisplayMatching` behavior.
pub fn get_screen_nearest_rect<'a>(
    rect: &RectangleLike,
    out: &'a mut ScreenInfo,
) -> &'a mut ScreenInfo {
    get_screen_containing_rect(rect, out)
}

/// Fills `out` with every attached display and returns it. `out` is cleared and
/// repopulated; the fallback yields an empty list until a host registers.
pub fn get_screens(out: &mut Vec<ScreenInfo>) -> &mut Vec<ScreenInfo> {
    let backend = get_screen_backend();
    backend.get_screens(out);
    out
}

/// Fills `out` with the work-area rectangle of the given screen (excluding OS
/// chrome) and returns it.
pub fn get_screen_work_area<'a>(
    screen: &ScreenInfo,
    out: &'a mut RectangleLike,
) -> &'a mut RectangleLike {
    out.x = screen.x;
    out.y = screen.y;
    out.width = screen.work_width;
    out.height = screen.work_height;
    out
}

/// Subscribes to display change events via the active backend; returns an
/// unsubscribe closure. Each event carries the affected [`ScreenInfo`] and the
/// [`ScreenChangeKind`], plus `changed_metrics` for `ScreenMetricsChanged`.
pub fn on_screen_change(listener: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync> {
    get_screen_backend().subscribe(listener)
}

/// Invalidates the backend's cached enumeration so the next [`get_screens`] /
/// [`get_primary_screen`] call reads fresh data. The native fallback re-reads on
/// every call; this is a safe no-op hook. Native backends that cache internally
/// override the seam.
pub fn refresh_screens() {
    // The native fallback re-reads on every call; no explicit invalidation
    // needed. Calling this is always safe.
}

/// Requests the host's multi-monitor detail API and, if granted, upgrades the
/// active backend to expose all attached screens. Returns `true` when the
/// multi-monitor view becomes active. The native fallback returns `false`
/// (no detail API in the box); a host backend (host-web) implements the upgrade.
pub fn request_screen_details() -> bool {
    false
}

/// Converts a point from physical screen pixel coordinates (relative to
/// `screen`'s origin) to DIP (logical) coordinates. Alias-safe: `out` may be the
/// same object as `point`.
///
/// `dip_x = point.x / screen.scale_factor + screen.x`
pub fn screen_to_dip_point<'a>(
    screen: &ScreenInfo,
    point: &Vector2Like,
    out: &'a mut Vector2Like,
) -> &'a mut Vector2Like {
    let px = point.x;
    let py = point.y;
    out.x = px / screen.scale_factor + screen.x;
    out.y = py / screen.scale_factor + screen.y;
    out
}

/// Converts a rectangle from physical screen pixel coordinates to DIP (logical)
/// coordinates. Alias-safe: `out` may be the same object as `rect`.
pub fn screen_to_dip_rect<'a>(
    screen: &ScreenInfo,
    rect: &RectangleLike,
    out: &'a mut RectangleLike,
) -> &'a mut RectangleLike {
    let rx = rect.x;
    let ry = rect.y;
    let rw = rect.width;
    let rh = rect.height;
    let sf = screen.scale_factor;
    out.x = rx / sf + screen.x;
    out.y = ry / sf + screen.y;
    out.width = rw / sf;
    out.height = rh / sf;
    out
}

/// Installs a native host screen backend; pass `None` to fall back to the native
/// default.
pub fn set_screen_backend(backend: Option<Arc<dyn ScreenBackend>>) {
    let mut guard = BACKEND.lock().expect("screen backend mutex poisoned");
    *guard = backend;
}

// Screen-change listeners keyed by subscription id; lazily allocated on first subscribe.
type ScreenSubscriptions = Mutex<Option<HashMap<usize, Box<dyn Fn() + Send + Sync>>>>;

static BACKEND: Mutex<Option<Arc<dyn ScreenBackend>>> = Mutex::new(None);
static SUBSCRIPTIONS: ScreenSubscriptions = Mutex::new(None);

// Copies all fields from `src` to `dst`.
fn copy_screen_info(src: &ScreenInfo, dst: &mut ScreenInfo) {
    *dst = src.clone();
}

fn fill_default_screen_info(out: &mut ScreenInfo) {
    *out = ScreenInfo::default();
}

/// Default backend; screen enumeration requires a window system, so this reports
/// clean sentinels — no screens, an untouched primary `out`, and a `(0, 0)`
/// cursor. A native host (winit/Electron/Tauri) replaces it via
/// [`set_screen_backend`] to enumerate every attached monitor.
struct NativeScreenBackend;

impl ScreenBackend for NativeScreenBackend {
    // Screen enumeration needs a window system std cannot provide, so the default
    // backend reports no screens. A host (winit/Electron/Tauri) replaces it.
    fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
        out.clear();
        out
    }

    // No primary display without a window system; leave `out` untouched (its
    // zeroed/scale-1 fields are the sentinel) and return it.
    fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
        out
    }

    fn subscribe(&self, _listener: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync> {
        Box::new(|| {})
    }

    fn get_cursor_position<'a>(&self, out: &'a mut Vector2Like) -> &'a mut Vector2Like {
        out.x = 0.0;
        out.y = 0.0;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::ScreenChangedMetrics;
    use serial_test::serial;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Tests share the process-global BACKEND, so each resets it and serializes via
    // the shared lock to avoid cross-test interference.
    fn reset_backend() {
        set_screen_backend(None);
    }

    fn make_screen_info(
        id: u32,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        primary: bool,
    ) -> ScreenInfo {
        ScreenInfo {
            id,
            x,
            y,
            width,
            height,
            is_primary: primary,
            ..ScreenInfo::default()
        }
    }

    // Fake host backend serving a fixed snapshot, with a fireable change listener
    // and a configurable cursor position.
    struct FakeBackend {
        screens: Vec<ScreenInfo>,
        cursor: (f32, f32),
        // Shared so the unsubscribe closure can clear the listener (mirroring the
        // TS fakeBackend whose subscribe returns `() => { listener = null }`).
        listener: Arc<Mutex<Option<ScreenChangeListener>>>,
    }

    impl FakeBackend {
        fn new(screens: Vec<ScreenInfo>) -> Arc<Self> {
            Arc::new(FakeBackend {
                screens,
                cursor: (42.0, 84.0),
                listener: Arc::new(Mutex::new(None)),
            })
        }

        fn with_cursor(screens: Vec<ScreenInfo>, cursor: (f32, f32)) -> Arc<Self> {
            Arc::new(FakeBackend {
                screens,
                cursor,
                listener: Arc::new(Mutex::new(None)),
            })
        }

        fn fire(&self, event: &ScreenChangeEvent) {
            if let Some(listener) = self.listener.lock().unwrap().as_ref() {
                listener(event);
            }
        }
    }

    impl ScreenBackend for FakeBackend {
        fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
            out.clear();
            out.extend(self.screens.iter().cloned());
            out
        }

        fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
            let primary = self
                .screens
                .iter()
                .find(|s| s.is_primary)
                .or_else(|| self.screens.first());
            if let Some(primary) = primary {
                *out = primary.clone();
            }
            out
        }

        fn subscribe(&self, listener: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync> {
            *self.listener.lock().unwrap() = Some(listener);
            let slot = Arc::clone(&self.listener);
            Box::new(move || {
                *slot.lock().unwrap() = None;
            })
        }

        fn get_cursor_position<'a>(&self, out: &'a mut Vector2Like) -> &'a mut Vector2Like {
            out.x = self.cursor.0;
            out.y = self.cursor.1;
            out
        }
    }

    fn metrics_event(screen: ScreenInfo) -> ScreenChangeEvent {
        ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenMetricsChanged,
            screen,
            changed_metrics: Some(ScreenChangedMetrics {
                bounds: true,
                ..ScreenChangedMetrics::default()
            }),
        }
    }

    #[test]
    #[serial]
    fn attach_screen_signals_fans_out_added_removed_metrics() {
        reset_backend();
        let backend = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 1920.0, 1080.0, true)]);
        set_screen_backend(Some(Arc::clone(&backend) as Arc<dyn ScreenBackend>));

        let signals = create_screen_signals();
        let added = Arc::new(AtomicUsize::new(0));
        let removed = Arc::new(AtomicUsize::new(0));
        let metrics = Arc::new(AtomicUsize::new(0));

        let a = Arc::clone(&added);
        let _g1 = flighthq_signals::connect_signal(
            &signals.on_screen_added,
            Arc::new(move |_: &ScreenInfo| {
                a.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let r = Arc::clone(&removed);
        let _g2 = flighthq_signals::connect_signal(
            &signals.on_screen_removed,
            Arc::new(move |_: &ScreenInfo| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        let m = Arc::clone(&metrics);
        let _g3 = flighthq_signals::connect_signal(
            &signals.on_screen_metrics_changed,
            Arc::new(move |_: &ScreenChangeEvent| {
                m.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_screen_signals(&signals);

        let screen = backend.screens[0].clone();
        backend.fire(&ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenAdded,
            screen: screen.clone(),
            changed_metrics: None,
        });
        backend.fire(&ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenRemoved,
            screen: screen.clone(),
            changed_metrics: None,
        });
        backend.fire(&metrics_event(screen));

        assert_eq!(added.load(Ordering::SeqCst), 1);
        assert_eq!(removed.load(Ordering::SeqCst), 1);
        assert_eq!(metrics.load(Ordering::SeqCst), 1);

        detach_screen_signals(&signals);
        reset_backend();
    }

    #[test]
    #[serial]
    fn attach_screen_signals_is_idempotent() {
        reset_backend();
        let backend = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 10.0, 10.0, true)]);
        set_screen_backend(Some(Arc::clone(&backend) as Arc<dyn ScreenBackend>));

        let signals = create_screen_signals();
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        let _g = flighthq_signals::connect_signal(
            &signals.on_screen_metrics_changed,
            Arc::new(move |_: &ScreenChangeEvent| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_screen_signals(&signals);
        attach_screen_signals(&signals); // second attach: should not double-fire
        backend.fire(&metrics_event(backend.screens[0].clone()));
        assert_eq!(count.load(Ordering::SeqCst), 1);

        detach_screen_signals(&signals);
        reset_backend();
    }

    #[test]
    #[serial]
    fn create_screen_info_zeroed_with_scale_one_and_sentinels() {
        let info = create_screen_info();
        assert_eq!(info.scale_factor, 1.0);
        assert!(!info.is_primary);
        assert_eq!(info.width, 0.0);
        assert_eq!(info.height, 0.0);
        assert_eq!(info.rotation, -1.0);
        assert_eq!(info.refresh_rate, -1.0);
        assert_eq!(info.color_depth, -1.0);
        assert_eq!(info.dpi, -1.0);
        assert_eq!(info.label, "");
        assert!(!info.is_hdr);
        assert!(!info.monochrome);
    }

    #[test]
    #[serial]
    fn create_screen_mode_sentinels() {
        let mode = create_screen_mode();
        assert_eq!(mode.width, 0.0);
        assert_eq!(mode.height, 0.0);
        assert_eq!(mode.refresh_rate, -1.0);
        assert_eq!(mode.color_depth, -1.0);
        assert_eq!(mode.pixel_format, "");
    }

    #[test]
    #[serial]
    fn detach_screen_signals_stops_delivery() {
        reset_backend();
        let backend = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 10.0, 10.0, true)]);
        set_screen_backend(Some(Arc::clone(&backend) as Arc<dyn ScreenBackend>));

        let signals = create_screen_signals();
        let count = Arc::new(AtomicUsize::new(0));
        let c = Arc::clone(&count);
        let _g = flighthq_signals::connect_signal(
            &signals.on_screen_metrics_changed,
            Arc::new(move |_: &ScreenChangeEvent| {
                c.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );

        attach_screen_signals(&signals);
        backend.fire(&metrics_event(backend.screens[0].clone()));
        detach_screen_signals(&signals);
        backend.fire(&metrics_event(backend.screens[0].clone()));
        assert_eq!(count.load(Ordering::SeqCst), 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn detach_screen_signals_safe_when_not_attached() {
        let signals = create_screen_signals();
        detach_screen_signals(&signals); // must not panic
    }

    #[test]
    #[serial]
    fn dip_to_screen_point_converts_and_offsets() {
        let screen = make_screen_info(0, 0.0, 0.0, 0.0, 0.0, false);
        let mut s2 = screen.clone();
        s2.scale_factor = 2.0;
        let mut out = Vector2Like::default();
        dip_to_screen_point(&s2, &Vector2Like { x: 10.0, y: 20.0 }, &mut out);
        assert_eq!(out.x, 20.0);
        assert_eq!(out.y, 40.0);

        let mut origin = ScreenInfo {
            x: 100.0,
            y: 50.0,
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        origin.scale_factor = 2.0;
        let mut out2 = Vector2Like::default();
        dip_to_screen_point(&origin, &Vector2Like { x: 110.0, y: 60.0 }, &mut out2);
        assert_eq!(out2.x, 20.0);
        assert_eq!(out2.y, 20.0);
    }

    #[test]
    #[serial]
    fn dip_to_screen_point_alias_safe() {
        let screen = ScreenInfo {
            scale_factor: 3.0,
            ..ScreenInfo::default()
        };
        let mut point = Vector2Like { x: 5.0, y: 10.0 };
        // SAFETY of aliasing: function reads inputs into locals before writing out.
        let snapshot = point;
        dip_to_screen_point(&screen, &snapshot, &mut point);
        assert_eq!(point.x, 15.0);
        assert_eq!(point.y, 30.0);
    }

    #[test]
    #[serial]
    fn dip_to_screen_rect_scales_and_offsets_and_alias_safe() {
        let screen = ScreenInfo {
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        let mut out = RectangleLike::default();
        dip_to_screen_rect(
            &screen,
            &RectangleLike {
                x: 10.0,
                y: 20.0,
                width: 50.0,
                height: 100.0,
            },
            &mut out,
        );
        assert_eq!(out.x, 20.0);
        assert_eq!(out.y, 40.0);
        assert_eq!(out.width, 100.0);
        assert_eq!(out.height, 200.0);

        let mut rect = RectangleLike {
            x: 5.0,
            y: 10.0,
            width: 20.0,
            height: 30.0,
        };
        let snapshot = rect;
        dip_to_screen_rect(&screen, &snapshot, &mut rect);
        assert_eq!(rect.x, 10.0);
        assert_eq!(rect.y, 20.0);
        assert_eq!(rect.width, 40.0);
        assert_eq!(rect.height, 60.0);
    }

    #[test]
    #[serial]
    fn dispose_screen_signals_safe_multiple_times() {
        reset_backend();
        let backend = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 10.0, 10.0, true)]);
        set_screen_backend(Some(Arc::clone(&backend) as Arc<dyn ScreenBackend>));
        let signals = create_screen_signals();
        attach_screen_signals(&signals);
        dispose_screen_signals(&signals);
        dispose_screen_signals(&signals);
        reset_backend();
    }

    #[test]
    #[serial]
    fn enable_screen_signals_returns_inert_group() {
        let signals = enable_screen_signals();
        assert!(!signals.on_screen_added.has_listeners());
        assert!(!signals.on_screen_metrics_changed.has_listeners());
        assert!(!signals.on_screen_removed.has_listeners());
    }

    #[test]
    #[serial]
    fn get_primary_screen_fills_and_returns_out() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 0.0, true),
            make_screen_info(1, 0.0, 0.0, 0.0, 0.0, false),
        ])));
        let mut out = create_screen_info();
        get_primary_screen(&mut out);
        assert!(out.is_primary);
        assert_eq!(out.width, 1920.0);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_backend_falls_back_and_honors_registration() {
        reset_backend();
        let _default = get_screen_backend();
        let fake = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 0.0, 0.0, true)]);
        set_screen_backend(Some(Arc::clone(&fake) as Arc<dyn ScreenBackend>));
        let mut screens = Vec::new();
        get_screens(&mut screens);
        assert_eq!(screens.len(), 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_bounds_fills_out() {
        let screen = make_screen_info(0, 10.0, 20.0, 1920.0, 1080.0, false);
        let mut out = RectangleLike::default();
        get_screen_bounds(&screen, &mut out);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 1920.0);
        assert_eq!(out.height, 1080.0);
    }

    #[test]
    #[serial]
    fn get_screen_by_id_matches_and_misses() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 0.0, true),
            make_screen_info(1, 0.0, 0.0, 2560.0, 0.0, false),
        ])));
        let mut out = create_screen_info();
        assert!(get_screen_by_id(1, &mut out).is_some());
        assert_eq!(out.width, 2560.0);
        assert!(get_screen_by_id(99, &mut out).is_none());
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_containing_rect_overlap_and_fallback() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 1080.0, true),
            make_screen_info(1, 1920.0, 0.0, 1920.0, 1080.0, false),
        ])));
        let mut out = create_screen_info();
        // Rect spans x=1900..2100: 20px on screen 0, 180px on screen 1 → screen 1.
        get_screen_containing_rect(
            &RectangleLike {
                x: 1900.0,
                y: 0.0,
                width: 200.0,
                height: 100.0,
            },
            &mut out,
        );
        assert_eq!(out.id, 1);

        // Far to the right — nearest center is screen 1.
        get_screen_containing_rect(
            &RectangleLike {
                x: 5000.0,
                y: 0.0,
                width: 10.0,
                height: 10.0,
            },
            &mut out,
        );
        assert_eq!(out.id, 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_current_mode_derives_from_fields() {
        let screen = ScreenInfo {
            width: 2560.0,
            height: 1440.0,
            refresh_rate: 144.0,
            color_depth: 32.0,
            ..ScreenInfo::default()
        };
        let mut out = create_screen_mode();
        get_screen_current_mode(&screen, &mut out);
        assert_eq!(out.width, 2560.0);
        assert_eq!(out.height, 1440.0);
        assert_eq!(out.refresh_rate, 144.0);
        assert_eq!(out.color_depth, 32.0);
    }

    #[test]
    #[serial]
    fn get_screen_cursor_position_uses_backend() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![make_screen_info(
            0, 0.0, 0.0, 0.0, 0.0, true,
        )])));
        let mut out = Vector2Like::default();
        get_screen_cursor_position(&mut out);
        assert_eq!(out.x, 42.0);
        assert_eq!(out.y, 84.0);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_cursor_position_native_sentinel() {
        reset_backend();
        let mut out = Vector2Like { x: 99.0, y: 99.0 };
        get_screen_cursor_position(&mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_cursor_screen_returns_nearest_to_cursor() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::with_cursor(
            vec![
                make_screen_info(0, 0.0, 0.0, 1920.0, 1080.0, true),
                make_screen_info(1, 1920.0, 0.0, 1920.0, 1080.0, false),
            ],
            (2000.0, 500.0),
        )));
        let mut out = create_screen_info();
        get_screen_cursor_screen(&mut out);
        assert_eq!(out.id, 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_detail_permission_returns_prompt() {
        assert_eq!(
            get_screen_detail_permission(),
            ScreenDetailPermission::Prompt
        );
    }

    #[test]
    #[serial]
    fn get_screen_modes_backend_and_fallback() {
        reset_backend();

        // Backend that provides modes.
        struct ModeBackend;
        impl ScreenBackend for ModeBackend {
            fn get_screens<'a>(&self, out: &'a mut Vec<ScreenInfo>) -> &'a mut Vec<ScreenInfo> {
                out.clear();
                out
            }
            fn get_primary_screen<'a>(&self, out: &'a mut ScreenInfo) -> &'a mut ScreenInfo {
                out
            }
            fn subscribe(&self, _l: ScreenChangeListener) -> Box<dyn Fn() + Send + Sync> {
                Box::new(|| {})
            }
            fn get_cursor_position<'a>(&self, out: &'a mut Vector2Like) -> &'a mut Vector2Like {
                out
            }
            fn get_modes<'a>(
                &self,
                _screen: &ScreenInfo,
                out: &'a mut Vec<ScreenMode>,
            ) -> Option<&'a mut Vec<ScreenMode>> {
                out.clear();
                out.push(ScreenMode {
                    width: 1920.0,
                    height: 1080.0,
                    refresh_rate: 60.0,
                    color_depth: 32.0,
                    pixel_format: String::new(),
                });
                Some(out)
            }
        }
        set_screen_backend(Some(Arc::new(ModeBackend)));
        let screen = create_screen_info();
        let mut out: Vec<ScreenMode> = Vec::new();
        get_screen_modes(&screen, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].width, 1920.0);

        // Fallback: backend without get_modes (the native default).
        reset_backend();
        let screen = ScreenInfo {
            width: 3840.0,
            height: 2160.0,
            ..ScreenInfo::default()
        };
        let mut out: Vec<ScreenMode> = Vec::new();
        get_screen_modes(&screen, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].width, 3840.0);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_nearest_point_contains_and_fallback() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 1080.0, true),
            make_screen_info(1, 1920.0, 0.0, 1920.0, 1080.0, false),
        ])));
        let mut out = create_screen_info();
        get_screen_nearest_point(
            &Vector2Like {
                x: 2000.0,
                y: 100.0,
            },
            &mut out,
        );
        assert_eq!(out.id, 1);
        get_screen_nearest_point(
            &Vector2Like {
                x: 9999.0,
                y: 540.0,
            },
            &mut out,
        );
        assert_eq!(out.id, 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screen_nearest_rect_delegates() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 1080.0, true),
            make_screen_info(1, 1920.0, 0.0, 1920.0, 1080.0, false),
        ])));
        let mut out = create_screen_info();
        get_screen_nearest_rect(
            &RectangleLike {
                x: 1920.0,
                y: 0.0,
                width: 200.0,
                height: 100.0,
            },
            &mut out,
        );
        assert_eq!(out.id, 1);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screens_fills_to_count() {
        reset_backend();
        set_screen_backend(Some(FakeBackend::new(vec![
            make_screen_info(0, 0.0, 0.0, 1920.0, 0.0, true),
            make_screen_info(1, 0.0, 0.0, 2560.0, 0.0, false),
            make_screen_info(2, 0.0, 0.0, 3840.0, 0.0, false),
        ])));
        let mut out = Vec::new();
        get_screens(&mut out);
        assert_eq!(out.len(), 3);
        assert!(out[0].is_primary);
        reset_backend();
    }

    #[test]
    #[serial]
    fn get_screens_default_is_empty() {
        reset_backend();
        let mut out = Vec::new();
        get_screens(&mut out);
        assert!(out.is_empty());
    }

    #[test]
    #[serial]
    fn get_screen_work_area_fills_out() {
        let screen = ScreenInfo {
            work_width: 1920.0,
            work_height: 1040.0,
            ..ScreenInfo::default()
        };
        let mut out = RectangleLike::default();
        get_screen_work_area(&screen, &mut out);
        assert_eq!(out.width, 1920.0);
        assert_eq!(out.height, 1040.0);
    }

    #[test]
    #[serial]
    fn on_screen_change_delivers_and_unsubscribes() {
        reset_backend();
        let fake = FakeBackend::new(vec![make_screen_info(0, 0.0, 0.0, 10.0, 10.0, true)]);
        set_screen_backend(Some(Arc::clone(&fake) as Arc<dyn ScreenBackend>));

        let changes = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&changes);
        let unsubscribe = on_screen_change(Box::new(move |_: &ScreenChangeEvent| {
            counter.fetch_add(1, Ordering::SeqCst);
        }));
        fake.fire(&metrics_event(fake.screens[0].clone()));
        assert_eq!(changes.load(Ordering::SeqCst), 1);
        unsubscribe();
        reset_backend();
    }

    #[test]
    #[serial]
    fn refresh_screens_is_callable() {
        refresh_screens(); // must not panic
    }

    #[test]
    #[serial]
    fn request_screen_details_native_false() {
        assert!(!request_screen_details());
    }

    #[test]
    #[serial]
    fn screen_to_dip_point_converts_offsets_alias_and_inverts() {
        let screen = ScreenInfo {
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        let mut out = Vector2Like::default();
        screen_to_dip_point(&screen, &Vector2Like { x: 20.0, y: 40.0 }, &mut out);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);

        let origin = ScreenInfo {
            x: 100.0,
            y: 50.0,
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        let mut out2 = Vector2Like::default();
        screen_to_dip_point(&origin, &Vector2Like { x: 20.0, y: 20.0 }, &mut out2);
        assert_eq!(out2.x, 110.0);
        assert_eq!(out2.y, 60.0);

        // Alias-safe.
        let s4 = ScreenInfo {
            scale_factor: 4.0,
            ..ScreenInfo::default()
        };
        let mut point = Vector2Like { x: 16.0, y: 32.0 };
        let snapshot = point;
        screen_to_dip_point(&s4, &snapshot, &mut point);
        assert_eq!(point.x, 4.0);
        assert_eq!(point.y, 8.0);

        // Inverse of dip_to_screen_point.
        let s = ScreenInfo {
            x: 200.0,
            y: 100.0,
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        let original = Vector2Like { x: 250.0, y: 150.0 };
        let mut physical = Vector2Like::default();
        dip_to_screen_point(&s, &original, &mut physical);
        let mut recovered = Vector2Like::default();
        screen_to_dip_point(&s, &physical, &mut recovered);
        assert!((recovered.x - original.x).abs() < 1e-3);
        assert!((recovered.y - original.y).abs() < 1e-3);
    }

    #[test]
    #[serial]
    fn screen_to_dip_rect_scales_alias_and_inverts() {
        let screen = ScreenInfo {
            scale_factor: 2.0,
            ..ScreenInfo::default()
        };
        let mut out = RectangleLike::default();
        screen_to_dip_rect(
            &screen,
            &RectangleLike {
                x: 20.0,
                y: 40.0,
                width: 100.0,
                height: 200.0,
            },
            &mut out,
        );
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 50.0);
        assert_eq!(out.height, 100.0);

        // Alias-safe.
        let mut rect = RectangleLike {
            x: 10.0,
            y: 20.0,
            width: 40.0,
            height: 60.0,
        };
        let snapshot = rect;
        screen_to_dip_rect(&screen, &snapshot, &mut rect);
        assert_eq!(rect.x, 5.0);
        assert_eq!(rect.y, 10.0);
        assert_eq!(rect.width, 20.0);
        assert_eq!(rect.height, 30.0);

        // Inverse of dip_to_screen_rect.
        let s3 = ScreenInfo {
            scale_factor: 3.0,
            ..ScreenInfo::default()
        };
        let original = RectangleLike {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 200.0,
        };
        let mut physical = RectangleLike::default();
        dip_to_screen_rect(&s3, &original, &mut physical);
        let mut recovered = RectangleLike::default();
        screen_to_dip_rect(&s3, &physical, &mut recovered);
        assert!((recovered.x - original.x).abs() < 1e-3);
        assert!((recovered.y - original.y).abs() < 1e-3);
        assert!((recovered.width - original.width).abs() < 1e-3);
        assert!((recovered.height - original.height).abs() < 1e-3);
    }

    #[test]
    #[serial]
    fn set_screen_backend_clears_to_default() {
        set_screen_backend(Some(FakeBackend::new(vec![make_screen_info(
            0, 0.0, 0.0, 0.0, 0.0, true,
        )])));
        set_screen_backend(None);
        let mut out = Vec::new();
        get_screens(&mut out);
        assert!(out.is_empty());
    }
}
