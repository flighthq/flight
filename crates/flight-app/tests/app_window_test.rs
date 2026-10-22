use std::future::ready;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use flight_app::contract::*;
use flight_entity::{Entity, FlightError, FlightErrorKind, Ref, allocate_entity};
use flight_geometry::Matrix;
use flight_host::NativeWindowHandle;
use flight_input::{
    HostInputTargetCapability, InputPointerLockExitFuture, InputPointerLockExitOutcome,
    InputPointerLockExitReason, InputPointerLockRequestFuture, InputPointerLockRequestOutcome,
    InputPointerLockRequestReason, InputTargetHandle,
};
use flight_signals::{cancel_signal, connect_signal};

use crate::block_on;
use crate::window_fixture::*;

fn handle(id: i32) -> NativeWindowHandle {
    return NativeWindowHandle {
        provider: Arc::new(()),
        handle: Arc::new(id),
    };
}

fn on_close(w: &AppWindow) -> &flight_signals::Signal<()> {
    return &w.on_close;
}

fn on_fullscreen_changed(w: &AppWindow) -> &flight_signals::Signal<()> {
    return &w.on_fullscreen_changed;
}

fn on_close_request(w: &AppWindow) -> &flight_signals::Signal<()> {
    return &w.on_close_request;
}

fn veto(win: &Ref<AppWindow>) {
    let request = signal(win, on_close_request);
    let cancel = request.clone();
    connect_signal(
        &request,
        Arc::new(move |_value: &()| cancel_signal(&cancel)),
        None,
    );
}

fn pointer_lock_state() -> Ref<AppPointerLockState> {
    return Arc::new(std::sync::RwLock::new(create_app_pointer_lock_state()));
}

fn exit_reason(reason: InputPointerLockExitReason) -> InputPointerLockExitOutcome {
    return InputPointerLockExitOutcome { reason };
}

fn panic_flight_error(message: &str) -> ! {
    std::panic::panic_any(FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    })
}

mod attach_window {
    use super::*;

    #[test]
    fn attaches_an_existing_handle_without_creating_an_app_loop_and_preserves_identity() {
        let backend = window_backend();
        let seen: Arc<Mutex<Vec<(usize, NativeWindowHandle)>>> = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let mut attach = backend.attach();
        attach.attach = Arc::new(
            move |win: &Ref<AppWindow>,
                  handle: &NativeWindowHandle,
                  _ownership: WindowAttachmentOwnership| {
                keep.lock()
                    .unwrap()
                    .push((Arc::as_ptr(win) as usize, handle.clone()));
                return true;
            },
        );
        let win = create_app_window();
        let native = handle(41);
        assert!(attach_window(
            &attach,
            &backend.lifecycle(),
            &win,
            &native,
            WindowAttachmentOwnership::Host
        ));
        let seen = seen.lock().unwrap();
        assert_eq!(seen[0].0, Arc::as_ptr(&win) as usize);
        assert!(Arc::ptr_eq(&seen[0].1.handle, &native.handle));
    }

    #[test]
    fn uses_one_explicit_host_for_two_independently_attached_windows() {
        let backend = window_backend();
        let attached = Arc::new(Mutex::new(Vec::new()));
        let closed = Arc::new(Mutex::new(Vec::new()));
        let (a, c) = (attached.clone(), closed.clone());
        let mut attach = backend.attach();
        attach.attach = Arc::new(
            move |win: &Ref<AppWindow>,
                  _handle: &NativeWindowHandle,
                  _ownership: WindowAttachmentOwnership| {
                a.lock().unwrap().push(Arc::as_ptr(win) as usize);
                return true;
            },
        );
        let mut lifecycle = backend.lifecycle();
        lifecycle.close =
            Arc::new(move |win: &Ref<AppWindow>| c.lock().unwrap().push(Arc::as_ptr(win) as usize));
        let (first, second) = (create_app_window(), create_app_window());
        assert!(attach_window(
            &attach,
            &lifecycle,
            &first,
            &handle(1),
            WindowAttachmentOwnership::Host
        ));
        assert!(attach_window(
            &attach,
            &lifecycle,
            &second,
            &handle(2),
            WindowAttachmentOwnership::Flight
        ));
        assert_eq!(
            *attached.lock().unwrap(),
            vec![Arc::as_ptr(&first) as usize, Arc::as_ptr(&second) as usize]
        );
        assert!(close_window(&lifecycle, &first));
        assert!(close_window(&lifecycle, &first));
        assert_eq!(*closed.lock().unwrap(), vec![Arc::as_ptr(&first) as usize]);
    }

    #[test]
    fn emits_one_terminal_close_when_a_synchronous_native_callback_and_close_window_converge() {
        let backend = window_backend();
        let fullscreen = fullscreen_backend();
        let mut lifecycle = backend.lifecycle();
        lifecycle.close = Arc::new(|win: &Ref<AppWindow>| notify_window_closed(win));
        let win = create_app_window();
        let closed = count(&win, on_close);
        let forwarded = count(&win, on_fullscreen_changed);
        assert!(attach_window(
            &backend.attach(),
            &lifecycle,
            &win,
            &handle(1),
            WindowAttachmentOwnership::Flight
        ));
        attach_window_fullscreen(&fullscreen.capability, &win);
        assert!(close_window(&lifecycle, &win));
        notify_window_closed(&win);
        fullscreen.emit(true);
        assert_eq!(hits(&closed), 1);
        assert_eq!(hits(&forwarded), 0);
    }

    #[test]
    fn clears_terminal_state_after_the_same_window_successfully_reattaches() {
        let backend = window_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        let lifecycle = backend.lifecycle();
        assert!(attach_window(
            &backend.attach(),
            &lifecycle,
            &win,
            &handle(1),
            WindowAttachmentOwnership::Host
        ));
        assert!(close_window(&lifecycle, &win));
        assert!(attach_window(
            &backend.attach(),
            &lifecycle,
            &win,
            &handle(1),
            WindowAttachmentOwnership::Host
        ));
        assert!(close_window(&lifecycle, &win));
        assert_eq!(hits(&closed), 2);
    }

