use std::future::Future;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};

use flight_entity::{FlightError, FlightErrorKind, attach_entity_binding, get_entity_binding_as};
use flight_geometry::{Rectangle, Vector2, create_rectangle, create_vector2};
use flight_hostcapability::ProviderRef;
use flight_screen::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = Box::pin(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

fn provider() -> ProviderRef {
    return Arc::new(());
}

fn test_screen(id: f64, x: f32, y: f32, width: f32, height: f32) -> ScreenInfo {
    let mut out = create_screen_info();
    out.id = id;
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
    out.work_width = width;
    out.work_height = height;
    return out;
}

fn scaled_screen() -> ScreenInfo {
    let mut out = test_screen(1.0, 100.0, 50.0, 800.0, 600.0);
    out.scale_factor = 2.0;
    return out;
}

fn separated_screens() -> Vec<ScreenInfo> {
    return vec![
        test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
        test_screen(2.0, 300.0, 0.0, 100.0, 100.0),
    ];
}

/// The addresses of the Vec the provider was handed on each `get_screens` call.
type ScreensCalls = Arc<Mutex<Vec<usize>>>;

/// A query provider over fixed screens and cursor (TS `createScreenQueryHost`), recording the
/// buffers it is handed.
fn query_host(
    screens: Vec<ScreenInfo>,
    cursor: (f32, f32),
) -> (HostScreenQueryCapability, ScreensCalls) {
    let calls: ScreensCalls = Arc::new(Mutex::new(Vec::new()));
    let (record, all, primary_source) = (calls.clone(), screens.clone(), screens);
    let host = HostScreenQueryCapability {
        provider: provider(),
        destroy: None,
        get_screens: Arc::new(move |out: &mut Vec<ScreenInfo>| {
            record
                .lock()
                .unwrap()
                .push(out as *const Vec<ScreenInfo> as usize);
            out.clear();
            out.extend(all.iter().cloned());
        }),
        get_primary_screen: Arc::new(move |out: &mut ScreenInfo| {
            let primary = primary_source
                .iter()
                .find(|s| s.is_primary)
                .or(primary_source.first());
            if let Some(primary) = primary {
                *out = primary.clone();
            }
        }),
        get_cursor_position: Arc::new(move |out: &mut Vector2| {
            out.x = cursor.0;
            out.y = cursor.1;
        }),
    };
    return (host, calls);
}

fn query(screens: Vec<ScreenInfo>) -> HostScreenQueryCapability {
    return query_host(screens, (0.0, 0.0)).0;
}

/// A change provider (TS `createScreenChangeHarness`): the captured listener plus an unsubscribe
/// call counter.
fn change_harness() -> (
    HostScreenChangeCapability,
    Arc<Mutex<Option<ScreenChangeListener>>>,
    Arc<Mutex<usize>>,
) {
    let listener: Arc<Mutex<Option<ScreenChangeListener>>> = Arc::new(Mutex::new(None));
    let unsubscribes = Arc::new(Mutex::new(0));
    let (slot, count) = (listener.clone(), unsubscribes.clone());
    let host = HostScreenChangeCapability {
        provider: provider(),
        subscribe: Arc::new(move |next: ScreenChangeListener| {
            *slot.lock().unwrap() = Some(next);
            let count = count.clone();
            let release: ScreenUnsubscribe = Arc::new(move || *count.lock().unwrap() += 1);
            return release;
        }),
    };
    return (host, listener, unsubscribes);
}

fn permission_harness() -> (
    HostScreenPermissionChangeCapability,
    Arc<Mutex<Option<ScreenPermissionListener>>>,
    Arc<Mutex<usize>>,
) {
    let listener: Arc<Mutex<Option<ScreenPermissionListener>>> = Arc::new(Mutex::new(None));
    let unsubscribes = Arc::new(Mutex::new(0));
    let (slot, count) = (listener.clone(), unsubscribes.clone());
    let host = HostScreenPermissionChangeCapability {
        provider: provider(),
        subscribe: Arc::new(move |next: ScreenPermissionListener| {
            *slot.lock().unwrap() = Some(next);
            let count = count.clone();
            let release: ScreenUnsubscribe = Arc::new(move || *count.lock().unwrap() += 1);
            return release;
        }),
    };
    return (host, listener, unsubscribes);
}

fn details_host(
    permission: ScreenPermissionResult,
    request: ScreenDetailsRequestResult,
) -> (HostScreenDetailsCapability, Arc<Mutex<(usize, usize)>>) {
    let calls = Arc::new(Mutex::new((0, 0)));
    let (q, r) = (calls.clone(), calls.clone());
    let host = HostScreenDetailsCapability {
        provider: provider(),
        query_permission: Arc::new(move || {
            q.lock().unwrap().0 += 1;
            let value = permission.clone();
            let future: ScreenPermissionFuture = Box::pin(async move { value });
            return future;
        }),
        request: Arc::new(move || {
            r.lock().unwrap().1 += 1;
            let value = request.clone();
            let future: ScreenDetailsRequestFuture = Box::pin(async move { value });
            return future;
        }),
    };
    return (host, calls);
}

fn nearest_point(host: &HostScreenQueryCapability, x: f32, y: f32) -> f64 {
    let mut out = create_screen_info();
    get_screen_nearest_point(
        &mut out,
        &mut create_screen_query_scratch(),
        host,
        &create_vector2(x, y),
    );
    return out.id;
}

fn nearest_rect(host: &HostScreenQueryCapability, rect: Rectangle) -> f64 {
    let mut out = create_screen_info();
    get_screen_nearest_rect(&mut out, &mut create_screen_query_scratch(), host, &rect);
    return out.id;
}

fn containing_rect(host: &HostScreenQueryCapability, rect: Rectangle) -> f64 {
    let mut out = create_screen_info();
    get_screen_containing_rect(&mut out, &mut create_screen_query_scratch(), host, &rect);
    return out.id;
}

mod attach_screen_permission_change {
    use super::*;

    #[test]
    fn forwards_permission_states_from_the_supplied_host() {
        let (host, listener, _) = permission_harness();
        let mut permission_change = create_screen_permission_change();
        let seen: Arc<Mutex<Vec<ScreenPermissionState>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        connect_signal(
            &permission_change.on_change,
            Arc::new(move |s: &ScreenPermissionState| sink.lock().unwrap().push(*s)),
            None,
        );
        attach_screen_permission_change(&host, &mut permission_change);
        listener.lock().unwrap().clone().unwrap()(ScreenPermissionState::Granted);
        assert_eq!(*seen.lock().unwrap(), vec![ScreenPermissionState::Granted]);
    }
}

mod attach_screen_signals {
    use super::*;

    #[test]
    fn routes_added_removed_and_metrics_events_to_their_matching_signals() {
        let (host, listener, _) = change_harness();
        let mut signals = create_screen_signals();
        let added: Arc<Mutex<Vec<ScreenInfo>>> = Arc::new(Mutex::new(Vec::new()));
        let removed: Arc<Mutex<Vec<ScreenInfo>>> = Arc::new(Mutex::new(Vec::new()));
        let metrics: Arc<Mutex<Vec<ScreenChangeEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let (a, r, m) = (added.clone(), removed.clone(), metrics.clone());
        connect_signal(
            &signals.on_screen_added,
            Arc::new(move |s: &ScreenInfo| a.lock().unwrap().push(s.clone())),
            None,
        );
        connect_signal(
            &signals.on_screen_removed,
            Arc::new(move |s: &ScreenInfo| r.lock().unwrap().push(s.clone())),
            None,
        );
        connect_signal(
            &signals.on_screen_metrics_changed,
            Arc::new(move |e: &ScreenChangeEvent| m.lock().unwrap().push(e.clone())),
            None,
        );
        let screen = test_screen(7.0, 100.0, 200.0, 800.0, 600.0);
        let metrics_event = ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenMetricsChanged,
            screen: screen.clone(),
            changed_metrics: Some(ScreenChangedMetrics {
                bounds: true,
                orientation: false,
                scale_factor: true,
                work_area: false,
            }),
        };
        attach_screen_signals(&host, &mut signals);
        let emit = listener.lock().unwrap().clone().unwrap();
        emit(&ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenAdded,
            screen: screen.clone(),
            changed_metrics: None,
        });
        emit(&ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenRemoved,
            screen: screen.clone(),
            changed_metrics: None,
        });
        emit(&metrics_event);
        assert_eq!(*added.lock().unwrap(), vec![screen.clone()]);
        assert_eq!(*removed.lock().unwrap(), vec![screen]);
        assert_eq!(*metrics.lock().unwrap(), vec![metrics_event]);
    }

    #[test]
    fn emits_the_providers_screen_record_by_reference() {
        let (host, listener, _) = change_harness();
        let mut signals = create_screen_signals();
        let seen = Arc::new(Mutex::new(0usize));
        let sink = seen.clone();
        connect_signal(
            &signals.on_screen_added,
            Arc::new(move |s: &ScreenInfo| *sink.lock().unwrap() = s as *const ScreenInfo as usize),
            None,
        );
        attach_screen_signals(&host, &mut signals);
        let event = ScreenChangeEvent {
            kind: ScreenChangeKind::ScreenAdded,
            screen: create_screen_info(),
            changed_metrics: None,
        };
        listener.lock().unwrap().clone().unwrap()(&event);
        assert_eq!(
            *seen.lock().unwrap(),
            &event.screen as *const ScreenInfo as usize
        );
    }
}

