use crate::common::*;
use flight_net::contract::*;
use flight_signals::emit_signal;
use std::future::Future;
use std::sync::{Arc, Mutex, RwLock};
use std::task::{Context, Poll, Waker};

mod explain_net_response {
    use super::*;
    #[test]
    fn derives_abort_and_timeout_reasons_from_transport_status_text() {
        for (text, expected) in [
            ("aborted", NetResponseExplanationReason::Aborted),
            ("timeout", NetResponseExplanationReason::Timeout),
        ] {
            let explanation = explain_net_response(&response(0, text, None)).unwrap();
            assert_eq!(explanation.reason, expected);
            assert_eq!(explanation.status, 0);
        }
    }
    #[test]
    fn distinguishes_generic_transport_and_decode_failures() {
        let transport = explain_net_response(&response(0, "Failed to fetch", None)).unwrap();
        assert_eq!(
            transport.reason,
            NetResponseExplanationReason::TransportFailure
        );
        assert_eq!(transport.status_text, "Failed to fetch");
        let decode = explain_net_response(&response(200, "OK", None)).unwrap();
        assert_eq!(decode.reason, NetResponseExplanationReason::DecodeFailure);
        assert_eq!(decode.status, 200);
    }
    #[test]
    fn returns_none_for_non_null_bodies_including_empty_text_false_and_zero() {
        for body in [
            Some(Arc::new("ok".to_string()) as Arc<dyn std::any::Any + Send + Sync>),
            Some(Arc::new(String::new())),
            Some(Arc::new(false)),
            Some(Arc::new(0u32)),
        ] {
            assert!(explain_net_response(&response(200, "OK", body)).is_none());
        }
    }
    #[test]
    fn gives_status_zero_precedence_and_retains_original_metadata() {
        let mut value = response(
            0,
            " \u{FEFF}TiMeOuT\u{3000} ",
            Some(Arc::new("body".to_string())),
        );
        value.url = "final-url".to_string();
        value.ok = true;
        let explanation = explain_net_response(&value).unwrap();
        assert_eq!(explanation.reason, NetResponseExplanationReason::Timeout);
        assert_eq!(explanation.status_text, value.status_text);
        assert_eq!(explanation.url, "final-url");
        assert!(value.ok);
    }
    #[test]
    fn uses_javascript_trim_instead_of_trimming_non_ecmascript_nel() {
        assert_eq!(
            explain_net_response(&response(0, "\u{0085}aborted\u{0085}", None))
                .unwrap()
                .reason,
            NetResponseExplanationReason::TransportFailure
        );
        assert_eq!(
            explain_net_response(&response(0, "\u{FEFF}ABORTED\u{FEFF}", None))
                .unwrap()
                .reason,
            NetResponseExplanationReason::Aborted
        );
    }
}

mod send_net_request {
    use super::*;