    #[test]
    fn pins_close_to_the_host_that_attached_the_window() {
        let (origin, active) = (window_backend(), window_backend());
        let win = create_app_window();
        assert!(attach_window(
            &origin.attach(),
            &origin.lifecycle(),
            &win,
            &handle(1),
            WindowAttachmentOwnership::Host
        ));
        assert!(close_window(&active.lifecycle(), &win));
        assert_eq!(origin.calls(), vec!["attach:host", "close"]);
        assert!(active.calls().is_empty());
    }

    #[test]
    fn leaves_the_lifecycle_unchanged_when_the_host_declines() {
        let (origin, active) = (window_backend(), window_backend());
        let mut attach = origin.attach();
        attach.attach = Arc::new(
            |_win: &Ref<AppWindow>,
             _handle: &NativeWindowHandle,
             _ownership: WindowAttachmentOwnership| false,
        );
        let win = create_app_window();
        assert!(!attach_window(
            &attach,
            &origin.lifecycle(),
            &win,
            &handle(1),
            WindowAttachmentOwnership::Host
        ));
        assert!(close_window(&active.lifecycle(), &win));
        assert_eq!(active.calls(), vec!["close"]);
        assert!(origin.calls().is_empty());
    }
}

mod attach_window_close {
    use super::*;

    #[test]
    fn emits_on_close_when_the_host_reports_a_terminal_close() {
        let backend = window_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        attach_window_close(&backend.lifecycle(), &win);
        backend.emit_closed();
        assert_eq!(hits(&closed), 1);
    }

    #[test]
    fn emits_on_close_request_and_reports_whether_it_was_cancelled_to_the_host() {
        let backend = window_backend();
        let win = create_app_window();
        let requested = count(&win, on_close_request);
        veto(&win);
        attach_window_close(&backend.lifecycle(), &win);
        assert!(backend.emit_close_request());
        assert_eq!(hits(&requested), 1);
    }

    #[test]
    fn throws_a_type_error_when_the_host_has_no_close_subscription() {
        let backend = window_backend();
        let mut lifecycle = backend.lifecycle();
        lifecycle.subscribe_close = None;
        let raised = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            attach_window_close(&lifecycle, &create_app_window())
        }));
        assert_eq!(
            raised.unwrap_err().downcast::<FlightError>().unwrap().kind,
            FlightErrorKind::TypeError
        );
    }
}

mod attach_window_drop_file {
    use super::*;

    #[test]
    fn forwards_host_emitted_paths_to_on_drop_file() {
        let backend = drop_file_backend();
        let win = create_app_window();
        let received = Arc::new(Mutex::new(None));
        let keep = received.clone();
        connect_signal(
            &win.read().unwrap().on_drop_file.clone(),
            Arc::new(move |path: &String| *keep.lock().unwrap() = Some(path.clone())),
            None,
        );
        attach_window_drop_file(&backend.capability, &win, &target());
        backend.emit("test.png");
        assert_eq!(*received.lock().unwrap(), Some("test.png".to_string()));
    }

    #[test]
    fn releases_the_origin_provider_before_attaching_a_replacement_provider() {
        let (origin, replacement) = (drop_file_backend(), drop_file_backend());
        let win = create_app_window();
        let handle = target();
        attach_window_drop_file(&origin.capability, &win, &handle);
        attach_window_drop_file(&replacement.capability, &win, &handle);
        detach_window_drop_file(&win);
        assert_eq!(calls_of(&origin.calls), vec!["subscribe", "release"]);
        assert_eq!(calls_of(&replacement.calls), vec!["subscribe", "release"]);
    }
}

mod attach_window_focus {
    use super::*;

    #[test]
    fn emits_on_focus_in_from_host_focus_ingress() {
        let backend = focus_backend();
        let win = create_app_window();
        let focused = count(&win, |w| &w.on_focus_in);
        attach_window_focus(&backend.capability, &win, &target());
        backend.emit_focus();
        assert_eq!(hits(&focused), 1);
    }

    #[test]
    fn emits_on_focus_out_from_host_blur_ingress() {
        let backend = focus_backend();
        let win = create_app_window();
        let blurred = count(&win, |w| &w.on_focus_out);
        attach_window_focus(&backend.capability, &win, &target());
        backend.emit_blur();
        assert_eq!(hits(&blurred), 1);
    }

    #[test]
    fn releases_the_origin_provider_before_attaching_a_replacement_provider() {
        let (origin, replacement) = (focus_backend(), focus_backend());
        let win = create_app_window();
        let handle = target();
        attach_window_focus(&origin.capability, &win, &handle);
        attach_window_focus(&replacement.capability, &win, &handle);
        detach_window_focus(&win);
        assert_eq!(calls_of(&origin.calls), vec!["subscribe", "release"]);
        assert_eq!(calls_of(&replacement.calls), vec!["subscribe", "release"]);
    }
}

mod attach_window_fullscreen {
    use super::*;

    #[test]
    fn mirrors_subscribed_fullscreen_state_and_emits_on_fullscreen_changed() {
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        let changed = count(&win, on_fullscreen_changed);
        attach_window_fullscreen(&fullscreen.capability, &win);
        fullscreen.emit(true);
        assert!(win.read().unwrap().fullscreen);
        assert_eq!(hits(&changed), 1);
        assert_eq!(fullscreen.calls(), vec!["subscribe"]);
    }
}

mod attach_window_move {
    use super::*;

    #[test]
    fn emits_on_move_and_updates_position_when_the_host_position_changes() {
        let backend = window_backend();
        let win = create_app_window();
        let moved = count(&win, |w| &w.on_move);
        attach_window_move(&backend.geometry(), &win);
        backend.emit_move(100.0, 200.0);
        assert_eq!(hits(&moved), 1);
        assert_eq!(
            (win.read().unwrap().x, win.read().unwrap().y),
            (100.0, 200.0)
        );
    }

    #[test]
    fn does_not_emit_on_move_when_position_has_not_changed() {
        let backend = window_backend();
        let win = create_app_window();
        {
            let mut guard = win.write().unwrap();
            guard.x = 50.0;
            guard.y = 50.0;
        }
        let moved = count(&win, |w| &w.on_move);
        attach_window_move(&backend.geometry(), &win);
        backend.emit_move(50.0, 50.0);
        assert_eq!(hits(&moved), 0);
    }
}