mod create_screen_info {
    use super::*;

    #[test]
    fn creates_an_entity_with_documented_defaults_and_sentinels() {
        let s = create_screen_info();
        let _: &dyn flight_entity::Entity = &s;
        assert_eq!(
            (
                s.id,
                s.x,
                s.y,
                s.width,
                s.height,
                s.work_width,
                s.work_height
            ),
            (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(s.scale_factor, 1.0);
        assert!(!s.is_primary);
        assert_eq!(s.rotation, -1.0);
        assert_eq!(s.orientation, ScreenOrientation::Landscape);
        assert_eq!(
            (
                s.refresh_rate,
                s.color_depth,
                s.pixel_depth,
                s.physical_width,
                s.physical_height
            ),
            (-1.0, -1.0, -1.0, -1.0, -1.0)
        );
        assert!(!s.is_hdr);
        assert_eq!(s.color_space, ScreenColorSpace::Srgb);
        assert_eq!(
            (s.max_luminance, s.depth_per_component, s.dpi),
            (-1.0, -1.0, -1.0)
        );
        assert_eq!(s.label, "");
        assert!(!s.internal);
        assert_eq!(s.touch_support, "unknown");
        assert!(!s.monochrome);
    }
}

mod create_screen_mode {
    use super::*;

    #[test]
    fn creates_an_entity_with_unknown_mode_sentinels() {
        let m = create_screen_mode();
        let _: &dyn flight_entity::Entity = &m;
        assert_eq!(
            (m.width, m.height, m.refresh_rate, m.color_depth),
            (0.0, 0.0, -1.0, -1.0)
        );
        assert_eq!(m.pixel_format, "");
    }
}

mod create_screen_permission_change {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_empty_permission_signal() {
        let p = create_screen_permission_change();
        let _: &dyn flight_entity::Entity = &p;
        assert!(p.on_change.data.read().unwrap().is_none());
    }
}

mod create_screen_query_scratch {
    use super::*;

    #[test]
    fn starts_empty_and_is_reused_by_every_derived_query() {
        let (host, calls) = query_host(separated_screens(), (0.0, 0.0));
        let mut scratch = create_screen_query_scratch();
        let mut out = create_screen_info();
        assert!(get_screen_by_id(&mut out, &mut scratch, &host, 1.0));
        get_screen_containing_rect(
            &mut out,
            &mut scratch,
            &host,
            &create_rectangle(10.0, 10.0, 20.0, 20.0),
        );
        get_screen_nearest_point(&mut out, &mut scratch, &host, &create_vector2(10.0, 10.0));
        get_screen_nearest_rect(
            &mut out,
            &mut scratch,
            &host,
            &create_rectangle(10.0, 10.0, 20.0, 20.0),
        );
        let calls = calls.lock().unwrap();
        assert_eq!(calls.len(), 4);
        assert!(calls.iter().all(|address| *address == calls[0]));
    }
}

mod create_screen_signals {
    use super::*;

    #[test]
    fn creates_an_entity_with_three_independent_empty_signals() {
        let s = create_screen_signals();
        let _: &dyn flight_entity::Entity = &s;
        assert!(!Arc::ptr_eq(
            &s.on_screen_added.data,
            &s.on_screen_removed.data
        ));
        assert!(s.on_screen_added.data.read().unwrap().is_none());
        assert!(s.on_screen_metrics_changed.data.read().unwrap().is_none());
        assert!(s.on_screen_removed.data.read().unwrap().is_none());
    }
}

mod detach_screen_permission_change {
    use super::*;

    #[test]
    fn unsubscribes_an_attachment_once_and_remains_repeatable() {
        let (host, _, unsubscribes) = permission_harness();
        let mut p = create_screen_permission_change();
        attach_screen_permission_change(&host, &mut p);
        detach_screen_permission_change(&mut p);
        detach_screen_permission_change(&mut p);
        assert_eq!(*unsubscribes.lock().unwrap(), 1);
    }
}

mod detach_screen_signals {
    use super::*;

    #[test]
    fn unsubscribes_an_attachment_once_and_remains_repeatable() {
        let (host, _, unsubscribes) = change_harness();
        let mut s = create_screen_signals();
        attach_screen_signals(&host, &mut s);
        detach_screen_signals(&mut s);
        detach_screen_signals(&mut s);
        assert_eq!(*unsubscribes.lock().unwrap(), 1);
    }
}

mod dip_to_screen_point {
    use super::*;

    #[test]
    fn converts_from_desktop_dips_to_screen_local_pixels() {
        let mut out = create_vector2(-1.0, -1.0);
        dip_to_screen_point(&mut out, &scaled_screen(), &create_vector2(112.0, 73.0));
        assert_eq!((out.x, out.y), (24.0, 46.0));
    }

    #[test]
    fn converts_in_place_like_the_aliased_source_call() {
        // TS passes the same object as point and out; Rust's borrow rules forbid that aliasing, so the
        // in-place pattern converts a copy into the original, with the same result.
        let mut point = create_vector2(112.0, 73.0);
        let input = point.clone();
        dip_to_screen_point(&mut point, &scaled_screen(), &input);
        assert_eq!((point.x, point.y), (24.0, 46.0));
    }
}

mod dip_to_screen_rect {
    use super::*;

    #[test]
    fn converts_position_and_extent_to_screen_local_pixels() {
        let mut out = create_rectangle(-1.0, -1.0, -1.0, -1.0);
        dip_to_screen_rect(
            &mut out,
            &scaled_screen(),
            &create_rectangle(112.0, 73.0, 30.0, 40.0),
        );
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (24.0, 46.0, 60.0, 80.0)
        );
    }

    #[test]
    fn converts_in_place_like_the_aliased_source_call() {
        let mut rect = create_rectangle(112.0, 73.0, 30.0, 40.0);
        let input = rect.clone();
        dip_to_screen_rect(&mut rect, &scaled_screen(), &input);
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (24.0, 46.0, 60.0, 80.0)
        );
    }
}

