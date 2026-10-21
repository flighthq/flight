use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_entity::{Entity, FlightError, FlightErrorKind};
use flight_keyboard::contract::*;
use flight_signals::{connect_signal, has_signal_slots};

use crate::block_on;

fn blank_info() -> SoftKeyboardInfo {
    return SoftKeyboardInfo {
        visible: false,
        height: 0.0,
        x: 0.0,
        y: 0.0,
        width: 0.0,
    };
}

fn info_capability(state: Arc<Mutex<SoftKeyboardInfo>>) -> HostSoftKeyboardInfoCapability {
    return HostSoftKeyboardInfoCapability {
        get_info: Arc::new(move |out| *out = state.lock().unwrap().clone()),
    };
}

fn fixed_info(info: SoftKeyboardInfo) -> HostSoftKeyboardInfoCapability {
    return info_capability(Arc::new(Mutex::new(info)));
}

fn listener_change(
    listener: Arc<Mutex<Option<SoftKeyboardChangeListener>>>,
    result: SoftKeyboardAttachResult,
    unsubscribe: Option<SoftKeyboardUnsubscribe>,
) -> HostSoftKeyboardChangeCapability {
    return HostSoftKeyboardChangeCapability {
        subscribe: Arc::new(move |value| {
            *listener.lock().unwrap() = Some(value);
            let unsubscribe = unsubscribe.clone();
            return Box::pin(async move {
                Ok(SoftKeyboardChangeSubscription {
                    result,
                    unsubscribe,
                })
            });
        }),
    };
}

fn visibility_capability(
    result: SoftKeyboardVisibilityResult,
) -> HostSoftKeyboardVisibilityCapability {
    return HostSoftKeyboardVisibilityCapability {
        hide: Arc::new(move || Box::pin(async move { Ok(result) })),
        show: Arc::new(move || Box::pin(async move { Ok(result) })),
    };
}

mod attach_soft_keyboard {
    use super::*;

    #[test]
    fn detaches_before_sampling_and_subscribing_to_the_replacement() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let first_calls = calls.clone();
        let first = HostSoftKeyboardChangeCapability {
            subscribe: Arc::new(move |_listener| {
                first_calls.lock().unwrap().push("subscribe");
                let release_calls = first_calls.clone();
                return Box::pin(async move {
                    Ok(SoftKeyboardChangeSubscription {
                        result: SoftKeyboardAttachResult::Ok,
                        unsubscribe: Some(Arc::new(move || {
                            release_calls.lock().unwrap().push("unsubscribe")
                        })),
                    })
                });
            }),
        };
        let info_calls = calls.clone();
        let info = HostSoftKeyboardInfoCapability {
            get_info: Arc::new(move |_out| info_calls.lock().unwrap().push("info")),
        };
        let mut keyboard = create_soft_keyboard();
        assert_eq!(
            block_on(attach_soft_keyboard(&first, &info, &mut keyboard)),
            Ok(SoftKeyboardAttachResult::Ok)
        );
        calls.lock().unwrap().clear();