    #[test]
    fn dispatches_original_request_options_and_response_by_identity_with_guards_off() {
        let request = net_request("GET", "https://example.test");
        let options = net_options();
        let expected_request = request.clone();
        let expected_options = options.clone();
        let result = Arc::new(RwLock::new(response(200, "OK", None)));
        let expected_result = result.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, options| {
                assert!(Arc::ptr_eq(&request, &expected_request));
                assert!(Arc::ptr_eq(&options.unwrap(), &expected_options));
                let result = result.clone();
                Box::pin(async move { Ok(result) })
            }),
        };
        let actual = block_on(send_net_request(
            &host,
            &request,
            Some(&options),
            &net_state(),
        ))
        .unwrap();
        assert!(Arc::ptr_eq(&actual, &expected_result));
    }

    #[test]
    fn preserves_omitted_options_instead_of_synthesizing_an_empty_record() {
        let result = Arc::new(RwLock::new(response(200, "OK", None)));
        let expected = result.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                assert!(options.is_none());
                let result = result.clone();
                Box::pin(async move { Ok(result) })
            }),
        };
        let actual = block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            None,
            &net_state(),
        ))
        .unwrap();
        assert!(Arc::ptr_eq(&actual, &expected));
    }

    #[test]
    fn guards_without_progress_leave_options_and_custom_methods_unchanged() {
        let state = net_state();
        set_net_guard(
            &state,
            Some(Arc::new(|_| {
                panic!("custom body-bearing method must remain open")
            })),
        );
        let request = net_request("vendor-Method", "u");
        request.write().unwrap().body = Some(Some(NetBody::Text("body".to_string())));
        let options = net_options();
        let expected = options.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, options| {
                assert_eq!(request.read().unwrap().method, "vendor-Method");
                assert!(Arc::ptr_eq(&options.unwrap(), &expected));
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        block_on(send_net_request(&host, &request, Some(&options), &state)).unwrap();
    }

    #[test]
    fn progress_wrapper_uses_original_custom_emit_and_shares_data_without_copying_payloads() {
        let state = net_state();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.read().unwrap().reason)
            })),
        );
        let original = progress_signal();
        let observed = Arc::new(Mutex::new(Vec::new()));
        let events = observed.clone();
        *original.read().unwrap().emit.write().unwrap() =
            Arc::new(move |event| events.lock().unwrap().push(event.clone()));
        let options = net_options();
        options.write().unwrap().progress = Some(original.clone());
        let expected_options = options.clone();
        let expected_signal = original.clone();
        let event = progress_tick();
        let expected_event = event.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                let options = options.unwrap();
                assert!(!Arc::ptr_eq(&options, &expected_options));
                let wrapper = options.read().unwrap().progress.clone().unwrap();
                assert!(!Arc::ptr_eq(&wrapper, &expected_signal));
                assert!(Arc::ptr_eq(
                    &wrapper.read().unwrap().data,
                    &expected_signal.read().unwrap().data
                ));
                emit_signal(&wrapper.read().unwrap(), &event);
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            Some(&options),
            &state,
        ))
        .unwrap();
        assert!(reasons.lock().unwrap().is_empty());
        assert!(Arc::ptr_eq(&observed.lock().unwrap()[0], &expected_event));
        assert!(original.read().unwrap().data.read().unwrap().is_none());
    }

    #[test]
    fn direct_original_emission_does_not_mark_the_wrapper_as_used() {
        let state = net_state();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.read().unwrap().reason)
            })),
        );
        let original = progress_signal();
        let options = net_options();
        options.write().unwrap().progress = Some(original.clone());
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, _| {
                emit_signal(&original.read().unwrap(), &progress_tick());
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            Some(&options),
            &state,
        ))
        .unwrap();
        assert_eq!(
            *reasons.lock().unwrap(),
            [NetGuardReason::ProgressNotEmitted]
        );
    }

    #[test]
    fn wrapper_reads_the_current_original_emitter_after_provider_await_has_started() {
        let state = net_state();
        set_net_guard(
            &state,
            Some(Arc::new(|_| {
                panic!("wrapper emission must suppress the progress notice")
            })),
        );
        let original = progress_signal();
        *original.read().unwrap().emit.write().unwrap() =
            Arc::new(|_| panic!("old custom emitter must not be snapshotted"));
        let options = net_options();
        options.write().unwrap().progress = Some(original.clone());
        let resolution = Arc::new(Mutex::new(None));
        let provider_resolution = resolution.clone();
        let captured = Arc::new(Mutex::new(None));
        let captured_options = captured.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                *captured_options.lock().unwrap() = options;
                Box::pin(PendingResponse(provider_resolution.clone()))
            }),
        };
        let request = net_request("GET", "u");
        let mut future = Box::pin(send_net_request(&host, &request, Some(&options), &state));
        let mut context = Context::from_waker(Waker::noop());
        assert!(future.as_mut().poll(&mut context).is_pending());
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        *original.read().unwrap().emit.write().unwrap() =
            Arc::new(move |_| *count.lock().unwrap() += 1);
        let wrapper_options = captured.lock().unwrap().clone().unwrap();
        let wrapper = wrapper_options.read().unwrap().progress.clone().unwrap();
        emit_signal(&wrapper.read().unwrap(), &progress_tick());
        *resolution.lock().unwrap() = Some(Ok(Arc::new(RwLock::new(response(200, "OK", None)))));
        assert!(matches!(
            future.as_mut().poll(&mut context),
            Poll::Ready(Ok(_))
        ));
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn progress_notice_uses_the_guard_captured_before_await_even_after_removal() {
        let state = net_state();
        let notices = Arc::new(Mutex::new(Vec::new()));
        let captured = notices.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice)
            })),
        );
        let resolution = Arc::new(Mutex::new(None));
        let provider_resolution = resolution.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, _| {
                Box::pin(PendingResponse(provider_resolution.clone()))
            }),
        };
        let options = net_options();
        options.write().unwrap().progress = Some(progress_signal());
        let request = net_request("GET", "u");
        let mut future = Box::pin(send_net_request(&host, &request, Some(&options), &state));
        let mut context = Context::from_waker(Waker::noop());
        assert!(future.as_mut().poll(&mut context).is_pending());
        set_net_guard(&state, None);
        let response = Arc::new(RwLock::new(response(404, "Not Found", None)));
        *resolution.lock().unwrap() = Some(Ok(response.clone()));
        let Poll::Ready(Ok(actual)) = future.as_mut().poll(&mut context) else {
            panic!("provider resolved");
        };
        assert!(Arc::ptr_eq(&actual, &response));
        assert_eq!(notices.lock().unwrap().len(), 1);
        let notice = notices.lock().unwrap()[0].clone();
        assert_eq!(
            notice.read().unwrap().reason,
            NetGuardReason::ProgressNotEmitted
        );
        assert!(Arc::ptr_eq(&notice.read().unwrap().request, &request));
    }

    #[test]
    fn rejection_preserves_programmer_error_without_a_post_resolution_progress_notice() {
        let state = net_state();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.read().unwrap().reason)
            })),
        );
        let request = net_request("GET", "u");
        request.write().unwrap().body = Some(Some(NetBody::Text("x".to_string())));
        request.write().unwrap().timeout_ms = Some(-1.0);
        let options = net_options();
        options.write().unwrap().progress = Some(progress_signal());
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(|_, _| Box::pin(async { Err(programmer_error()) })),
        };
        assert!(
            matches!(block_on(send_net_request(&host, &request, Some(&options), &state)), Err(error) if error == programmer_error())
        );
        assert_eq!(
            *reasons.lock().unwrap(),
            [
                NetGuardReason::BodyOnGetOrHead,
                NetGuardReason::NegativeTimeout
            ]
        );
    }

    #[test]
    fn transport_failures_remain_status_zero_sentinels_and_do_not_warn_about_progress() {
        for text in ["aborted", "timeout", "Failed to fetch"] {
            let state = net_state();
            set_net_guard(
                &state,
                Some(Arc::new(|_| panic!("status zero has no progress warning"))),
            );
            let options = net_options();
            options.write().unwrap().progress = Some(progress_signal());
            let expected = Arc::new(RwLock::new(response(0, text, None)));
            let host = host_net(expected.clone());
            let actual = block_on(send_net_request(
                &host,
                &net_request("GET", "u"),
                Some(&options),
                &state,
            ))
            .unwrap();
            assert!(Arc::ptr_eq(&actual, &expected));
        }
    }

    #[test]
    fn forwards_preaborted_and_later_aborted_canonical_signals_without_replacing_options() {
        use flight_stream::{
            abort_controller, create_abort_controller, get_abort_signal_reason,
            is_abort_signal_aborted,
        };
        let controller = create_abort_controller();
        let options = net_options();
        options.write().unwrap().signal = Some(controller.signal.clone());
        let expected_options = options.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                let options = options.unwrap();
                assert!(Arc::ptr_eq(&options, &expected_options));
                let signal = options.read().unwrap().signal.clone().unwrap();
                assert!(is_abort_signal_aborted(&signal));
                assert!(get_abort_signal_reason(&signal).is_some());
                Box::pin(async { Ok(Arc::new(RwLock::new(response(0, "aborted", None)))) })
            }),
        };
        abort_controller(&controller, None);
        block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            Some(&options),
            &net_state(),
        ))
        .unwrap();
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let options = net_options();
        options.write().unwrap().signal = Some(signal);
        let captured = Arc::new(Mutex::new(None));
        let provider_capture = captured.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                *provider_capture.lock().unwrap() = options;
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        let state = net_state();
        set_net_guard(&state, Some(Arc::new(|_| {})));
        options.write().unwrap().progress = Some(progress_signal());
        block_on(send_net_request(
            &host,
            &net_request("GET", "u"),
            Some(&options),
            &state,
        ))
        .unwrap();
        let received = captured.lock().unwrap().clone().unwrap();
        let received_signal = received.read().unwrap().signal.clone().unwrap();
        assert!(!is_abort_signal_aborted(&received_signal));
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(&received_signal));
    }
}