mod dispose_screen_permission_change {
    use super::*;

    #[test]
    fn detaches_the_host_and_clears_the_signal() {
        let (host, _, unsubscribes) = permission_harness();
        let mut p = create_screen_permission_change();
        connect_signal(&p.on_change, Arc::new(|_: &ScreenPermissionState| {}), None);
        attach_screen_permission_change(&host, &mut p);
        dispose_screen_permission_change(&mut p);
        assert_eq!(*unsubscribes.lock().unwrap(), 1);
        assert!(!has_signal_slots(&p.on_change));
    }
}

mod dispose_screen_signals {
    use super::*;

    #[test]
    fn detaches_the_host_and_clears_every_signal() {
        let (host, _, unsubscribes) = change_harness();
        let mut s = create_screen_signals();
        connect_signal(&s.on_screen_added, Arc::new(|_: &ScreenInfo| {}), None);
        connect_signal(
            &s.on_screen_metrics_changed,
            Arc::new(|_: &ScreenChangeEvent| {}),
            None,
        );
        connect_signal(&s.on_screen_removed, Arc::new(|_: &ScreenInfo| {}), None);
        attach_screen_signals(&host, &mut s);
        dispose_screen_signals(&mut s);
        assert_eq!(*unsubscribes.lock().unwrap(), 1);
        assert!(!has_signal_slots(&s.on_screen_added));
        assert!(!has_signal_slots(&s.on_screen_metrics_changed));
        assert!(!has_signal_slots(&s.on_screen_removed));
    }
}