        let second_calls = calls.clone();
        let second = HostSoftKeyboardChangeCapability {
            subscribe: Arc::new(move |_listener| {
                second_calls.lock().unwrap().push("subscribe");
                return Box::pin(async {
                    Ok(SoftKeyboardChangeSubscription {
                        result: SoftKeyboardAttachResult::Ok,
                        unsubscribe: Some(Arc::new(|| {})),
                    })
                });
            }),
        };
        assert_eq!(
            block_on(attach_soft_keyboard(&second, &info, &mut keyboard)),
            Ok(SoftKeyboardAttachResult::Ok)
        );
        assert_eq!(
            *calls.lock().unwrap(),
            vec!["unsubscribe", "info", "subscribe"]
        );
    }

    #[test]
    fn fires_show_resize_and_hide_from_strict_positive_height_transitions() {
        let state = Arc::new(Mutex::new(blank_info()));
        let listener = Arc::new(Mutex::new(None));
        let change = listener_change(
            listener.clone(),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(|| {})),
        );
        let mut keyboard = create_soft_keyboard();
        let events = Arc::new(Mutex::new(Vec::new()));
        let show_events = events.clone();
        connect_signal(
            &keyboard.on_show,
            Arc::new(move |height| show_events.lock().unwrap().push(format!("show:{height}"))),
            None,
        );
        let resize_events = events.clone();
        connect_signal(
            &keyboard.on_resize,
            Arc::new(move |height| {
                resize_events
                    .lock()
                    .unwrap()
                    .push(format!("resize:{height}"))
            }),
            None,
        );
        let hide_events = events.clone();
        connect_signal(
            &keyboard.on_hide,
            Arc::new(move |_: &()| hide_events.lock().unwrap().push("hide".to_string())),
            None,
        );
        block_on(attach_soft_keyboard(
            &change,
            &info_capability(state.clone()),
            &mut keyboard,
        ))
        .unwrap();
        for height in [300.0, 400.0, 0.0, -1.0] {
            let mut current = state.lock().unwrap();
            current.height = height;
            current.visible = height > 0.0;
            drop(current);
            let notify = listener.lock().unwrap().clone().unwrap();
            notify();
        }
        assert_eq!(
            *events.lock().unwrap(),
            vec!["show:300", "resize:400", "hide"]
        );
    }

    #[test]
    fn passes_a_rejected_subscription_promise_through_unchanged() {
        let error = FlightError {
            kind: FlightErrorKind::TypeError,
            message: "subscribe rejected".to_string(),
        };
        let returned = error.clone();
        let change = HostSoftKeyboardChangeCapability {
            subscribe: Arc::new(move |_listener| {
                let returned = returned.clone();
                return Box::pin(async move { Err(returned) });
            }),
        };
        let mut keyboard = create_soft_keyboard();
        assert_eq!(
            block_on(attach_soft_keyboard(
                &change,
                &fixed_info(blank_info()),
                &mut keyboard,
            )),
            Err(error)
        );
    }

    #[test]
    fn returns_acquisition_failed_without_retaining_a_release() {
        let releases = Arc::new(Mutex::new(0));
        let captured = releases.clone();
        let change = listener_change(
            Arc::new(Mutex::new(None)),
            SoftKeyboardAttachResult::AcquisitionFailed,
            Some(Arc::new(move || *captured.lock().unwrap() += 1)),
        );
        let mut keyboard = create_soft_keyboard();
        assert_eq!(
            block_on(attach_soft_keyboard(
                &change,
                &fixed_info(blank_info()),
                &mut keyboard,
            )),
            Ok(SoftKeyboardAttachResult::AcquisitionFailed)
        );
        detach_soft_keyboard(&mut keyboard);
        assert_eq!(*releases.lock().unwrap(), 0);
    }

    #[test]
    fn returns_ok_and_accepts_delivery_during_async_acquisition() {
        let state = Arc::new(Mutex::new(blank_info()));
        let delivery_state = state.clone();
        let change = HostSoftKeyboardChangeCapability {
            subscribe: Arc::new(move |listener| {
                delivery_state.lock().unwrap().height = 180.0;
                listener();
                return Box::pin(async {
                    Ok(SoftKeyboardChangeSubscription {
                        result: SoftKeyboardAttachResult::Ok,
                        unsubscribe: Some(Arc::new(|| {})),
                    })
                });
            }),
        };
        let mut keyboard = create_soft_keyboard();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        connect_signal(
            &keyboard.on_show,
            Arc::new(move |height| captured.lock().unwrap().push(*height)),
            None,
        );
        assert_eq!(
            block_on(attach_soft_keyboard(
                &change,
                &info_capability(state),
                &mut keyboard,
            )),
            Ok(SoftKeyboardAttachResult::Ok)
        );
        assert_eq!(*seen.lock().unwrap(), vec![180.0]);
    }

    #[test]
    fn updates_previous_height_before_emitting_so_a_slot_may_reenter_delivery() {
        let state = Arc::new(Mutex::new(blank_info()));
        let listener: Arc<Mutex<Option<SoftKeyboardChangeListener>>> = Arc::new(Mutex::new(None));
        let change = listener_change(
            listener.clone(),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(|| {})),
        );
        let mut keyboard = create_soft_keyboard();
        let shows = Arc::new(Mutex::new(0));
        let captured_shows = shows.clone();
        let captured_listener = listener.clone();
        connect_signal(
            &keyboard.on_show,
            Arc::new(move |_height| {
                let should_reenter = {
                    let mut count = captured_shows.lock().unwrap();
                    *count += 1;
                    *count == 1
                };
                if should_reenter {
                    let notify = captured_listener.lock().unwrap().clone().unwrap();
                    notify();
                }
            }),
            None,
        );
        block_on(attach_soft_keyboard(
            &change,
            &info_capability(state.clone()),
            &mut keyboard,
        ))
        .unwrap();
        state.lock().unwrap().height = 300.0;
        let notify = listener.lock().unwrap().clone().unwrap();
        notify();
        assert_eq!(*shows.lock().unwrap(), 1);
    }
}