mod attach_window_orientation {
    use super::*;

    #[test]
    fn emits_on_orientation_changed_on_change() {
        let screen = screen_backend();
        let win = create_app_window();
        let changed = count(&win, |w| &w.on_orientation_changed);
        attach_window_orientation(&screen.capability, &win);
        screen.emit_orientation();
        assert_eq!(hits(&changed), 1);
    }
}

mod attach_window_resize {
    use super::*;

    #[test]
    fn emits_on_resize_and_updates_dimensions() {
        let backend = window_backend();
        let win = create_app_window();
        let resized = count(&win, |w| &w.on_resize);
        attach_window_resize(&backend.geometry(), &win, &resize_target());
        backend.emit_resize(1280.0, 720.0, 2.0);
        assert_eq!(hits(&resized), 1);
        let guard = win.read().unwrap();
        assert_eq!(
            (guard.width, guard.height, guard.device_pixel_ratio),
            (1280.0, 720.0, 2.0)
        );
    }

    #[test]
    fn replaces_a_previous_observer_when_called_again() {
        let backend = window_backend();
        let win = create_app_window();
        let resized = count(&win, |w| &w.on_resize);
        attach_window_resize(&backend.geometry(), &win, &resize_target());
        attach_window_resize(&backend.geometry(), &win, &resize_target());
        backend.emit_resize(320.0, 240.0, 1.0);
        assert_eq!(hits(&resized), 1);
        assert_eq!(
            (win.read().unwrap().width, win.read().unwrap().height),
            (320.0, 240.0)
        );
    }
}

mod attach_window_visibility {
    use super::*;

    #[test]
    fn emits_on_deactivate_when_page_is_hidden() {
        let backend = window_backend();
        let win = create_app_window();
        let deactivated = count(&win, |w| &w.on_deactivate);
        attach_window_visibility(&backend.visibility(), &win);
        backend.emit_visibility(false);
        assert_eq!(hits(&deactivated), 1);
    }

    #[test]
    fn emits_on_activate_when_page_becomes_visible() {
        let backend = window_backend();
        let win = create_app_window();
        let activated = count(&win, |w| &w.on_activate);
        attach_window_visibility(&backend.visibility(), &win);
        backend.emit_visibility(true);
        assert_eq!(hits(&activated), 1);
    }
}

mod center_window {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        center_window(&backend.geometry(), &create_app_window());
        assert!(backend.calls().contains(&"center".to_string()));
    }
}

mod close_window {
    use super::*;

    #[test]
    fn closes_and_emits_on_close_when_not_vetoed() {
        let backend = window_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        assert!(close_window(&backend.lifecycle(), &win));
        assert!(backend.calls().contains(&"close".to_string()));
        assert_eq!(hits(&closed), 1);
    }

    #[test]
    fn aborts_and_returns_false_when_a_listener_vetoes() {
        let backend = window_backend();
        let win = create_app_window();
        veto(&win);
        assert!(!close_window(&backend.lifecycle(), &win));
        assert!(!backend.calls().contains(&"close".to_string()));
    }

    #[test]
    fn closes_terminal_state_once_when_called_repeatedly() {
        let backend = window_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        assert!(close_window(&backend.lifecycle(), &win));
        assert!(close_window(&backend.lifecycle(), &win));
        assert_eq!(hits(&closed), 1);
        assert_eq!(backend.calls(), vec!["close"]);
    }
}

mod compute_window_device_transform {
    use super::*;

    #[test]
    fn writes_a_uniform_device_pixel_ratio_scale_into_out() {
        let win = create_app_window();
        win.write().unwrap().device_pixel_ratio = 3.0;
        let mut out: Matrix = allocate_entity();
        out.tx = 9.0;
        out.ty = 9.0;
        compute_window_device_transform(&mut out, &win);
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (3.0, 0.0, 0.0, 3.0, 0.0, 0.0)
        );
    }

    #[test]
    fn overwrites_every_field_when_out_already_carries_stale_values() {
        let win = create_app_window();
        win.write().unwrap().device_pixel_ratio = 2.0;
        let mut out: Matrix = allocate_entity();
        out.a = 99.0;
        out.b = 99.0;
        out.c = 99.0;
        out.d = 99.0;
        out.tx = 99.0;
        out.ty = 99.0;
        compute_window_device_transform(&mut out, &win);
        assert_eq!(
            (out.a, out.b, out.c, out.d, out.tx, out.ty),
            (2.0, 0.0, 0.0, 2.0, 0.0, 0.0)
        );
    }
}

mod create_app_pointer_lock_state {
    use super::*;

    #[test]
    fn starts_with_no_provider_pinned() {
        // With nothing pinned, exit uses the supplied provider.
        let (lock, calls) = pointer_lock_backend();
        let state = Arc::new(std::sync::RwLock::new(create_app_pointer_lock_state()));
        block_on(exit_app_input_pointer_lock(&state, &lock));
        assert_eq!(calls_of(&calls), vec!["exit"]);
    }
}

mod create_app_window {
    use super::*;

    #[test]
    fn returns_all_signals_with_no_side_effects() {
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        let _: &dyn Entity = &*win.read().unwrap();
        let changed = count(&win, on_fullscreen_changed);
        fullscreen.emit(true);
        assert_eq!(hits(&changed), 0);
        let guard = win.read().unwrap();
        let handles = [
            Arc::as_ptr(&guard.on_activate.data) as usize,
            Arc::as_ptr(&guard.on_close.data) as usize,
            Arc::as_ptr(&guard.on_close_request.data) as usize,
            Arc::as_ptr(&guard.on_deactivate.data) as usize,
            Arc::as_ptr(&guard.on_drop_file.data) as usize,
            Arc::as_ptr(&guard.on_focus_in.data) as usize,
            Arc::as_ptr(&guard.on_focus_out.data) as usize,
            Arc::as_ptr(&guard.on_fullscreen_changed.data) as usize,
            Arc::as_ptr(&guard.on_maximize.data) as usize,
            Arc::as_ptr(&guard.on_minimize.data) as usize,
            Arc::as_ptr(&guard.on_move.data) as usize,
            Arc::as_ptr(&guard.on_orientation_changed.data) as usize,
            Arc::as_ptr(&guard.on_render_context_lost.data) as usize,
            Arc::as_ptr(&guard.on_render_context_restored.data) as usize,
            Arc::as_ptr(&guard.on_resize.data) as usize,
            Arc::as_ptr(&guard.on_restore.data) as usize,
        ];
        for (index, handle) in handles.iter().enumerate() {
            assert!(!handles[index + 1..].contains(handle));
        }
    }