mod get_primary_screen {
    use super::*;

    #[test]
    fn delegates_to_the_host_with_the_caller_owned_output() {
        let mut primary = test_screen(3.0, 10.0, 20.0, 1920.0, 1080.0);
        primary.is_primary = true;
        let host = query(vec![primary.clone()]);
        let mut out = create_screen_info();
        get_primary_screen(&mut out, &host);
        assert_eq!(
            (out.id, out.x, out.y, out.width, out.height, out.is_primary),
            (3.0, 10.0, 20.0, 1920.0, 1080.0, true)
        );
    }
}

mod get_screen_bounds {
    use super::*;

    #[test]
    fn extracts_desktop_bounds_into_the_supplied_output() {
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_screen_bounds(&mut out, &test_screen(1.0, -1280.0, 120.0, 1280.0, 720.0));
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (-1280.0, 120.0, 1280.0, 720.0)
        );
    }
}

mod get_screen_by_id {
    use super::*;

    #[test]
    fn copies_a_matching_screen_into_out_and_reports_absence() {
        let first = test_screen(10.0, 0.0, 0.0, 100.0, 100.0);
        let mut second = test_screen(20.0, 300.0, 0.0, 200.0, 150.0);
        second.label = "external".to_string();
        second.scale_factor = 2.0;
        let host = query(vec![first, second.clone()]);
        let mut scratch = create_screen_query_scratch();
        let mut out = create_screen_info();
        assert!(get_screen_by_id(&mut out, &mut scratch, &host, 20.0));
        assert_eq!(out, second);
        assert!(!get_screen_by_id(&mut out, &mut scratch, &host, 99.0));
    }

