use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_geometry::{Rectangle, Vector2, create_vector2};
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::future::Future;
    use std::sync::Mutex;
    use std::task::{Context, Poll, Waker};

    use flight_geometry::create_rectangle;
    use flight_signals::{connect_signal, has_signal_slots};

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
                return value;
            }
        }
    }

    fn screen(id: f64, x: f32, width: f32) -> ScreenInfo {
        let mut out = create_screen_info();
        out.id = id;
        out.x = x;
        out.width = width;
        out.height = 100.0;
        out.work_width = width - 10.0;
        out.work_height = 90.0;
        out.scale_factor = 2.0;
        out.refresh_rate = 60.0;
        return out;
    }

    fn query() -> HostScreenQueryCapability {
        return HostScreenQueryCapability {
            provider: Arc::new(()),
            destroy: None,
            get_screens: Arc::new(|out: &mut Vec<ScreenInfo>| {
                out.clear();
                out.push(screen(1.0, 0.0, 100.0));
                out.push(screen(2.0, 300.0, 100.0));
            }),
            get_primary_screen: Arc::new(|out: &mut ScreenInfo| *out = screen(2.0, 300.0, 100.0)),
            get_cursor_position: Arc::new(|out: &mut Vector2| {
                out.x = 350.0;
                out.y = 10.0;
            }),
        };
    }

    fn counted<T: 'static>(
        count: Arc<Mutex<usize>>,
    ) -> Arc<dyn Fn(T) -> ScreenUnsubscribe + Send + Sync> {
        return Arc::new(move |_listener: T| {
            let count = count.clone();
            let release: ScreenUnsubscribe = Arc::new(move || *count.lock().unwrap() += 1);
            return release;
        });
    }

    fn change(count: Arc<Mutex<usize>>) -> HostScreenChangeCapability {
        return HostScreenChangeCapability {
            provider: Arc::new(()),
            subscribe: counted::<ScreenChangeListener>(count),
        };
    }

    fn permission_change(count: Arc<Mutex<usize>>) -> HostScreenPermissionChangeCapability {
        return HostScreenPermissionChangeCapability {
            provider: Arc::new(()),
            subscribe: counted::<ScreenPermissionListener>(count),
        };
    }

    fn details() -> HostScreenDetailsCapability {
        return HostScreenDetailsCapability {
            provider: Arc::new(()),
            query_permission: Arc::new(|| {
                let future: ScreenPermissionFuture =
                    Box::pin(async { Ok(ScreenPermissionState::Denied) });
                return future;
            }),
            request: Arc::new(|| {
                let future: ScreenDetailsRequestFuture = Box::pin(async { Ok(false) });
                return future;
            }),
        };
    }

    fn pair() -> (ScreenInfo, ScreenInfo) {
        return (create_screen_info(), create_screen_info());
    }

    #[test]
    fn host_screen_change_capability_attach_matches_attach_screen_signals() {
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let (mut a, mut b) = (create_screen_signals(), create_screen_signals());
        change(ca.clone()).attach(&mut a);
        attach_screen_signals(&change(cb.clone()), &mut b);
        assert_eq!(format!("{a:?}"), format!("{b:?}"));
        a.detach();
        b.detach();
        assert_eq!((*ca.lock().unwrap(), *cb.lock().unwrap()), (1, 1));
    }

    #[test]
    fn host_screen_details_capability_detail_permission_matches_get_screen_detail_permission() {
        let c = details();
        assert_eq!(
            block_on(c.detail_permission()),
            block_on(get_screen_detail_permission(&c))
        );
        assert_eq!(
            block_on(c.detail_permission()),
            Ok(ScreenPermissionState::Denied)
        );
    }

    #[test]
    fn host_screen_details_capability_request_screen_details_matches_request_screen_details() {
        let c = details();
        assert_eq!(
            block_on(c.request_screen_details()),
            block_on(request_screen_details(&c))
        );
        assert_eq!(block_on(c.request_screen_details()), Ok(false));
    }

    #[test]
    fn host_screen_permission_change_capability_attach_matches_attach_screen_permission_change() {
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let (mut a, mut b) = (
            create_screen_permission_change(),
            create_screen_permission_change(),
        );
        permission_change(ca.clone()).attach(&mut a);
        attach_screen_permission_change(&permission_change(cb.clone()), &mut b);
        assert_eq!(format!("{a:?}"), format!("{b:?}"));
        a.dispose();
        dispose_screen_permission_change(&mut b);
        assert_eq!((*ca.lock().unwrap(), *cb.lock().unwrap()), (1, 1));
    }

    #[test]
    fn host_screen_query_capability_by_id_matches_get_screen_by_id() {
        let c = query();
        let (mut a, mut b) = pair();
        let (mut sa, mut sb) = (create_screen_query_scratch(), create_screen_query_scratch());
        assert_eq!(
            c.by_id(&mut a, &mut sa, 2.0),
            get_screen_by_id(&mut b, &mut sb, &c, 2.0)
        );
        assert_eq!(a, b);
        assert_eq!(a.x, 300.0);
    }

    #[test]
    fn host_screen_query_capability_containing_rect_matches_get_screen_containing_rect() {
        let c = query();
        let (mut a, mut b) = pair();
        let rect = create_rectangle(280.0, 0.0, 40.0, 10.0);
        c.containing_rect(&mut a, &mut create_screen_query_scratch(), &rect);
        get_screen_containing_rect(&mut b, &mut create_screen_query_scratch(), &c, &rect);
        assert_eq!(a, b);
        assert_eq!(a.id, 2.0);
    }

    #[test]
    fn host_screen_query_capability_cursor_position_matches_get_screen_cursor_position() {
        let c = query();
        let (mut a, mut b) = (create_vector2(0.0, 0.0), create_vector2(0.0, 0.0));
        c.cursor_position(&mut a);
        get_screen_cursor_position(&mut b, &c);
        assert_eq!((a.x, a.y), (b.x, b.y));
        assert_eq!((a.x, a.y), (350.0, 10.0));
    }

    #[test]
    fn host_screen_query_capability_cursor_screen_matches_get_screen_cursor_screen() {
        let c = query();
        let (mut a, mut b) = pair();
        c.cursor_screen(&mut a, &mut create_screen_query_scratch());
        get_screen_cursor_screen(&mut b, &mut create_screen_query_scratch(), &c);
        assert_eq!(a, b);
        assert_eq!(a.id, 2.0);
    }

    #[test]
    fn host_screen_query_capability_nearest_point_matches_get_screen_nearest_point() {
        let c = query();
        let (mut a, mut b) = pair();
        let point = create_vector2(120.0, 50.0);
        c.nearest_point(&mut a, &mut create_screen_query_scratch(), &point);
        get_screen_nearest_point(&mut b, &mut create_screen_query_scratch(), &c, &point);
        assert_eq!(a, b);
        assert_eq!(a.id, 1.0);
    }

    #[test]
    fn host_screen_query_capability_nearest_rect_matches_get_screen_nearest_rect() {
        let c = query();
        let (mut a, mut b) = pair();
        let rect = create_rectangle(310.0, 10.0, 20.0, 20.0);
        c.nearest_rect(&mut a, &mut create_screen_query_scratch(), &rect);
        get_screen_nearest_rect(&mut b, &mut create_screen_query_scratch(), &c, &rect);
        assert_eq!(a, b);
        assert_eq!(a.id, 2.0);
    }

    #[test]
    fn host_screen_query_capability_primary_matches_get_primary_screen() {
        let c = query();
        let (mut a, mut b) = pair();
        c.primary(&mut a);
        get_primary_screen(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.id, 2.0);
    }

    #[test]
    fn host_screen_query_capability_screens_matches_get_screens() {
        let c = query();
        let (mut a, mut b) = (Vec::new(), Vec::new());
        c.screens(&mut a);
        get_screens(&mut b, &c);
        assert_eq!(a, b);
        assert_eq!(a.len(), 2);
    }

    #[test]
    fn screen_info_new_matches_create_screen_info() {
        assert_eq!(ScreenInfo::new(), create_screen_info());
    }

    #[test]
    fn screen_info_bounds_matches_get_screen_bounds() {
        let s = screen(1.0, 40.0, 100.0);
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        s.bounds(&mut a);
        get_screen_bounds(&mut b, &s);
        assert_eq!(a, b);
        assert_eq!(a.x, 40.0);
    }

    #[test]
    fn screen_info_current_mode_matches_get_screen_current_mode() {
        let s = screen(1.0, 0.0, 100.0);
        let (mut a, mut b) = (create_screen_mode(), create_screen_mode());
        s.current_mode(&mut a);
        get_screen_current_mode(&mut b, &s);
        assert_eq!(a, b);
        assert_eq!(a.refresh_rate, 60.0);
    }

    #[test]
    fn screen_info_dip_to_screen_point_matches_dip_to_screen_point() {
        let s = screen(1.0, 10.0, 100.0);
        let (mut a, mut b) = (create_vector2(0.0, 0.0), create_vector2(0.0, 0.0));
        let point = create_vector2(15.0, 4.0);
        s.dip_to_screen_point(&mut a, &point);
        dip_to_screen_point(&mut b, &s, &point);
        assert_eq!((a.x, a.y), (b.x, b.y));
        assert_eq!((a.x, a.y), (10.0, 8.0));
    }

    #[test]
    fn screen_info_dip_to_screen_rect_matches_dip_to_screen_rect() {
        let s = screen(1.0, 10.0, 100.0);
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        let rect = create_rectangle(15.0, 4.0, 5.0, 6.0);
        s.dip_to_screen_rect(&mut a, &rect);
        dip_to_screen_rect(&mut b, &s, &rect);
        assert_eq!(a, b);
        assert_eq!((a.width, a.height), (10.0, 12.0));
    }

    #[test]
    fn screen_info_screen_to_dip_point_matches_screen_to_dip_point() {
        let s = screen(1.0, 10.0, 100.0);
        let (mut a, mut b) = (create_vector2(0.0, 0.0), create_vector2(0.0, 0.0));
        let point = create_vector2(10.0, 8.0);
        s.screen_to_dip_point(&mut a, &point);
        screen_to_dip_point(&mut b, &s, &point);
        assert_eq!((a.x, a.y), (b.x, b.y));
        assert_eq!((a.x, a.y), (15.0, 4.0));
    }

    #[test]
    fn screen_info_screen_to_dip_rect_matches_screen_to_dip_rect() {
        let s = screen(1.0, 10.0, 100.0);
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        let rect = create_rectangle(10.0, 8.0, 10.0, 12.0);
        s.screen_to_dip_rect(&mut a, &rect);
        screen_to_dip_rect(&mut b, &s, &rect);
        assert_eq!(a, b);
        assert_eq!((a.width, a.height), (5.0, 6.0));
    }

    #[test]
    fn screen_info_work_area_matches_get_screen_work_area() {
        let s = screen(1.0, 10.0, 100.0);
        let (mut a, mut b) = (
            create_rectangle(0.0, 0.0, 0.0, 0.0),
            create_rectangle(0.0, 0.0, 0.0, 0.0),
        );
        s.work_area(&mut a);
        get_screen_work_area(&mut b, &s);
        assert_eq!(a, b);
        assert_eq!(a.width, 90.0);
    }

    #[test]
    fn screen_mode_new_matches_create_screen_mode() {
        assert_eq!(ScreenMode::new(), create_screen_mode());
    }

    #[test]
    fn screen_permission_change_new_detach_dispose_match_the_free_functions() {
        assert_eq!(
            format!("{:?}", ScreenPermissionChange::new()),
            format!("{:?}", create_screen_permission_change())
        );
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let (mut a, mut b) = (
            create_screen_permission_change(),
            create_screen_permission_change(),
        );
        attach_screen_permission_change(&permission_change(ca.clone()), &mut a);
        attach_screen_permission_change(&permission_change(cb.clone()), &mut b);
        a.detach();
        detach_screen_permission_change(&mut b);
        assert_eq!((*ca.lock().unwrap(), *cb.lock().unwrap()), (1, 1));
        connect_signal(&a.on_change, Arc::new(|_: &ScreenPermissionState| {}), None);
        a.dispose();
        assert!(!has_signal_slots(&a.on_change));
    }

    #[test]
    fn screen_query_scratch_new_matches_create_screen_query_scratch() {
        assert_eq!(
            format!("{:?}", ScreenQueryScratch::new()),
            format!("{:?}", create_screen_query_scratch())
        );
    }

    #[test]
    fn screen_signals_new_detach_dispose_match_the_free_functions() {
        assert_eq!(
            format!("{:?}", ScreenSignals::new()),
            format!("{:?}", create_screen_signals())
        );
        let (ca, cb) = (Arc::new(Mutex::new(0)), Arc::new(Mutex::new(0)));
        let (mut a, mut b) = (create_screen_signals(), create_screen_signals());
        attach_screen_signals(&change(ca.clone()), &mut a);
        attach_screen_signals(&change(cb.clone()), &mut b);
        a.detach();
        detach_screen_signals(&mut b);
        assert_eq!((*ca.lock().unwrap(), *cb.lock().unwrap()), (1, 1));
        connect_signal(&a.on_screen_added, Arc::new(|_: &ScreenInfo| {}), None);
        a.dispose();
        dispose_screen_signals(&mut b);
        assert_eq!(
            has_signal_slots(&a.on_screen_added),
            has_signal_slots(&b.on_screen_added)
        );
        assert!(!has_signal_slots(&a.on_screen_added));
    }
}