    #[test]
    fn initializes_dimensions_and_device_pixel_ratio_to_defaults() {
        let win = create_app_window();
        let guard = win.read().unwrap();
        assert_eq!(
            (guard.width, guard.height, guard.device_pixel_ratio),
            (0.0, 0.0, 1.0)
        );
        assert_eq!(
            (guard.max_width, guard.max_height, guard.opacity),
            (-1.0, -1.0, 1.0)
        );
        assert!(guard.visible && guard.resizable);
    }
}

mod detach_window_close {
    use super::*;

    #[test]
    fn stops_emitting_on_close_after_detach() {
        let backend = window_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        attach_window_close(&backend.lifecycle(), &win);
        detach_window_close(&win);
        backend.emit_closed();
        assert_eq!(hits(&closed), 0);
    }
}

mod detach_window_drop_file {
    use super::*;

    #[test]
    fn releases_the_host_subscription() {
        let backend = drop_file_backend();
        let win = create_app_window();
        let dropped = Arc::new(AtomicUsize::new(0));
        let tally = dropped.clone();
        connect_signal(
            &win.read().unwrap().on_drop_file.clone(),
            Arc::new(move |_path: &String| {
                tally.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        attach_window_drop_file(&backend.capability, &win, &target());
        detach_window_drop_file(&win);
        backend.emit("ignored.txt");
        assert_eq!(hits(&dropped), 0);
        assert_eq!(calls_of(&backend.calls), vec!["subscribe", "release"]);
    }
}

mod detach_window_focus {
    use super::*;

    #[test]
    fn releases_both_host_event_paths() {
        let backend = focus_backend();
        let win = create_app_window();
        let focused = count(&win, |w| &w.on_focus_in);
        attach_window_focus(&backend.capability, &win, &target());
        detach_window_focus(&win);
        backend.emit_focus();
        assert_eq!(hits(&focused), 0);
        assert_eq!(calls_of(&backend.calls), vec!["subscribe", "release"]);
    }
}

mod detach_window_fullscreen {
    use super::*;

    #[test]
    fn removes_the_listener() {
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        let changed = count(&win, on_fullscreen_changed);
        attach_window_fullscreen(&fullscreen.capability, &win);
        detach_window_fullscreen(&win);
        fullscreen.emit(true);
        assert_eq!(hits(&changed), 0);
        assert_eq!(fullscreen.calls(), vec!["subscribe", "release"]);
    }
}

mod detach_window_move {
    use super::*;

    #[test]
    fn removes_the_listener_so_on_move_no_longer_fires() {
        let backend = window_backend();
        let win = create_app_window();
        let moved = count(&win, |w| &w.on_move);
        attach_window_move(&backend.geometry(), &win);
        detach_window_move(&win);
        backend.emit_move(100.0, 100.0);
        assert_eq!(hits(&moved), 0);
    }
}

mod detach_window_orientation {
    use super::*;

    #[test]
    fn removes_the_listener() {
        let screen = screen_backend();
        let win = create_app_window();
        let changed = count(&win, |w| &w.on_orientation_changed);
        attach_window_orientation(&screen.capability, &win);
        detach_window_orientation(&win);
        screen.emit_orientation();
        assert_eq!(hits(&changed), 0);
    }
}

mod detach_window_resize {
    use super::*;

    #[test]
    fn disconnects_the_observer() {
        let backend = window_backend();
        let win = create_app_window();
        attach_window_resize(&backend.geometry(), &win, &resize_target());
        detach_window_resize(&win);
        backend.emit_resize(640.0, 480.0, 2.0);
        assert_eq!(
            (win.read().unwrap().width, win.read().unwrap().height),
            (0.0, 0.0)
        );
    }
}

mod detach_window_visibility {
    use super::*;

    #[test]
    fn removes_the_listener() {
        let backend = window_backend();
        let win = create_app_window();
        let deactivated = count(&win, |w| &w.on_deactivate);
        attach_window_visibility(&backend.visibility(), &win);
        detach_window_visibility(&win);
        backend.emit_visibility(false);
        assert_eq!(hits(&deactivated), 0);
    }
}

mod dispose_app_window {
    use super::*;

    #[test]
    fn runs_all_teardown_so_attached_observers_stop_firing() {
        let backend = window_backend();
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        attach_window_resize(&backend.geometry(), &win, &resize_target());
        attach_window_fullscreen(&fullscreen.capability, &win);
        dispose_app_window(&win);
        backend.emit_resize(640.0, 480.0, 2.0);
        assert_eq!(win.read().unwrap().width, 0.0);
        let changed = count(&win, on_fullscreen_changed);
        fullscreen.emit(true);
        assert_eq!(hits(&changed), 0);
        assert_eq!(fullscreen.calls(), vec!["subscribe", "release"]);
    }
}

mod exit_app_input_pointer_lock {
    use super::*;

    fn flaky_exit(
        calls: &Calls,
        first: Option<InputPointerLockExitReason>,
    ) -> Arc<dyn Fn() -> InputPointerLockExitFuture + Send + Sync> {
        let (calls, attempts) = (calls.clone(), Arc::new(AtomicUsize::new(0)));
        return Arc::new(move || {
            let attempt = attempts.fetch_add(1, Ordering::SeqCst) + 1;
            calls.lock().unwrap().push(format!("exit:{}", attempt));
            let outcome: InputPointerLockExitFuture = Box::pin(async move {
                if attempt == 1 {
                    match first {
                        Some(reason) => return exit_reason(reason),
                        None => panic_flight_error("busy"),
                    }
                }
                return exit_reason(InputPointerLockExitReason::Ok);
            });
            return outcome;
        });
    }

    #[test]
    fn delegates_to_the_input_pointer_lock_command_capability() {
        let (lock, calls) = pointer_lock_backend();
        let state = pointer_lock_state();
        assert_eq!(
            block_on(exit_app_input_pointer_lock(&state, &lock)).reason,
            InputPointerLockExitReason::Ok
        );
        assert_eq!(calls_of(&calls), vec!["exit"]);
    }

    #[test]
    fn retains_the_request_origin_after_an_expected_failure_so_exit_can_be_retried() {
        for reason in [
            InputPointerLockExitReason::ApiUnavailable,
            InputPointerLockExitReason::OperationFailed,
        ] {
            let (mut origin, origin_calls) = pointer_lock_backend();
            let (active, active_calls) = pointer_lock_backend();
            origin.exit = flaky_exit(&origin_calls, Some(reason));
            let state = pointer_lock_state();
            block_on(lock_app_input_pointer(&state, &origin, &target()));
            assert_eq!(
                block_on(exit_app_input_pointer_lock(&state, &active)).reason,
                reason
            );
            assert_eq!(
                block_on(exit_app_input_pointer_lock(&state, &active)).reason,
                InputPointerLockExitReason::Ok
            );
            assert_eq!(calls_of(&origin_calls), vec!["request", "exit:1", "exit:2"]);
            assert!(calls_of(&active_calls).is_empty());
        }
    }

    #[test]
    fn keeps_backend_defects_visible_and_retains_the_origin_for_retry() {
        let (mut origin, origin_calls) = pointer_lock_backend();
        let (active, active_calls) = pointer_lock_backend();
        origin.exit = flaky_exit(&origin_calls, None);
        let state = pointer_lock_state();
        block_on(lock_app_input_pointer(&state, &origin, &target()));
        let raised = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            block_on(exit_app_input_pointer_lock(&state, &active))
        }));
        assert_eq!(
            raised
                .unwrap_err()
                .downcast::<FlightError>()
                .unwrap()
                .message,
            "busy"
        );
        assert_eq!(
            block_on(exit_app_input_pointer_lock(&state, &active)).reason,
            InputPointerLockExitReason::Ok
        );
        assert_eq!(calls_of(&origin_calls), vec!["request", "exit:1", "exit:2"]);
        assert!(calls_of(&active_calls).is_empty());
    }
}