    #[test]
    fn preserves_the_destination_runtime_while_copying_public_screen_data() {
        let mut source = test_screen(20.0, 300.0, 40.0, 200.0, 150.0);
        source.label = "source".to_string();
        let mut out = test_screen(99.0, 0.0, 0.0, 1.0, 1.0);
        out.label = "out".to_string();
        attach_entity_binding(&mut source, Box::new("source"));
        attach_entity_binding(&mut out, Box::new("out"));
        let host = query(vec![source.clone()]);
        assert!(get_screen_by_id(
            &mut out,
            &mut create_screen_query_scratch(),
            &host,
            20.0
        ));
        assert_eq!(out, source);
        assert_eq!(get_entity_binding_as::<&str, _>(&out), Some(&"out"));
        assert_eq!(get_entity_binding_as::<&str, _>(&source), Some(&"source"));
    }

    #[test]
    fn matches_display_ids_beyond_f32_exact_range() {
        let host = query(vec![
            test_screen(2_528_732_444.0, 0.0, 0.0, 10.0, 10.0),
            test_screen(2_528_732_445.0, 20.0, 0.0, 10.0, 10.0),
        ]);
        let mut out = create_screen_info();
        assert!(get_screen_by_id(
            &mut out,
            &mut create_screen_query_scratch(),
            &host,
            2_528_732_445.0
        ));
        assert_eq!(out.x, 20.0);
    }
}

mod get_screen_change_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_screen_change_kind_string(ScreenChangeKind::ScreenAdded),
            "ScreenAdded"
        );
        assert_eq!(
            get_screen_change_kind_string(ScreenChangeKind::ScreenMetricsChanged),
            "ScreenMetricsChanged"
        );
        assert_eq!(
            get_screen_change_kind_string(ScreenChangeKind::ScreenRemoved),
            "ScreenRemoved"
        );
    }
}

mod get_screen_color_space_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_screen_color_space_string(ScreenColorSpace::DisplayP3),
            "display-p3"
        );
        assert_eq!(
            get_screen_color_space_string(ScreenColorSpace::Rec2020),
            "rec2020"
        );
        assert_eq!(
            get_screen_color_space_string(ScreenColorSpace::Srgb),
            "srgb"
        );
    }
}

mod get_screen_containing_rect {
    use super::*;

    #[test]
    fn selects_the_screen_with_the_largest_overlap_area() {
        let host = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, 100.0, 80.0, 100.0, 100.0),
        ]);
        assert_eq!(
            containing_rect(&host, create_rectangle(50.0, 50.0, 100.0, 60.0)),
            1.0
        );
    }

    #[test]
    fn falls_back_to_the_screen_nearest_the_rectangle_center_when_none_overlap() {
        assert_eq!(
            containing_rect(
                &query(separated_screens()),
                create_rectangle(230.0, 20.0, 20.0, 20.0)
            ),
            2.0
        );
    }

    #[test]
    fn fills_the_documented_default_when_no_screens_exist() {
        let mut out = test_screen(99.0, 10.0, 20.0, 30.0, 40.0);
        get_screen_containing_rect(
            &mut out,
            &mut create_screen_query_scratch(),
            &query(vec![]),
            &create_rectangle(0.0, 0.0, 10.0, 10.0),
        );
        assert_eq!(out, create_screen_info());
    }
}

mod get_screen_current_mode {
    use super::*;

    #[test]
    fn derives_current_dimensions_and_metrics_while_clearing_unknown_format() {
        let mut screen = test_screen(1.0, 0.0, 0.0, 1920.0, 1080.0);
        screen.refresh_rate = 144.0;
        screen.color_depth = 30.0;
        let mut out = create_screen_mode();
        out.pixel_format = "stale".to_string();
        get_screen_current_mode(&mut out, &screen);
        assert_eq!(
            (out.width, out.height, out.refresh_rate, out.color_depth),
            (1920.0, 1080.0, 144.0, 30.0)
        );
        assert_eq!(out.pixel_format, "");
    }
}