pub fn create_screen_info() -> ScreenInfo {
    let mut out: ScreenInfo = allocate_entity();
    initialize_screen_info(&mut out);
    return out;
}

pub fn create_screen_mode() -> ScreenMode {
    let mut out: ScreenMode = allocate_entity();
    initialize_screen_mode(&mut out);
    return out;
}

pub fn create_screen_permission_change() -> ScreenPermissionChange {
    let mut out: ScreenPermissionChange = allocate_entity();
    initialize_screen_permission_change(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D5: explicit caller-owned scratch replaces the source module `_scratchScreens` array
pub fn create_screen_query_scratch() -> ScreenQueryScratch {
    let mut out = ScreenQueryScratch {
        screens: Vec::new(),
    };
    initialize_screen_query_scratch(&mut out);
    return out;
}

pub fn create_screen_signals() -> ScreenSignals {
    let mut out: ScreenSignals = allocate_entity();
    initialize_screen_signals(&mut out);
    return out;
}

/// The documented defaults: id 0, zero geometry, scale 1, not primary, rotation -1, `Landscape`,
/// -1 metrics, not HDR, `Srgb`, label "", not internal, touch support "unknown", not monochrome.
pub fn initialize_screen_info(out: &mut ScreenInfo) {
    out.id = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
    out.work_width = 0.0;
    out.work_height = 0.0;
    out.scale_factor = 1.0;
    out.is_primary = false;
    out.rotation = -1.0;
    out.orientation = ScreenOrientation::Landscape;
    out.refresh_rate = -1.0;
    out.color_depth = -1.0;
    out.pixel_depth = -1.0;
    out.physical_width = -1.0;
    out.physical_height = -1.0;
    out.is_hdr = false;
    out.color_space = ScreenColorSpace::Srgb;
    out.max_luminance = -1.0;
    out.depth_per_component = -1.0;
    out.dpi = -1.0;
    out.label = String::new();
    out.internal = false;
    out.touch_support = "unknown".to_string();
    out.monochrome = false;
}

pub fn initialize_screen_mode(out: &mut ScreenMode) {
    out.width = 0.0;
    out.height = 0.0;
    out.refresh_rate = -1.0;
    out.color_depth = -1.0;
    out.pixel_format = String::new();
}

pub fn initialize_screen_permission_change(out: &mut ScreenPermissionChange) {
    out.on_change = create_signal();
    out.subscription = None;
}

// flight-lint: allow(conform-extra) D5: explicit caller-owned scratch replaces the source module `_scratchScreens` array
pub fn initialize_screen_query_scratch(out: &mut ScreenQueryScratch) {
    out.screens.clear();
}

pub fn initialize_screen_signals(out: &mut ScreenSignals) {
    out.on_screen_added = create_signal();
    out.on_screen_metrics_changed = create_signal();
    out.on_screen_removed = create_signal();
    out.subscription = None;
}

/// Starts forwarding provider permission states to `permission_change.on_change`, releasing any
/// prior subscription first. No lock is held while the signal emits.
pub fn attach_screen_permission_change(
    host_screen_permission_change: &HostScreenPermissionChangeCapability,
    permission_change: &mut ScreenPermissionChange,
) {
    detach_screen_permission_change(permission_change);
    let on_change = permission_change.on_change.clone();
    let listener: ScreenPermissionListener =
        Arc::new(move |state: ScreenPermissionState| emit_signal(&on_change, &state));
    permission_change.subscription = Some((host_screen_permission_change.subscribe)(listener));
}

/// Starts routing provider display changes: `ScreenAdded` and `ScreenRemoved` emit the event's screen
/// on their signals, and any other kind emits the whole event on `on_screen_metrics_changed`. The
/// provider's records are emitted by reference, unchanged. A prior subscription is released first.
pub fn attach_screen_signals(
    host_screen_change: &HostScreenChangeCapability,
    signals: &mut ScreenSignals,
) {
    detach_screen_signals(signals);
    let added = signals.on_screen_added.clone();
    let metrics_changed = signals.on_screen_metrics_changed.clone();
    let removed = signals.on_screen_removed.clone();
    let listener: ScreenChangeListener =
        Arc::new(move |event: &ScreenChangeEvent| match event.kind {
            ScreenChangeKind::ScreenAdded => emit_signal(&added, &event.screen),
            ScreenChangeKind::ScreenRemoved => emit_signal(&removed, &event.screen),
            ScreenChangeKind::ScreenMetricsChanged => emit_signal(&metrics_changed, event),
        });
    signals.subscription = Some((host_screen_change.subscribe)(listener));
}

/// Copies `src`'s data fields into `dst` while `dst` keeps its own runtime (TS
/// `Object.assign(dst, stripEntityRuntime(src))`).
fn copy_screen_info(dst: &mut ScreenInfo, src: &ScreenInfo) {
    let runtime = std::mem::take(&mut dst.runtime);
    *dst = src.clone();
    dst.runtime = runtime;
}

/// Releases the attached permission subscription; repeatable. The release is cleared after it
/// runs, as TS deletes the entry after calling it.
pub fn detach_screen_permission_change(permission_change: &mut ScreenPermissionChange) {
    if let Some(unsubscribe) = permission_change.subscription.clone() {
        unsubscribe();
    }
    permission_change.subscription = None;
}

/// Releases the attached display-change subscription; repeatable.
pub fn detach_screen_signals(signals: &mut ScreenSignals) {
    if let Some(unsubscribe) = signals.subscription.clone() {
        unsubscribe();
    }
    signals.subscription = None;
}

/// Desktop DIPs to screen-local pixels: `(point - screen origin) * scale_factor`. Each component reads
/// only its own input, as the source does.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn dip_to_screen_point(out: &mut Vector2, screen: &ScreenInfo, point: &Vector2) {
    out.x = (point.x - screen.x) * screen.scale_factor;
    out.y = (point.y - screen.y) * screen.scale_factor;
}

/// Desktop DIPs to screen-local pixels for a rectangle (position and extent).
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn dip_to_screen_rect(out: &mut Rectangle, screen: &ScreenInfo, rect: &Rectangle) {
    out.x = (rect.x - screen.x) * screen.scale_factor;
    out.y = (rect.y - screen.y) * screen.scale_factor;
    out.width = rect.width * screen.scale_factor;
    out.height = rect.height * screen.scale_factor;
}

pub fn dispose_screen_permission_change(permission_change: &mut ScreenPermissionChange) {
    detach_screen_permission_change(permission_change);
    clear_signal(&permission_change.on_change);
}

pub fn dispose_screen_signals(signals: &mut ScreenSignals) {
    detach_screen_signals(signals);
    clear_signal(&signals.on_screen_added);
    clear_signal(&signals.on_screen_metrics_changed);
    clear_signal(&signals.on_screen_removed);
}

/// Clears the caller's scratch and enumerates the provider into it (the same buffer every time).
fn enumerate_into_scratch(
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
) {
    scratch.screens.clear();
    get_screens(&mut scratch.screens, host_screen_query);
}

fn fill_default_screen_info(out: &mut ScreenInfo) {
    copy_screen_info(out, &create_screen_info());
}

// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_primary_screen(out: &mut ScreenInfo, host_screen_query: &HostScreenQueryCapability) {
    (host_screen_query.get_primary_screen)(out);
}