mod exit_app_window_fullscreen {
    use super::*;

    #[test]
    fn delegates_to_the_fullscreen_capability() {
        let fullscreen = fullscreen_backend();
        assert_eq!(
            block_on(exit_app_window_fullscreen(&fullscreen.capability)).unwrap(),
            true
        );
        assert_eq!(fullscreen.calls(), vec!["exit"]);
    }
}

mod flash_window_frame {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        flash_window_frame(&backend.attention(), &create_app_window());
        assert!(backend.calls().contains(&"flashWindowFrame".to_string()));
    }
}

mod focus_window {
    use super::*;

    #[test]
    fn marks_focused_and_delegates_to_the_backend() {
        let backend = window_backend();
        let win = create_app_window();
        focus_window(&backend.focus(), &win);
        assert!(win.read().unwrap().focused);
        assert!(backend.calls().contains(&"focus".to_string()));
    }
}

mod get_window_bounds {
    use super::*;

    #[test]
    fn fills_the_out_bounds_from_the_backend() {
        let backend = window_backend();
        let mut out = WindowBounds {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        get_window_bounds(&mut out, &backend.geometry(), &create_app_window());
        assert_eq!(out.width, 3.0);
        assert_eq!(backend.calls(), vec!["getBounds"]);
    }
}

mod hide_window {
    use super::*;

    #[test]
    fn marks_not_visible_and_delegates_to_the_backend() {
        let backend = window_backend();
        let win = create_app_window();
        hide_window(&backend.visibility(), &win);
        assert!(!win.read().unwrap().visible);
        assert!(backend.calls().contains(&"hide".to_string()));
        hide_window(&backend.visibility(), &win);
        assert_eq!(backend.calls(), vec!["hide"]);
    }
}

mod initialize_app_window {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_app_window() {
        let mut out: AppWindow = allocate_entity();
        out.title = "stale".to_string();
        out.visible = false;
        initialize_app_window(&mut out);
        assert_eq!(out.title, "");
        assert!(out.visible);
    }
}

mod lock_app_input_pointer {
    use super::*;

    fn declined(
        calls: &Calls,
        reason: InputPointerLockRequestReason,
    ) -> Arc<dyn Fn(&InputTargetHandle) -> InputPointerLockRequestFuture + Send + Sync> {
        let calls = calls.clone();
        return Arc::new(move |_target: &InputTargetHandle| {
            calls.lock().unwrap().push(format!("request:{:?}", reason));
            let outcome: InputPointerLockRequestFuture =
                Box::pin(ready(InputPointerLockRequestOutcome { reason }));
            return outcome;
        });
    }

    #[test]
    fn passes_the_opaque_target_to_the_pointer_lock_command_capability() {
        let (lock, calls) = pointer_lock_backend();
        let state = pointer_lock_state();
        assert_eq!(
            block_on(lock_app_input_pointer(&state, &lock, &target())).reason,
            InputPointerLockRequestReason::Ok
        );
        assert_eq!(calls_of(&calls), vec!["request"]);
        block_on(exit_app_input_pointer_lock(&state, &lock));
    }

    #[test]
    fn exits_through_the_successful_request_origin_after_a_different_host_becomes_active() {
        let (origin, origin_calls) = pointer_lock_backend();
        let (active, active_calls) = pointer_lock_backend();
        let state = pointer_lock_state();
        block_on(lock_app_input_pointer(&state, &origin, &target()));
        block_on(exit_app_input_pointer_lock(&state, &active));
        assert_eq!(calls_of(&origin_calls), vec!["request", "exit"]);
        assert!(calls_of(&active_calls).is_empty());
    }