mod create_soft_keyboard {
    use super::*;

    #[test]
    fn returns_an_entity_with_three_fresh_signals() {
        let first = create_soft_keyboard();
        let second = create_soft_keyboard();
        let _: &dyn Entity = &first;
        assert!(!has_signal_slots(&first.on_show));
        assert!(!has_signal_slots(&first.on_hide));
        assert!(!has_signal_slots(&first.on_resize));
        assert!(!Arc::ptr_eq(&first.on_show.data, &second.on_show.data));
        assert!(!Arc::ptr_eq(&first.on_hide.data, &second.on_hide.data));
        assert!(!Arc::ptr_eq(&first.on_resize.data, &second.on_resize.data));
    }
}

mod detach_soft_keyboard {
    use super::*;

    #[test]
    fn invokes_the_exact_release_once_and_is_safe_when_never_attached() {
        let releases = Arc::new(Mutex::new(0));
        let captured = releases.clone();
        let change = listener_change(
            Arc::new(Mutex::new(None)),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(move || *captured.lock().unwrap() += 1)),
        );
        let mut keyboard = create_soft_keyboard();
        detach_soft_keyboard(&mut keyboard);
        block_on(attach_soft_keyboard(
            &change,
            &fixed_info(blank_info()),
            &mut keyboard,
        ))
        .unwrap();
        detach_soft_keyboard(&mut keyboard);
        detach_soft_keyboard(&mut keyboard);
        assert_eq!(*releases.lock().unwrap(), 1);
    }

    #[test]
    fn retains_the_entry_when_release_panics_because_delete_happens_after_call() {
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let change = listener_change(
            Arc::new(Mutex::new(None)),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(move || {
                *captured.lock().unwrap() += 1;
                panic!("release failed");
            })),
        );
        let mut keyboard = create_soft_keyboard();
        block_on(attach_soft_keyboard(
            &change,
            &fixed_info(blank_info()),
            &mut keyboard,
        ))
        .unwrap();
        assert!(catch_unwind(AssertUnwindSafe(|| detach_soft_keyboard(&mut keyboard))).is_err());
        assert!(catch_unwind(AssertUnwindSafe(|| detach_soft_keyboard(&mut keyboard))).is_err());
        assert_eq!(*calls.lock().unwrap(), 2);
    }
}

mod dispose_soft_keyboard {
    use super::*;

    #[test]
    fn delegates_to_detach_without_clearing_signals() {
        let releases = Arc::new(Mutex::new(0));
        let captured = releases.clone();
        let change = listener_change(
            Arc::new(Mutex::new(None)),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(move || *captured.lock().unwrap() += 1)),
        );
        let mut keyboard = create_soft_keyboard();
        connect_signal(&keyboard.on_hide, Arc::new(|_: &()| {}), None);
        block_on(attach_soft_keyboard(
            &change,
            &fixed_info(blank_info()),
            &mut keyboard,
        ))
        .unwrap();
        dispose_soft_keyboard(&mut keyboard);
        assert_eq!(*releases.lock().unwrap(), 1);
        assert!(has_signal_slots(&keyboard.on_hide));
    }
}

mod get_soft_keyboard_attach_result_string {
    use super::*;

    #[test]
    fn returns_exact_source_strings_and_constants() {
        assert_eq!(
            get_soft_keyboard_attach_result_string(SOFT_KEYBOARD_ATTACH_OK_KIND),
            "ok"
        );
        assert_eq!(
            get_soft_keyboard_attach_result_string(SOFT_KEYBOARD_ATTACH_ACQUISITION_FAILED_KIND),
            "acquisition-failed"
        );
    }
}

mod get_soft_keyboard_height {
    use super::*;

    #[test]
    fn returns_the_current_height_including_zero() {
        assert_eq!(
            get_soft_keyboard_height(&fixed_info(SoftKeyboardInfo {
                height: 250.0,
                ..blank_info()
            })),
            250.0
        );
        assert_eq!(get_soft_keyboard_height(&fixed_info(blank_info())), 0.0);
    }
}

mod get_soft_keyboard_info {
    use super::*;