/// The screen's desktop bounds.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_screen_bounds(out: &mut Rectangle, screen: &ScreenInfo) {
    out.x = screen.x;
    out.y = screen.y;
    out.width = screen.width;
    out.height = screen.height;
}

/// Copies the first screen whose id equals `id` into `out` (its data fields only; `out` keeps its own
/// runtime) and returns true, or returns false without touching `out` (TS returns null).
// flight-lint: allow(conform-params) D5/D9b: explicit caller-owned scratch replaces the source module array; `out` first with a found status instead of `out | null`
// flight-lint: allow(f64) `id` is the exact-match display id (see `ScreenInfo`)
pub fn get_screen_by_id(
    out: &mut ScreenInfo,
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
    id: f64,
) -> bool {
    enumerate_into_scratch(scratch, host_screen_query);
    let Some(found) = scratch.screens.iter().find(|screen| screen.id == id) else {
        return false;
    };
    copy_screen_info(out, found);
    return true;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenChangeKind string union; the TS package exports no get_/parse_ free functions
pub fn get_screen_change_kind_string(value: ScreenChangeKind) -> &'static str {
    return match value {
        ScreenChangeKind::ScreenAdded => "ScreenAdded",
        ScreenChangeKind::ScreenMetricsChanged => "ScreenMetricsChanged",
        ScreenChangeKind::ScreenRemoved => "ScreenRemoved",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenColorSpace string union; the TS package exports no get_/parse_ free functions
pub fn get_screen_color_space_string(value: ScreenColorSpace) -> &'static str {
    return match value {
        ScreenColorSpace::DisplayP3 => "display-p3",
        ScreenColorSpace::Rec2020 => "rec2020",
        ScreenColorSpace::Srgb => "srgb",
    };
}

/// The screen with the largest overlap with `rect` (first on ties). With no screens, `out` becomes
/// the default screen; with no positive overlap, the screen nearest `rect`'s center.
// flight-lint: allow(conform-params) D5/D9b: explicit caller-owned scratch replaces the source module array; `out` first, returning nothing
pub fn get_screen_containing_rect(
    out: &mut ScreenInfo,
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
    rect: &Rectangle,
) {
    enumerate_into_scratch(scratch, host_screen_query);
    if scratch.screens.is_empty() {
        fill_default_screen_info(out);
        return;
    }
    let mut best = 0;
    let mut best_overlap = -1.0_f32;
    for (index, screen) in scratch.screens.iter().enumerate() {
        let overlap_x =
            0.0_f32.max((rect.x + rect.width).min(screen.x + screen.width) - rect.x.max(screen.x));
        let overlap_y = 0.0_f32
            .max((rect.y + rect.height).min(screen.y + screen.height) - rect.y.max(screen.y));
        let overlap = overlap_x * overlap_y;
        if overlap > best_overlap {
            best = index;
            best_overlap = overlap;
        }
    }
    if best_overlap <= 0.0 {
        let center = rect_center(rect);
        get_screen_nearest_point(out, scratch, host_screen_query, &center);
        return;
    }
    copy_screen_info(out, &scratch.screens[best]);
}

/// The screen's current mode: its dimensions, refresh rate and color depth, with `pixel_format`
/// cleared to "".
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_screen_current_mode(out: &mut ScreenMode, screen: &ScreenInfo) {
    out.width = screen.width;
    out.height = screen.height;
    out.refresh_rate = screen.refresh_rate;
    out.color_depth = screen.color_depth;
    out.pixel_format = String::new();
}

// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_screen_cursor_position(
    out: &mut Vector2,
    host_screen_query: &HostScreenQueryCapability,
) {
    (host_screen_query.get_cursor_position)(out);
}