    #[test]
    fn does_not_replace_a_successful_origin_after_a_declined_request() {
        for reason in [
            InputPointerLockRequestReason::ApiUnavailable,
            InputPointerLockRequestReason::Denied,
            InputPointerLockRequestReason::OperationFailed,
            InputPointerLockRequestReason::TargetNotFound,
        ] {
            let (origin, origin_calls) = pointer_lock_backend();
            let (mut refused, refused_calls) = pointer_lock_backend();
            let (active, active_calls) = pointer_lock_backend();
            refused.request = declined(&refused_calls, reason);
            let state = pointer_lock_state();
            block_on(lock_app_input_pointer(&state, &origin, &target()));
            assert_eq!(
                block_on(lock_app_input_pointer(&state, &refused, &target())).reason,
                reason
            );
            block_on(exit_app_input_pointer_lock(&state, &active));
            assert_eq!(calls_of(&origin_calls), vec!["request", "exit"]);
            assert_eq!(
                calls_of(&refused_calls),
                vec![format!("request:{:?}", reason)]
            );
            assert!(calls_of(&active_calls).is_empty());
        }
    }

    #[test]
    fn keeps_backend_defects_visible_without_replacing_a_successful_origin() {
        let (origin, origin_calls) = pointer_lock_backend();
        let (mut rejected, rejected_calls) = pointer_lock_backend();
        let (active, active_calls) = pointer_lock_backend();
        let log = rejected_calls.clone();
        rejected.request = Arc::new(move |_target: &InputTargetHandle| {
            log.lock().unwrap().push("request:rejected".to_string());
            let outcome: InputPointerLockRequestFuture =
                Box::pin(async { panic_flight_error("defect") });
            return outcome;
        });
        let state = pointer_lock_state();
        block_on(lock_app_input_pointer(&state, &origin, &target()));
        let raised = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            block_on(lock_app_input_pointer(&state, &rejected, &target()))
        }));
        assert_eq!(
            raised
                .unwrap_err()
                .downcast::<FlightError>()
                .unwrap()
                .message,
            "defect"
        );
        block_on(exit_app_input_pointer_lock(&state, &active));
        assert_eq!(calls_of(&origin_calls), vec!["request", "exit"]);
        assert_eq!(calls_of(&rejected_calls), vec!["request:rejected"]);
        assert!(calls_of(&active_calls).is_empty());
    }

    #[test]
    fn replaces_the_request_origin_only_after_a_later_success() {
        let (origin, origin_calls) = pointer_lock_backend();
        let (replacement, replacement_calls) = pointer_lock_backend();
        let (active, active_calls) = pointer_lock_backend();
        let state = pointer_lock_state();
        block_on(lock_app_input_pointer(&state, &origin, &target()));
        block_on(lock_app_input_pointer(&state, &replacement, &target()));
        block_on(exit_app_input_pointer_lock(&state, &active));
        assert_eq!(calls_of(&origin_calls), vec!["request"]);
        assert_eq!(calls_of(&replacement_calls), vec!["request", "exit"]);
        assert!(calls_of(&active_calls).is_empty());
    }
}

mod maximize_window {
    use super::*;

    #[test]
    fn sets_maximized_and_emits_on_maximize_once() {
        let backend = window_backend();
        let win = create_app_window();
        let maximized = count(&win, |w| &w.on_maximize);
        maximize_window(&backend.state(), &win);
        maximize_window(&backend.state(), &win);
        assert!(win.read().unwrap().maximized);
        assert_eq!(hits(&maximized), 1);
        assert!(backend.calls().contains(&"maximize".to_string()));
    }
}

mod minimize_window {
    use super::*;

    #[test]
    fn sets_minimized_and_emits_on_minimize() {
        let backend = window_backend();
        let win = create_app_window();
        let minimized = count(&win, |w| &w.on_minimize);
        minimize_window(&backend.state(), &win);
        assert!(win.read().unwrap().minimized);
        assert_eq!(hits(&minimized), 1);
    }
}

mod notify_window_closed {
    use super::*;

    #[test]
    fn emits_once_before_draining_application_observers_then_remains_idempotent() {
        let fullscreen = Arc::new(fullscreen_backend());
        let win = create_app_window();
        let forwarded = count(&win, on_fullscreen_changed);
        attach_window_fullscreen(&fullscreen.capability, &win);
        let order = Arc::new(Mutex::new(Vec::new()));
        let (log, backend, seen) = (order.clone(), fullscreen.clone(), forwarded.clone());
        connect_signal(
            &signal(&win, on_close),
            Arc::new(move |_value: &()| {
                log.lock().unwrap().push("close".to_string());
                backend.emit(true);
                log.lock()
                    .unwrap()
                    .push(format!("observer:{}", seen.load(Ordering::SeqCst)));
            }),
            None,
        );
        notify_window_closed(&win);
        fullscreen.emit(true);
        notify_window_closed(&win);
        assert_eq!(*order.lock().unwrap(), vec!["close", "observer:1"]);
        assert_eq!(hits(&forwarded), 1);
    }

    #[test]
    fn still_drains_application_observers_when_a_terminal_listener_throws() {
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        let forwarded = count(&win, on_fullscreen_changed);
        attach_window_fullscreen(&fullscreen.capability, &win);
        connect_signal(
            &signal(&win, on_close),
            Arc::new(|_value: &()| panic_flight_error("close listener failed")),
            None,
        );
        let raised =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| notify_window_closed(&win)));
        assert_eq!(
            raised
                .unwrap_err()
                .downcast::<FlightError>()
                .unwrap()
                .message,
            "close listener failed"
        );
        fullscreen.emit(true);
        notify_window_closed(&win);
        assert_eq!(hits(&forwarded), 0);
    }
}

mod open_window {
    use super::*;

    fn options(edit: impl FnOnce(&mut WindowOptions)) -> WindowOptions {
        let mut out = WindowOptions {
            title: None,
            x: None,
            y: None,
            width: None,
            height: None,
            resizable: None,
            always_on_top: None,
            fullscreen: None,
            minimized: None,
            maximized: None,
            visible: None,
            min_width: None,
            min_height: None,
            max_width: None,
            max_height: None,
            center: None,
            frame: None,
            transparent: None,
        };
        edit(&mut out);
        return out;
    }