mod get_screen_cursor_position {
    use super::*;

    #[test]
    fn delegates_to_the_host_with_the_caller_owned_output() {
        let (host, _) = query_host(vec![], (-20.0, 45.0));
        let mut out = create_vector2(0.0, 0.0);
        get_screen_cursor_position(&mut out, &host);
        assert_eq!((out.x, out.y), (-20.0, 45.0));
    }
}

mod get_screen_cursor_screen {
    use super::*;

    #[test]
    fn resolves_the_host_cursor_position_to_its_nearest_screen() {
        let (host, _) = query_host(separated_screens(), (340.0, 25.0));
        let mut out = create_screen_info();
        get_screen_cursor_screen(&mut out, &mut create_screen_query_scratch(), &host);
        assert_eq!(out.id, 2.0);
    }
}

mod get_screen_detail_permission {
    use super::*;

    #[test]
    fn returns_the_permission_state_supplied_by_the_host() {
        let (host, calls) = details_host(Ok(ScreenPermissionState::Granted), Ok(true));
        assert_eq!(
            block_on(get_screen_detail_permission(&host)),
            Ok(ScreenPermissionState::Granted)
        );
        assert_eq!(calls.lock().unwrap().0, 1);
    }

    #[test]
    fn passes_a_provider_rejection_through_unchanged() {
        let error = FlightError {
            kind: FlightErrorKind::Error,
            message: "no window management".to_string(),
        };
        let (host, _) = details_host(Err(error.clone()), Ok(false));
        assert_eq!(block_on(get_screen_detail_permission(&host)), Err(error));
    }
}

mod get_screen_nearest_point {
    use super::*;

    #[test]
    fn uses_half_open_containment_before_distance() {
        let horizontal = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, 100.0, 0.0, 200.0, 100.0),
        ]);
        let vertical = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, 0.0, 100.0, 100.0, 200.0),
        ]);
        assert_eq!(nearest_point(&horizontal, 20.0, 30.0), 1.0);
        assert_eq!(nearest_point(&horizontal, 100.0, 30.0), 2.0);
        assert_eq!(nearest_point(&vertical, 30.0, 100.0), 2.0);
    }

    #[test]
    fn selects_the_nearest_screen_center_when_the_point_is_outside_every_screen() {
        let host = query(separated_screens());
        let diagonal = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, 300.0, 200.0, 100.0, 100.0),
        ]);
        assert_eq!(nearest_point(&host, 180.0, 50.0), 1.0);
        assert_eq!(nearest_point(&host, 240.0, 50.0), 2.0);
        assert_eq!(nearest_point(&diagonal, 200.0, 100.0), 1.0);
        assert_eq!(nearest_point(&diagonal, 200.0, 180.0), 2.0);
    }

    #[test]
    fn keeps_the_first_screen_when_center_distances_tie() {
        assert_eq!(nearest_point(&query(separated_screens()), 200.0, 50.0), 1.0);
    }

    #[test]
    fn fills_the_documented_default_when_no_screens_exist() {
        let mut out = test_screen(99.0, 10.0, 20.0, 30.0, 40.0);
        get_screen_nearest_point(
            &mut out,
            &mut create_screen_query_scratch(),
            &query(vec![]),
            &create_vector2(5.0, 5.0),
        );
        assert_eq!(out, create_screen_info());
    }
}

mod get_screen_nearest_rect {
    use super::*;

    #[test]
    fn prefers_a_screen_that_fully_contains_the_rectangle() {
        assert_eq!(
            nearest_rect(
                &query(separated_screens()),
                create_rectangle(320.0, 20.0, 40.0, 50.0)
            ),
            2.0
        );
    }

    #[test]
    fn falls_back_to_the_screen_nearest_the_rectangle_center() {
        assert_eq!(
            nearest_rect(
                &query(separated_screens()),
                create_rectangle(170.0, 20.0, 20.0, 20.0)
            ),
            1.0
        );
    }