/// The screen nearest the provider's cursor position (a per-call local point replaces the source's
/// module scratch point).
// flight-lint: allow(conform-params) D5/D9b: explicit caller-owned scratch replaces the source module array; `out` first, returning nothing
pub fn get_screen_cursor_screen(
    out: &mut ScreenInfo,
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
) {
    let mut cursor = create_vector2(0.0, 0.0);
    get_screen_cursor_position(&mut cursor, host_screen_query);
    get_screen_nearest_point(out, scratch, host_screen_query, &cursor);
}

/// The provider's window-management permission state; a rejection passes through unchanged.
pub async fn get_screen_detail_permission(
    host_screen_details: &HostScreenDetailsCapability,
) -> ScreenPermissionResult {
    return (host_screen_details.query_permission)().await;
}

/// The first screen containing `point` (half-open: [x, x + width) by [y, y + height)); otherwise
/// the screen with the nearest center (first on ties). With no screens, `out` becomes the default.
// flight-lint: allow(conform-params) D5/D9b: explicit caller-owned scratch replaces the source module array; `out` first, returning nothing
pub fn get_screen_nearest_point(
    out: &mut ScreenInfo,
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
    point: &Vector2,
) {
    enumerate_into_scratch(scratch, host_screen_query);
    if scratch.screens.is_empty() {
        fill_default_screen_info(out);
        return;
    }
    let containing = scratch.screens.iter().find(|screen| {
        point.x >= screen.x
            && point.x < screen.x + screen.width
            && point.y >= screen.y
            && point.y < screen.y + screen.height
    });
    if let Some(screen) = containing {
        copy_screen_info(out, screen);
        return;
    }
    let mut best = 0;
    let mut best_distance = f32::INFINITY;
    for (index, screen) in scratch.screens.iter().enumerate() {
        let dx = point.x - (screen.x + screen.width / 2.0);
        let dy = point.y - (screen.y + screen.height / 2.0);
        let distance = dx * dx + dy * dy;
        if distance < best_distance {
            best = index;
            best_distance = distance;
        }
    }
    copy_screen_info(out, &scratch.screens[best]);
}