    #[test]
    fn applies_options_to_the_entity_and_delegates_to_the_backend() {
        let backend = window_backend();
        let win = create_app_window();
        let opened = options(|o| {
            o.title = Some("Game".to_string());
            o.width = Some(640.0);
            o.height = Some(480.0);
            o.always_on_top = Some(true);
        });
        assert!(open_window(
            &backend.lifecycle(),
            &backend.geometry(),
            &win,
            Some(&opened)
        ));
        let guard = win.read().unwrap();
        assert_eq!(guard.title, "Game");
        assert_eq!(guard.width, 640.0);
        assert!(guard.always_on_top);
        assert!(backend.calls().contains(&"open:Game".to_string()));
    }

    #[test]
    fn centers_the_window_after_open_when_center_option_is_true() {
        let backend = window_backend();
        let opened = options(|o| {
            o.title = Some("Centered".to_string());
            o.center = Some(true);
        });
        open_window(
            &backend.lifecycle(),
            &backend.geometry(),
            &create_app_window(),
            Some(&opened),
        );
        assert_eq!(backend.calls(), vec!["open:Centered", "center"]);
    }

    #[test]
    fn does_not_center_when_center_option_is_not_set() {
        let backend = window_backend();
        let opened = options(|o| o.title = Some("Normal".to_string()));
        open_window(
            &backend.lifecycle(),
            &backend.geometry(),
            &create_app_window(),
            Some(&opened),
        );
        assert!(!backend.calls().contains(&"center".to_string()));
    }

    #[test]
    fn re_arms_terminal_close_and_observer_disposal_after_a_successful_reopen() {
        let backend = window_backend();
        let fullscreen = fullscreen_backend();
        let win = create_app_window();
        let closed = count(&win, on_close);
        let forwarded = count(&win, on_fullscreen_changed);
        let (lifecycle, geometry) = (backend.lifecycle(), backend.geometry());
        assert!(open_window(&lifecycle, &geometry, &win, None));
        attach_window_fullscreen(&fullscreen.capability, &win);
        assert!(close_window(&lifecycle, &win));
        fullscreen.emit(true);
        assert_eq!(hits(&forwarded), 0);
        assert!(open_window(&lifecycle, &geometry, &win, None));
        attach_window_fullscreen(&fullscreen.capability, &win);
        fullscreen.emit(true);
        assert_eq!(hits(&forwarded), 1);
        assert!(close_window(&lifecycle, &win));
        fullscreen.emit(true);
        assert_eq!(hits(&closed), 2);
        assert_eq!(hits(&forwarded), 1);
    }

    #[test]
    fn releases_through_the_origin_host_after_a_different_host_becomes_active() {
        let calls: Calls = Arc::new(Mutex::new(Vec::new()));
        let (origin, active) = (window_backend(), window_backend());
        let (c1, c2, c3) = (calls.clone(), calls.clone(), calls.clone());
        let mut origin_lifecycle = origin.lifecycle();
        origin_lifecycle.close = Arc::new(move |_win: &Ref<AppWindow>| {
            c1.lock().unwrap().push("origin:close".to_string())
        });
        origin_lifecycle.open = Arc::new(move |_win: &Ref<AppWindow>, _options: &WindowOptions| {
            c2.lock().unwrap().push("origin:open".to_string());
            return true;
        });
        let mut active_lifecycle = active.lifecycle();
        active_lifecycle.close = Arc::new(move |_win: &Ref<AppWindow>| {
            c3.lock().unwrap().push("active:close".to_string())
        });
        let win = create_app_window();
        let closed = count(&win, on_close);
        assert!(open_window(
            &origin_lifecycle,
            &origin.geometry(),
            &win,
            None
        ));
        assert!(close_window(&active_lifecycle, &win));
        assert_eq!(calls_of(&calls), vec!["origin:open", "origin:close"]);
        assert_eq!(hits(&closed), 1);
    }
}

mod prepare_element_for_input {
    use super::*;

    #[test]
    fn passes_the_opaque_target_to_the_explicit_input_preparation_capability() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let keep = seen.clone();
        let capability = HostInputTargetCapability {
            provider: Arc::new(()),
            prepare: Arc::new(move |target: &InputTargetHandle| {
                keep.lock()
                    .unwrap()
                    .push(target as *const InputTargetHandle as usize)
            }),
        };
        let handle = target();
        prepare_element_for_input(&capability, &handle);
        assert_eq!(
            *seen.lock().unwrap(),
            vec![&handle as *const InputTargetHandle as usize]
        );
    }
}

mod request_app_window_fullscreen {
    use super::*;

    #[test]
    fn passes_the_opaque_target_to_the_fullscreen_capability() {
        let fullscreen = fullscreen_backend();
        let handle: Ref<FullscreenTargetHandle> =
            Arc::new(std::sync::RwLock::new(allocate_entity()));
        assert_eq!(
            block_on(request_app_window_fullscreen(
                &fullscreen.capability,
                &handle
            ))
            .unwrap(),
            true
        );
        assert_eq!(fullscreen.calls(), vec!["request"]);
    }
}

mod request_window_attention {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        request_window_attention(&backend.attention(), &create_app_window(), true);
        assert!(
            backend
                .calls()
                .contains(&"requestAttention:true".to_string())
        );
    }
}

mod request_window_close {
    use super::*;

    #[test]
    fn returns_true_when_not_vetoed() {
        assert!(request_window_close(&create_app_window()));
    }

    #[test]
    fn returns_false_when_a_listener_vetoes() {
        let win = create_app_window();
        veto(&win);
        assert!(!request_window_close(&win));
    }
}

mod restore_window {
    use super::*;

    #[test]
    fn clears_minimized_maximized_and_emits_on_restore() {
        let backend = window_backend();
        let win = create_app_window();
        maximize_window(&backend.state(), &win);
        let restored = count(&win, |w| &w.on_restore);
        restore_window(&backend.state(), &win);
        assert!(!win.read().unwrap().maximized);
        assert_eq!(hits(&restored), 1);
        assert!(backend.calls().contains(&"restore".to_string()));
    }
}

mod set_window_always_on_top {
    use super::*;

    #[test]
    fn sets_state_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_always_on_top(&backend.z_order(), &win, true);
        assert!(win.read().unwrap().always_on_top);
        assert!(backend.calls().contains(&"setAlwaysOnTop:true".to_string()));
    }
}