    #[test]
    fn writes_every_field_into_the_caller_owned_out() {
        let expected = SoftKeyboardInfo {
            visible: true,
            height: 300.0,
            x: 10.0,
            y: 20.0,
            width: 400.0,
        };
        let mut out = blank_info();
        get_soft_keyboard_info(&mut out, &fixed_info(expected.clone()));
        assert_eq!(out, expected);
    }
}

mod get_soft_keyboard_setter_result_string {
    use super::*;

    #[test]
    fn returns_exact_source_strings_and_constants() {
        let expected = [
            (SOFT_KEYBOARD_SETTER_OK_KIND, "ok"),
            (
                SOFT_KEYBOARD_SETTER_OPERATION_UNAVAILABLE_KIND,
                "operation-unavailable",
            ),
            (
                SOFT_KEYBOARD_SETTER_OPERATION_FAILED_KIND,
                "operation-failed",
            ),
        ];
        for (value, text) in expected {
            assert_eq!(get_soft_keyboard_setter_result_string(value), text);
        }
    }
}

mod get_soft_keyboard_visibility_result_string {
    use super::*;

    #[test]
    fn returns_exact_source_strings_and_constants() {
        assert_eq!(
            get_soft_keyboard_visibility_result_string(SOFT_KEYBOARD_VISIBILITY_OK_KIND),
            "ok"
        );
        assert_eq!(
            get_soft_keyboard_visibility_result_string(
                SOFT_KEYBOARD_VISIBILITY_OPERATION_FAILED_KIND
            ),
            "operation-failed"
        );
    }
}

mod hide_soft_keyboard {
    use super::*;

    #[test]
    fn returns_resolved_provider_results_and_rejections() {
        assert_eq!(
            block_on(hide_soft_keyboard(&visibility_capability(
                SoftKeyboardVisibilityResult::OperationFailed,
            ))),
            Ok(SoftKeyboardVisibilityResult::OperationFailed)
        );
        let error = FlightError {
            kind: FlightErrorKind::Error,
            message: "hide rejected".to_string(),
        };
        let returned = error.clone();
        let capability = HostSoftKeyboardVisibilityCapability {
            hide: Arc::new(move || {
                let returned = returned.clone();
                return Box::pin(async move { Err(returned) });
            }),
            show: Arc::new(|| Box::pin(async { Ok(SoftKeyboardVisibilityResult::Ok) })),
        };
        assert_eq!(block_on(hide_soft_keyboard(&capability)), Err(error));
    }
}

mod initialize_soft_keyboard {
    use super::*;

    #[test]
    fn replaces_signals_but_preserves_an_existing_subscription() {
        let releases = Arc::new(Mutex::new(0));
        let captured = releases.clone();
        let change = listener_change(
            Arc::new(Mutex::new(None)),
            SoftKeyboardAttachResult::Ok,
            Some(Arc::new(move || *captured.lock().unwrap() += 1)),
        );
        let mut keyboard = create_soft_keyboard();
        block_on(attach_soft_keyboard(
            &change,
            &fixed_info(blank_info()),
            &mut keyboard,
        ))
        .unwrap();
        let previous_show = keyboard.on_show.data.clone();
        initialize_soft_keyboard(&mut keyboard);
        assert!(!Arc::ptr_eq(&previous_show, &keyboard.on_show.data));
        detach_soft_keyboard(&mut keyboard);
        assert_eq!(*releases.lock().unwrap(), 1);
    }
}

mod is_soft_keyboard_visible {
    use super::*;

    #[test]
    fn returns_the_explicit_visible_field_independently_of_height() {
        assert!(is_soft_keyboard_visible(&fixed_info(SoftKeyboardInfo {
            visible: true,
            height: 0.0,
            ..blank_info()
        })));
        assert!(!is_soft_keyboard_visible(&fixed_info(SoftKeyboardInfo {
            visible: false,
            height: 300.0,
            ..blank_info()
        })));
    }
}

mod parse_soft_keyboard_attach_result {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_others() {
        assert_eq!(
            parse_soft_keyboard_attach_result("ok"),
            Some(SoftKeyboardAttachResult::Ok)
        );
        assert_eq!(
            parse_soft_keyboard_attach_result("acquisition-failed"),
            Some(SoftKeyboardAttachResult::AcquisitionFailed)
        );
        assert_eq!(parse_soft_keyboard_attach_result("OK"), None);
    }
}