/// The first screen fully containing `rect` (inclusive edges); otherwise the screen nearest `rect`'s
/// center (center selection, not largest overlap).
// flight-lint: allow(conform-params) D5/D9b: explicit caller-owned scratch replaces the source module array; `out` first, returning nothing
pub fn get_screen_nearest_rect(
    out: &mut ScreenInfo,
    scratch: &mut ScreenQueryScratch,
    host_screen_query: &HostScreenQueryCapability,
    rect: &Rectangle,
) {
    enumerate_into_scratch(scratch, host_screen_query);
    let containing = scratch.screens.iter().find(|screen| {
        rect.x >= screen.x
            && rect.y >= screen.y
            && rect.x + rect.width <= screen.x + screen.width
            && rect.y + rect.height <= screen.y + screen.height
    });
    if let Some(screen) = containing {
        copy_screen_info(out, screen);
        return;
    }
    let center = rect_center(rect);
    get_screen_nearest_point(out, scratch, host_screen_query, &center);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenOrientation string union; the TS package exports no get_/parse_ free functions
pub fn get_screen_orientation_string(value: ScreenOrientation) -> &'static str {
    return match value {
        ScreenOrientation::Landscape => "Landscape",
        ScreenOrientation::LandscapeFlipped => "LandscapeFlipped",
        ScreenOrientation::Portrait => "Portrait",
        ScreenOrientation::PortraitFlipped => "PortraitFlipped",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenPermissionState string union; the TS package exports no get_/parse_ free functions
pub fn get_screen_permission_state_string(value: ScreenPermissionState) -> &'static str {
    return match value {
        ScreenPermissionState::Denied => "denied",
        ScreenPermissionState::Granted => "granted",
        ScreenPermissionState::Prompt => "prompt",
    };
}

/// The screen's work area at its desktop origin.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_screen_work_area(out: &mut Rectangle, screen: &ScreenInfo) {
    out.x = screen.x;
    out.y = screen.y;
    out.width = screen.work_width;
    out.height = screen.work_height;
}