mod set_window_content_protection {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        set_window_content_protection(&backend.content_protection(), &create_app_window(), true);
        assert!(
            backend
                .calls()
                .contains(&"setContentProtection:true".to_string())
        );
    }
}

mod set_window_fullscreen {
    use super::*;

    #[test]
    fn sets_state_and_emits_on_fullscreen_changed_once() {
        let backend = window_backend();
        let win = create_app_window();
        let changed = count(&win, on_fullscreen_changed);
        set_window_fullscreen(&backend.fullscreen(), &win, true);
        set_window_fullscreen(&backend.fullscreen(), &win, true);
        assert!(win.read().unwrap().fullscreen);
        assert_eq!(hits(&changed), 1);
    }
}

mod set_window_has_shadow {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        set_window_has_shadow(&backend.shadow(), &create_app_window(), false);
        assert!(backend.calls().contains(&"setHasShadow:false".to_string()));
    }
}

mod set_window_icon {
    use super::*;

    #[test]
    fn sets_the_icon_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_icon(&backend.appearance(), &win, "icon.png");
        assert_eq!(win.read().unwrap().icon, "icon.png");
        assert!(backend.calls().contains(&"setIcon:icon.png".to_string()));
    }

    #[test]
    fn writes_the_icon_before_throwing_for_a_host_without_set_icon() {
        let backend = window_backend();
        let mut appearance = backend.appearance();
        appearance.set_icon = None;
        let win = create_app_window();
        let raised = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            set_window_icon(&appearance, &win, "icon.png")
        }));
        assert_eq!(
            raised.unwrap_err().downcast::<FlightError>().unwrap().kind,
            FlightErrorKind::TypeError
        );
        assert_eq!(win.read().unwrap().icon, "icon.png");
    }
}

mod set_window_maximum_size {
    use super::*;

    #[test]
    fn sets_constraints_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_maximum_size(&backend.size_constraints(), &win, 1920.0, 1080.0);
        assert_eq!(
            (
                win.read().unwrap().max_width,
                win.read().unwrap().max_height
            ),
            (1920.0, 1080.0)
        );
        assert!(
            backend
                .calls()
                .contains(&"setMaximumSize:1920,1080".to_string())
        );
    }
}

mod set_window_menu_bar_visible {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        set_window_menu_bar_visible(&backend.shell(), &create_app_window(), false);
        assert!(
            backend
                .calls()
                .contains(&"setMenuBarVisible:false".to_string())
        );
    }
}

mod set_window_minimum_size {
    use super::*;

    #[test]
    fn sets_constraints_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_minimum_size(&backend.size_constraints(), &win, 320.0, 240.0);
        assert_eq!(
            (
                win.read().unwrap().min_width,
                win.read().unwrap().min_height
            ),
            (320.0, 240.0)
        );
        assert!(
            backend
                .calls()
                .contains(&"setMinimumSize:320,240".to_string())
        );
    }
}

mod set_window_opacity {
    use super::*;

    #[test]
    fn sets_opacity_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_opacity(&backend.appearance(), &win, 0.5);
        assert_eq!(win.read().unwrap().opacity, 0.5);
        assert!(backend.calls().contains(&"setOpacity:0.5".to_string()));
    }
}

mod set_window_parent {
    use super::*;

    #[test]
    fn delegates_to_the_backend_with_null() {
        let backend = window_backend();
        set_window_parent(&backend.hierarchy(), &create_app_window(), None);
        assert!(backend.calls().contains(&"setParent:null".to_string()));
        set_window_parent(
            &backend.hierarchy(),
            &create_app_window(),
            Some(&create_app_window()),
        );
        assert!(backend.calls().contains(&"setParent:win".to_string()));
    }
}

mod set_window_position {
    use super::*;

    #[test]
    fn sets_position_and_emits_on_move() {
        let backend = window_backend();
        let win = create_app_window();
        let moved = count(&win, |w| &w.on_move);
        set_window_position(&backend.geometry(), &win, 100.0, 50.0);
        assert_eq!(
            (win.read().unwrap().x, win.read().unwrap().y),
            (100.0, 50.0)
        );
        assert_eq!(hits(&moved), 1);
    }
}

mod set_window_progress {
    use super::*;

    #[test]
    fn delegates_to_the_backend() {
        let backend = window_backend();
        set_window_progress(&backend.progress(), &create_app_window(), 0.25);
        assert!(backend.calls().contains(&"setProgress:0.25".to_string()));
    }
}

mod set_window_resizable {
    use super::*;

    #[test]
    fn sets_state_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_resizable(&backend.size_constraints(), &win, false);
        assert!(!win.read().unwrap().resizable);
        assert!(backend.calls().contains(&"setResizable:false".to_string()));
    }
}

mod set_window_size {
    use super::*;

    #[test]
    fn sets_size_and_emits_on_resize() {
        let backend = window_backend();
        let win = create_app_window();
        let resized = count(&win, |w| &w.on_resize);
        set_window_size(&backend.geometry(), &win, 800.0, 600.0);
        assert_eq!(
            (win.read().unwrap().width, win.read().unwrap().height),
            (800.0, 600.0)
        );
        assert_eq!(hits(&resized), 1);
    }
}

mod set_window_skip_taskbar {
    use super::*;

    #[test]
    fn sets_state_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_skip_taskbar(&backend.shell(), &win, true);
        assert!(win.read().unwrap().skip_taskbar);
        assert!(backend.calls().contains(&"setSkipTaskbar:true".to_string()));
    }
}

mod set_window_title {
    use super::*;

    #[test]
    fn sets_the_title_and_delegates() {
        let backend = window_backend();
        let win = create_app_window();
        set_window_title(&backend.appearance(), &win, "My App");
        assert_eq!(win.read().unwrap().title, "My App");
        assert!(backend.calls().contains(&"setTitle:My App".to_string()));
    }
}

mod show_window {
    use super::*;

    #[test]
    fn marks_visible_and_delegates_to_the_backend() {
        let backend = window_backend();
        let win = create_app_window();
        hide_window(&backend.visibility(), &win);
        show_window(&backend.visibility(), &win);
        assert!(win.read().unwrap().visible);
        assert!(backend.calls().contains(&"show".to_string()));
    }
}