    #[test]
    fn uses_center_selection_rather_than_largest_overlap_when_no_screen_fully_contains_the_rectangle()
     {
        let host = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, 100.0, 0.0, 200.0, 100.0),
        ]);
        let rect = create_rectangle(50.0, 10.0, 100.0, 50.0);
        assert_eq!(containing_rect(&host, rect.clone()), 1.0);
        assert_eq!(nearest_rect(&host, rect), 2.0);
    }

    #[test]
    fn honors_inclusive_rectangle_boundaries_and_full_extents_when_testing_containment() {
        let bounds = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 100.0),
            test_screen(2.0, -10.0, -10.0, 200.0, 200.0),
        ]);
        let horizontal = query(vec![
            test_screen(1.0, 0.0, 0.0, 80.0, 100.0),
            test_screen(2.0, 30.0, 0.0, 100.0, 100.0),
        ]);
        let vertical = query(vec![
            test_screen(1.0, 0.0, 0.0, 100.0, 80.0),
            test_screen(2.0, 0.0, 30.0, 100.0, 100.0),
        ]);
        assert_eq!(
            nearest_rect(&bounds, create_rectangle(0.0, 0.0, 100.0, 100.0)),
            1.0
        );
        assert_eq!(
            nearest_rect(&horizontal, create_rectangle(40.0, 0.0, 60.0, 100.0)),
            2.0
        );
        assert_eq!(
            nearest_rect(&vertical, create_rectangle(0.0, 40.0, 100.0, 60.0)),
            2.0
        );
    }

    #[test]
    fn fills_the_documented_default_when_no_screens_exist() {
        let mut out = test_screen(99.0, 10.0, 20.0, 30.0, 40.0);
        get_screen_nearest_rect(
            &mut out,
            &mut create_screen_query_scratch(),
            &query(vec![]),
            &create_rectangle(0.0, 0.0, 10.0, 10.0),
        );
        assert_eq!(out, create_screen_info());
    }
}

mod get_screen_orientation_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_screen_orientation_string(ScreenOrientation::Landscape),
            "Landscape"
        );
        assert_eq!(
            get_screen_orientation_string(ScreenOrientation::LandscapeFlipped),
            "LandscapeFlipped"
        );
        assert_eq!(
            get_screen_orientation_string(ScreenOrientation::Portrait),
            "Portrait"
        );
        assert_eq!(
            get_screen_orientation_string(ScreenOrientation::PortraitFlipped),
            "PortraitFlipped"
        );
    }
}

mod get_screen_permission_state_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_screen_permission_state_string(ScreenPermissionState::Denied),
            "denied"
        );
        assert_eq!(
            get_screen_permission_state_string(ScreenPermissionState::Granted),
            "granted"
        );
        assert_eq!(
            get_screen_permission_state_string(ScreenPermissionState::Prompt),
            "prompt"
        );
    }
}

mod get_screen_work_area {
    use super::*;

    #[test]
    fn extracts_work_dimensions_at_the_screen_desktop_origin() {
        let mut screen = test_screen(1.0, 100.0, -50.0, 1920.0, 1080.0);
        screen.work_width = 1900.0;
        screen.work_height = 1040.0;
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_screen_work_area(&mut out, &screen);
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (100.0, -50.0, 1900.0, 1040.0)
        );
    }
}

mod get_screens {
    use super::*;

    #[test]
    fn delegates_enumeration_into_the_caller_owned_array() {
        let screen = test_screen(5.0, 0.0, 0.0, 1920.0, 1080.0);
        let (host, calls) = query_host(vec![screen.clone()], (0.0, 0.0));
        let mut out: Vec<ScreenInfo> = Vec::new();
        get_screens(&mut out, &host);
        assert_eq!(out, vec![screen]);
        assert_eq!(
            *calls.lock().unwrap(),
            vec![&out as *const Vec<ScreenInfo> as usize]
        );
    }
}

mod initialize_screen_info {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_screen_info() {
        let mut out: ScreenInfo = flight_entity::allocate_entity();
        out.label = "x".to_string();
        initialize_screen_info(&mut out);
        assert_eq!(out, create_screen_info());
    }
}

mod initialize_screen_mode {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_screen_mode() {
        let mut out: ScreenMode = flight_entity::allocate_entity();
        initialize_screen_mode(&mut out);
        assert_eq!(out, create_screen_mode());
    }
}

mod initialize_screen_permission_change {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_screen_permission_change() {
        let mut out: ScreenPermissionChange = flight_entity::allocate_entity();
        initialize_screen_permission_change(&mut out);
        assert_eq!(
            format!("{out:?}"),
            format!("{:?}", create_screen_permission_change())
        );
    }
}

mod initialize_screen_query_scratch {
    use super::*;

    #[test]
    fn empties_the_scratch() {
        let mut scratch = create_screen_query_scratch();
        let mut out = create_screen_info();
        get_screen_by_id(&mut out, &mut scratch, &query(separated_screens()), 1.0);
        initialize_screen_query_scratch(&mut scratch);
        assert_eq!(
            format!("{scratch:?}"),
            format!("{:?}", create_screen_query_scratch())
        );
    }
}