/// Enumerates every display into the caller-owned `out`.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn get_screens(out: &mut Vec<ScreenInfo>, host_screen_query: &HostScreenQueryCapability) {
    (host_screen_query.get_screens)(out);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenChangeKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_screen_change_kind(value: &str) -> Option<ScreenChangeKind> {
    return match value {
        "ScreenAdded" => Some(ScreenChangeKind::ScreenAdded),
        "ScreenMetricsChanged" => Some(ScreenChangeKind::ScreenMetricsChanged),
        "ScreenRemoved" => Some(ScreenChangeKind::ScreenRemoved),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenColorSpace string union; the TS package exports no get_/parse_ free functions
pub fn parse_screen_color_space(value: &str) -> Option<ScreenColorSpace> {
    return match value {
        "display-p3" => Some(ScreenColorSpace::DisplayP3),
        "rec2020" => Some(ScreenColorSpace::Rec2020),
        "srgb" => Some(ScreenColorSpace::Srgb),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenOrientation string union; the TS package exports no get_/parse_ free functions
pub fn parse_screen_orientation(value: &str) -> Option<ScreenOrientation> {
    return match value {
        "Landscape" => Some(ScreenOrientation::Landscape),
        "LandscapeFlipped" => Some(ScreenOrientation::LandscapeFlipped),
        "Portrait" => Some(ScreenOrientation::Portrait),
        "PortraitFlipped" => Some(ScreenOrientation::PortraitFlipped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS ScreenPermissionState string union; the TS package exports no get_/parse_ free functions
pub fn parse_screen_permission_state(value: &str) -> Option<ScreenPermissionState> {
    return match value {
        "denied" => Some(ScreenPermissionState::Denied),
        "granted" => Some(ScreenPermissionState::Granted),
        "prompt" => Some(ScreenPermissionState::Prompt),
        _ => None,
    };
}

fn rect_center(rect: &Rectangle) -> Vector2 {
    return create_vector2(rect.x + rect.width / 2.0, rect.y + rect.height / 2.0);
}

/// Asks the provider for detailed screen access; resolves to whether it was granted. A rejection
/// passes through unchanged.
pub async fn request_screen_details(
    host_screen_details: &HostScreenDetailsCapability,
) -> ScreenDetailsRequestResult {
    return (host_screen_details.request)().await;
}

/// Screen-local pixels to desktop DIPs: `point / scale_factor + screen origin`.
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn screen_to_dip_point(out: &mut Vector2, screen: &ScreenInfo, point: &Vector2) {
    out.x = point.x / screen.scale_factor + screen.x;
    out.y = point.y / screen.scale_factor + screen.y;
}

/// Screen-local pixels to desktop DIPs for a rectangle (position and extent).
// flight-lint: allow(conform-params) D9b: TS takes `out` last and returns it; Rust takes `out` first and returns nothing
pub fn screen_to_dip_rect(out: &mut Rectangle, screen: &ScreenInfo, rect: &Rectangle) {
    out.x = rect.x / screen.scale_factor + screen.x;
    out.y = rect.y / screen.scale_factor + screen.y;
    out.width = rect.width / screen.scale_factor;
    out.height = rect.height / screen.scale_factor;
}

impl HostScreenChangeCapability {
    pub fn attach(&self, signals: &mut ScreenSignals) {
        attach_screen_signals(self, signals);
    }
}

// The details capability's `request` field shares the short name, so that delegate keeps the fuller
// free-function name (D18 collision rule).
impl HostScreenDetailsCapability {
    pub async fn detail_permission(&self) -> ScreenPermissionResult {
        return get_screen_detail_permission(self).await;
    }

    pub async fn request_screen_details(&self) -> ScreenDetailsRequestResult {
        return request_screen_details(self).await;
    }
}

impl HostScreenPermissionChangeCapability {
    pub fn attach(&self, permission_change: &mut ScreenPermissionChange) {
        attach_screen_permission_change(self, permission_change);
    }
}

impl HostScreenQueryCapability {
    // flight-lint: allow(f64) `id` is the exact-match display id (see `ScreenInfo`)
    pub fn by_id(&self, out: &mut ScreenInfo, scratch: &mut ScreenQueryScratch, id: f64) -> bool {
        return get_screen_by_id(out, scratch, self, id);
    }

    pub fn containing_rect(
        &self,
        out: &mut ScreenInfo,
        scratch: &mut ScreenQueryScratch,
        rect: &Rectangle,
    ) {
        get_screen_containing_rect(out, scratch, self, rect);
    }

    pub fn cursor_position(&self, out: &mut Vector2) {
        get_screen_cursor_position(out, self);
    }

    pub fn cursor_screen(&self, out: &mut ScreenInfo, scratch: &mut ScreenQueryScratch) {
        get_screen_cursor_screen(out, scratch, self);
    }

    pub fn nearest_point(
        &self,
        out: &mut ScreenInfo,
        scratch: &mut ScreenQueryScratch,
        point: &Vector2,
    ) {
        get_screen_nearest_point(out, scratch, self, point);
    }

    pub fn nearest_rect(
        &self,
        out: &mut ScreenInfo,
        scratch: &mut ScreenQueryScratch,
        rect: &Rectangle,
    ) {
        get_screen_nearest_rect(out, scratch, self, rect);
    }

    pub fn primary(&self, out: &mut ScreenInfo) {
        get_primary_screen(out, self);
    }

    pub fn screens(&self, out: &mut Vec<ScreenInfo>) {
        get_screens(out, self);
    }
}

// The coordinate conversions keep their full names: dropping "screen" would change their meaning.
impl ScreenInfo {
    pub fn new() -> Self {
        return create_screen_info();
    }

    pub fn bounds(&self, out: &mut Rectangle) {
        get_screen_bounds(out, self);
    }

    pub fn current_mode(&self, out: &mut ScreenMode) {
        get_screen_current_mode(out, self);
    }

    pub fn dip_to_screen_point(&self, out: &mut Vector2, point: &Vector2) {
        dip_to_screen_point(out, self, point);
    }

    pub fn dip_to_screen_rect(&self, out: &mut Rectangle, rect: &Rectangle) {
        dip_to_screen_rect(out, self, rect);
    }

    pub fn screen_to_dip_point(&self, out: &mut Vector2, point: &Vector2) {
        screen_to_dip_point(out, self, point);
    }

    pub fn screen_to_dip_rect(&self, out: &mut Rectangle, rect: &Rectangle) {
        screen_to_dip_rect(out, self, rect);
    }

    pub fn work_area(&self, out: &mut Rectangle) {
        get_screen_work_area(out, self);
    }
}

impl ScreenMode {
    pub fn new() -> Self {
        return create_screen_mode();
    }
}

impl ScreenPermissionChange {
    pub fn new() -> Self {
        return create_screen_permission_change();
    }

    pub fn detach(&mut self) {
        detach_screen_permission_change(self);
    }

    pub fn dispose(&mut self) {
        dispose_screen_permission_change(self);
    }
}

impl ScreenQueryScratch {
    pub fn new() -> Self {
        return create_screen_query_scratch();
    }
}

impl ScreenSignals {
    pub fn new() -> Self {
        return create_screen_signals();
    }

    pub fn detach(&mut self) {
        detach_screen_signals(self);
    }

    pub fn dispose(&mut self) {
        dispose_screen_signals(self);
    }
}