mod parse_soft_keyboard_setter_result {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_others() {
        assert_eq!(
            parse_soft_keyboard_setter_result("operation-unavailable"),
            Some(SoftKeyboardSetterResult::OperationUnavailable)
        );
        assert_eq!(
            parse_soft_keyboard_setter_result("operation-failed"),
            Some(SoftKeyboardSetterResult::OperationFailed)
        );
        assert_eq!(parse_soft_keyboard_setter_result(""), None);
    }
}

mod parse_soft_keyboard_visibility_result {
    use super::*;

    #[test]
    fn parses_exact_source_strings_and_rejects_others() {
        assert_eq!(
            parse_soft_keyboard_visibility_result("ok"),
            Some(SoftKeyboardVisibilityResult::Ok)
        );
        assert_eq!(
            parse_soft_keyboard_visibility_result("operation-failed"),
            Some(SoftKeyboardVisibilityResult::OperationFailed)
        );
        assert_eq!(parse_soft_keyboard_visibility_result("failed"), None);
    }
}

mod set_soft_keyboard_accessory_bar_visible {
    use super::*;

    #[test]
    fn forwards_the_flag_and_returns_the_exact_result() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardAccessoryBarCapability {
            set_accessory_bar_visible: Arc::new(move |visible| {
                captured.lock().unwrap().push(visible);
                return Box::pin(async { Ok(SoftKeyboardSetterResult::OperationFailed) });
            }),
        };
        assert_eq!(
            block_on(set_soft_keyboard_accessory_bar_visible(&capability, false)),
            Ok(SoftKeyboardSetterResult::OperationFailed)
        );
        assert_eq!(*seen.lock().unwrap(), vec![false]);
    }
}

mod set_soft_keyboard_resize_mode {
    use super::*;

    #[test]
    fn forwards_open_builtin_and_custom_mode_strings() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardResizeModeWriteCapability {
            set_resize_mode: Arc::new(move |mode| {
                captured.lock().unwrap().push(mode);
                return Box::pin(async { Ok(SoftKeyboardSetterResult::Ok) });
            }),
        };
        block_on(set_soft_keyboard_resize_mode(
            &capability,
            SOFT_KEYBOARD_RESIZE_BODY_KIND.to_string(),
        ))
        .unwrap();
        block_on(set_soft_keyboard_resize_mode(
            &capability,
            "Vendor.Resize".to_string(),
        ))
        .unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["Body".to_string(), "Vendor.Resize".to_string()]
        );
        assert_eq!(SOFT_KEYBOARD_RESIZE_NONE_KIND, "None");
    }
}

mod set_soft_keyboard_scroll_assist_enabled {
    use super::*;

    #[test]
    fn forwards_the_flag_and_operation_unavailable_result() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardScrollAssistCapability {
            set_scroll_assist_enabled: Arc::new(move |enabled| {
                captured.lock().unwrap().push(enabled);
                return Box::pin(async { Ok(SoftKeyboardSetterResult::OperationUnavailable) });
            }),
        };
        assert_eq!(
            block_on(set_soft_keyboard_scroll_assist_enabled(&capability, true)),
            Ok(SoftKeyboardSetterResult::OperationUnavailable)
        );
        assert_eq!(*seen.lock().unwrap(), vec![true]);
    }
}

mod set_soft_keyboard_style {
    use super::*;

    #[test]
    fn forwards_open_builtin_and_custom_style_strings() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let capability = HostSoftKeyboardStyleCapability {
            set_style: Arc::new(move |style| {
                captured.lock().unwrap().push(style);
                return Box::pin(async { Ok(SoftKeyboardSetterResult::Ok) });
            }),
        };
        block_on(set_soft_keyboard_style(
            &capability,
            SOFT_KEYBOARD_STYLE_DARK_KIND.to_string(),
        ))
        .unwrap();
        block_on(set_soft_keyboard_style(
            &capability,
            "Vendor.Style".to_string(),
        ))
        .unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["Dark".to_string(), "Vendor.Style".to_string()]
        );
        assert_eq!(SOFT_KEYBOARD_STYLE_DEFAULT_KIND, "Default");
    }
}

mod show_soft_keyboard {
    use super::*;

    #[test]
    fn returns_the_exact_provider_result() {
        assert_eq!(
            block_on(show_soft_keyboard(&visibility_capability(
                SoftKeyboardVisibilityResult::Ok,
            ))),
            Ok(SoftKeyboardVisibilityResult::Ok)
        );
    }
}