mod initialize_screen_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_screen_signals() {
        let mut out: ScreenSignals = flight_entity::allocate_entity();
        initialize_screen_signals(&mut out);
        assert_eq!(format!("{out:?}"), format!("{:?}", create_screen_signals()));
    }
}

mod parse_screen_change_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_screen_change_kind("ScreenAdded"),
            Some(ScreenChangeKind::ScreenAdded)
        );
        assert_eq!(
            parse_screen_change_kind("ScreenMetricsChanged"),
            Some(ScreenChangeKind::ScreenMetricsChanged)
        );
        assert_eq!(
            parse_screen_change_kind("ScreenRemoved"),
            Some(ScreenChangeKind::ScreenRemoved)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_screen_change_kind("SCREENADDEDx"), None);
        assert_eq!(parse_screen_change_kind(""), None);
    }
}

mod parse_screen_color_space {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_screen_color_space("display-p3"),
            Some(ScreenColorSpace::DisplayP3)
        );
        assert_eq!(
            parse_screen_color_space("rec2020"),
            Some(ScreenColorSpace::Rec2020)
        );
        assert_eq!(
            parse_screen_color_space("srgb"),
            Some(ScreenColorSpace::Srgb)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_screen_color_space("DISPLAY-P3x"), None);
        assert_eq!(parse_screen_color_space(""), None);
    }
}

mod parse_screen_orientation {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_screen_orientation("Landscape"),
            Some(ScreenOrientation::Landscape)
        );
        assert_eq!(
            parse_screen_orientation("LandscapeFlipped"),
            Some(ScreenOrientation::LandscapeFlipped)
        );
        assert_eq!(
            parse_screen_orientation("Portrait"),
            Some(ScreenOrientation::Portrait)
        );
        assert_eq!(
            parse_screen_orientation("PortraitFlipped"),
            Some(ScreenOrientation::PortraitFlipped)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_screen_orientation("LANDSCAPEx"), None);
        assert_eq!(parse_screen_orientation(""), None);
    }
}

mod parse_screen_permission_state {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_screen_permission_state("denied"),
            Some(ScreenPermissionState::Denied)
        );
        assert_eq!(
            parse_screen_permission_state("granted"),
            Some(ScreenPermissionState::Granted)
        );
        assert_eq!(
            parse_screen_permission_state("prompt"),
            Some(ScreenPermissionState::Prompt)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_screen_permission_state("DENIEDx"), None);
        assert_eq!(parse_screen_permission_state(""), None);
    }
}

mod request_screen_details {
    use super::*;

    #[test]
    fn returns_whether_the_host_granted_detailed_screen_access() {
        let (host, calls) = details_host(Ok(ScreenPermissionState::Prompt), Ok(true));
        assert_eq!(block_on(request_screen_details(&host)), Ok(true));
        assert_eq!(calls.lock().unwrap().1, 1);
    }
}

mod screen_to_dip_point {
    use super::*;

    #[test]
    fn converts_screen_local_pixels_to_desktop_dips() {
        let mut out = create_vector2(-1.0, -1.0);
        screen_to_dip_point(&mut out, &scaled_screen(), &create_vector2(24.0, 46.0));
        assert_eq!((out.x, out.y), (112.0, 73.0));
    }

    #[test]
    fn converts_in_place_like_the_aliased_source_call() {
        let mut point = create_vector2(24.0, 46.0);
        let input = point.clone();
        screen_to_dip_point(&mut point, &scaled_screen(), &input);
        assert_eq!((point.x, point.y), (112.0, 73.0));
    }
}

mod screen_to_dip_rect {
    use super::*;

    #[test]
    fn converts_screen_local_position_and_extent_to_desktop_dips() {
        let mut out = create_rectangle(-1.0, -1.0, -1.0, -1.0);
        screen_to_dip_rect(
            &mut out,
            &scaled_screen(),
            &create_rectangle(24.0, 46.0, 60.0, 80.0),
        );
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (112.0, 73.0, 30.0, 40.0)
        );
    }

    #[test]
    fn converts_in_place_like_the_aliased_source_call() {
        let mut rect = create_rectangle(24.0, 46.0, 60.0, 80.0);
        let input = rect.clone();
        screen_to_dip_rect(&mut rect, &scaled_screen(), &input);
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (112.0, 73.0, 30.0, 40.0)
        );
    }
}