mod set_net_guard {
    use super::*;

    #[test]
    fn installs_and_removes_the_notice_hook_without_changing_the_enabled_flag() {
        let state = net_state();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                captured.lock().unwrap().push(notice.read().unwrap().reason)
            })),
        );
        assert!(!are_net_guards_enabled(&state));
        let first = net_request("get", "u");
        first.write().unwrap().body = Some(Some(NetBody::Text("x".to_string())));
        first.write().unwrap().timeout_ms = Some(-1.0);
        let host = host_net(Arc::new(RwLock::new(response(200, "OK", None))));
        block_on(send_net_request(&host, &first, None, &state)).unwrap();
        set_net_guard(&state, None);
        let second = net_request("HEAD", "v");
        second.write().unwrap().body = Some(Some(NetBody::Text("x".to_string())));
        block_on(send_net_request(&host, &second, None, &state)).unwrap();
        assert_eq!(
            *reasons.lock().unwrap(),
            [
                NetGuardReason::BodyOnGetOrHead,
                NetGuardReason::NegativeTimeout
            ]
        );
    }

    #[test]
    fn keeps_original_notice_request_and_reads_timeout_after_first_callback_mutation() {
        let state = net_state();
        let request = net_request("GET", "u");
        request.write().unwrap().body = Some(Some(NetBody::Text(String::new())));
        let expected = request.clone();
        let reasons = Arc::new(Mutex::new(Vec::new()));
        let captured = reasons.clone();
        let callback_state = state.clone();
        set_net_guard(
            &state,
            Some(Arc::new(move |notice| {
                let notice = notice.read().unwrap();
                assert!(Arc::ptr_eq(&notice.request, &expected));
                captured.lock().unwrap().push(notice.reason);
                if notice.reason == NetGuardReason::BodyOnGetOrHead {
                    notice.request.write().unwrap().timeout_ms = Some(-1.0);
                    set_net_guard(
                        &callback_state,
                        Some(Arc::new(|_| {
                            panic!("current invocation must keep the original guard snapshot")
                        })),
                    );
                }
            })),
        );
        let host = host_net(Arc::new(RwLock::new(response(200, "OK", None))));
        block_on(send_net_request(&host, &request, None, &state)).unwrap();
        assert_eq!(
            *reasons.lock().unwrap(),
            [
                NetGuardReason::BodyOnGetOrHead,
                NetGuardReason::NegativeTimeout
            ]
        );
        set_net_guard(&state, None);
    }

    #[test]
    fn preserves_absent_and_null_body_and_the_sources_exact_timeout_comparison() {
        for body in [None, Some(None)] {
            let state = net_state();
            set_net_guard(
                &state,
                Some(Arc::new(|_| {
                    panic!("absent/null body and nonnegative timeout do not warn")
                })),
            );
            for timeout in [
                None,
                Some(0.0),
                Some(-0.0),
                Some(f32::NAN),
                Some(f32::INFINITY),
            ] {
                let request = net_request("HEAD", "u");
                request.write().unwrap().body = body.clone();
                request.write().unwrap().timeout_ms = timeout;
                block_on(send_net_request(
                    &host_net(Arc::new(RwLock::new(response(200, "OK", None)))),
                    &request,
                    None,
                    &state,
                ))
                .unwrap();
            }
        }
    }
}
