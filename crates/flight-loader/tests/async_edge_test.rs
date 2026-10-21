use crate::common::*;
use crate::mock_host::MockHost;
use flight_entity::Unknown;
use flight_loader::contract::*;
use flight_signals::{connect_signal, disconnect_signal};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

mod abort_races {
    use super::*;
    #[test]
    fn abort_listener_reset_and_requeue_preserves_live_source_set_iteration() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (_, old_future) = deferred::<i32>();
        let (_, fresh_future) = deferred::<i32>();
        let fresh_handle = Arc::new(Mutex::new(None));
        let fresh_signal = Arc::new(Mutex::new(None));
        let current = loader.clone();
        let handle = fresh_handle.clone();
        let saved = fresh_signal.clone();
        let old = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "old",
                Arc::new(move |signal, _| {
                    let current = current.clone();
                    let handle = handle.clone();
                    let saved = saved.clone();
                    let future = fresh_future.clone();
                    flight_stream::add_abort_listener(
                        &signal,
                        Arc::new(move || {
                            reset_resource_loader(&current);
                            let saved = saved.clone();
                            let future = future.clone();
                            let fresh = queue_resource_load(
                                &current,
                                ResourceLoadInput::Item(descriptor(
                                    "fresh",
                                    Arc::new(move |signal, _| {
                                        *saved.lock().unwrap() = Some(signal);
                                        Box::pin(future.clone())
                                    }),
                                )),
                            );
                            *handle.lock().unwrap() = Some(fresh);
                            start_resource_load(&current);
                        }),
                    );
                    Box::pin(old_future.clone())
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        cancel_resource_load(&loader);
        host.run_ready();
        assert!(handle_result(&old).is_none());
        assert!(flight_stream::is_abort_signal_aborted(
            fresh_signal.lock().unwrap().as_ref().unwrap()
        ));
        let fresh = fresh_handle.lock().unwrap().clone().unwrap();
        assert!(handle_result(&fresh).unwrap().is_err());
        let reports = reports(&complete);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].key, "fresh");
        // Reset cleared the cancelled flag; the old live Set iterator then aborted the new entry.
        assert_eq!(reports[0].status, ResourceLoadReportStatus::Failed);
        dispose_resource_loader(&loader);
    }

    #[test]
    fn cancelled_race_rejects_with_the_original_reason_and_does_not_drop_the_losing_factory() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (resolve, future) = deferred::<i32>();
        let signal = Arc::new(Mutex::new(None));
        let saved = signal.clone();
        let finished = Arc::new(AtomicUsize::new(0));
        let count = finished.clone();
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |abort, _| {
                    *saved.lock().unwrap() = Some(abort);
                    let future = future.clone();
                    let count = count.clone();
                    Box::pin(async move {
                        let value = future.await?;
                        count.fetch_add(1, Ordering::SeqCst);
                        Ok(value)
                    })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        cancel_resource_load(&loader);
        host.run_ready();
        let reason =
            flight_stream::get_abort_signal_reason(signal.lock().unwrap().as_ref().unwrap())
                .unwrap()
                .unwrap();
        let failure = handle_result(&handle).unwrap().unwrap_err().unwrap();
        assert!(Arc::ptr_eq(&reason, &failure));
        assert_eq!(finished.load(Ordering::SeqCst), 0);
        resolve(Ok(42));
        host.run_ready();
        assert_eq!(finished.load(Ordering::SeqCst), 1);
        assert_eq!(reports(&complete).len(), 1);
        assert_eq!(
            reports(&complete)[0].status,
            ResourceLoadReportStatus::Cancelled
        );
    }
    #[test]
    fn already_resolved_origin_then_cancel_preserves_the_source_unsettled_handle_branch() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let handle = queue_resource_load(&loader, item("a", 1));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        cancel_resource_load(&loader);
        host.run_ready();
        assert!(handle_result(&handle).is_none());
        assert!(reports(&complete).is_empty());
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
    #[test]
    fn reset_of_pending_work_drops_resolvers_without_inventing_a_rejection() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let handle = queue_resource_load(&loader, item("a", 1));
        reset_resource_loader(&loader);
        host.run_ready();
        assert!(handle_result(&handle).is_none());
        assert_eq!(get_resource_load_counts(&loader).total_items, 0);
    }
    #[test]
    fn cancellation_during_retry_delay_preserves_the_source_empty_report_and_pending_handle() {
        let host = MockHost::new();
        let mut settings = options();
        settings.retries = Some(1.0);
        settings.retry_backoff = Some(ResourceLoaderRetryBackoff::Linear);
        settings.retry_base_delay_ms = Some(30.0);
        let loader = loader(&host, Some(settings));
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "a",
                Arc::new(|_, _| Box::pin(async { Err(error("retry")) })),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        cancel_resource_load(&loader);
        host.advance(29.0);
        assert!(complete.lock().unwrap().is_none());
        host.advance(1.0);
        assert!(reports(&complete).is_empty());
        assert!(handle_result(&handle).is_none());
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
    #[test]
    fn a_finished_attempt_clears_its_timeout_and_never_aborts_the_old_signal_later() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let saved = Arc::new(Mutex::new(None));
        let signal = saved.clone();
        let mut entry = descriptor(
            "a",
            Arc::new(move |signal, _| {
                *saved.lock().unwrap() = Some(signal);
                Box::pin(async { Ok(1) })
            }),
        );
        entry.timeout_ms = Some(5.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(host.timer_count(), 0);
        host.advance(10.0);
        assert!(!flight_stream::is_abort_signal_aborted(
            signal.lock().unwrap().as_ref().unwrap()
        ));
    }
    #[test]
    fn null_rejections_remain_null_and_are_not_replaced_by_a_synthetic_error() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "a",
                Arc::new(|_, _| Box::pin(async { Err(None) })),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        assert!(handle_result(&handle).unwrap().unwrap_err().is_none());
    }
}

mod clock_and_backoff {
    use super::*;
    #[test]
    fn none_linear_and_exponential_backoff_preserve_caps_attempts_and_total_elapsed_time() {
        for (backoff, expected) in [
            (ResourceLoaderRetryBackoff::None, vec![0.0, 0.0, 0.0]),
            (ResourceLoaderRetryBackoff::Linear, vec![5.0, 10.0, 15.0]),
            (
                ResourceLoaderRetryBackoff::Exponential,
                vec![5.0, 10.0, 18.0],
            ),
        ] {
            let host = MockHost::new();
            let mut settings = options();
            settings.retries = Some(3.0);
            settings.retry_backoff = Some(backoff);
            settings.retry_base_delay_ms = Some(5.0);
            settings.retry_max_delay_ms = Some(18.0);
            let loader = loader(&host, Some(settings));
            let signals = enable_resource_loader_item_signals(&loader);
            let retries = Arc::new(Mutex::new(Vec::new()));
            let seen = retries.clone();
            connect_signal(
                &signals.read().unwrap().on_item_retry,
                Arc::new(move |(key, index, delay)| {
                    assert_eq!(key, "a");
                    seen.lock().unwrap().push((*index, *delay));
                }),
                None,
            );
            let calls = Arc::new(AtomicUsize::new(0));
            let count = calls.clone();
            let handle = queue_resource_load(
                &loader,
                ResourceLoadInput::Item(descriptor(
                    "a",
                    Arc::new(move |_, _| {
                        let index = count.fetch_add(1, Ordering::SeqCst);
                        Box::pin(async move {
                            if index < 3 {
                                Err(error("transient"))
                            } else {
                                Ok(42)
                            }
                        })
                    }),
                )),
            );
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.advance(expected.iter().sum());
            assert_eq!(calls.load(Ordering::SeqCst), 4);
            assert_eq!(handle_result(&handle).unwrap().unwrap(), 42);
            assert_eq!(
                *retries.lock().unwrap(),
                expected
                    .iter()
                    .enumerate()
                    .map(|(i, delay)| (i + 1, *delay))
                    .collect::<Vec<_>>()
            );
            assert_eq!(
                reports(&complete)[0].elapsed_ms,
                expected.iter().sum::<f64>()
            );
        }
    }
    #[test]
    fn retry_defaults_are_read_live_and_elapsed_time_starts_at_the_original_dispatch() {
        let host = MockHost::new();
        let mut settings = options();
        settings.retries = Some(2.0);
        settings.retry_backoff = Some(ResourceLoaderRetryBackoff::Linear);
        settings.retry_base_delay_ms = Some(5.0);
        let settings = Arc::new(RwLock::new(settings));
        let loader = create_resource_loader(Some(&settings), &context(&host));
        let signals = enable_resource_loader_item_signals(&loader);
        let delays = Arc::new(Mutex::new(Vec::new()));
        let seen = delays.clone();
        let changed = settings.clone();
        connect_signal(
            &signals.read().unwrap().on_item_retry,
            Arc::new(move |(_, _, delay)| {
                seen.lock().unwrap().push(*delay);
                changed.write().unwrap().retry_base_delay_ms = Some(7.0);
            }),
            None,
        );
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |_, _| {
                    let index = count.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move {
                        if index < 2 {
                            Err(error("again"))
                        } else {
                            Ok(1)
                        }
                    })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.advance(19.0);
        assert_eq!(*delays.lock().unwrap(), [5.0, 14.0]);
        assert_eq!(reports(&complete)[0].elapsed_ms, 19.0);
    }
    #[test]
    fn concurrency_keeps_negative_zero_fractional_infinite_and_nan_source_comparisons() {
        for (limit, expected) in [
            (-1.0, 3),
            (0.0, 3),
            (f32::INFINITY, 3),
            (1.5, 2),
            (f32::NAN, 0),
        ] {
            let host = MockHost::new();
            let mut settings = options();
            settings.max_concurrent = Some(limit);
            let loader = loader(&host, Some(settings));
            let (_, future) = deferred::<i32>();
            for i in 0..3 {
                let future = future.clone();
                queue_resource_load(
                    &loader,
                    ResourceLoadInput::Item(descriptor(
                        &i.to_string(),
                        Arc::new(move |_, _| Box::pin(future.clone())),
                    )),
                );
            }
            start_resource_load(&loader);
            assert_eq!(get_resource_load_counts(&loader).in_flight_items, expected);
        }
    }
    #[test]
    fn source_hint_above_bucket_capacity_stays_queued_instead_of_inventing_a_bypass() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_bytes_per_second = Some(100.0);
        let loader = loader(&host, Some(settings));
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let mut entry = descriptor(
            "a",
            Arc::new(move |_, _| {
                count.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Ok(1) })
            }),
        );
        entry.bytes_hint = Some(200.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        start_resource_load(&loader);
        host.advance(2000.0);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(get_resource_load_counts(&loader).queued_items, 1);
    }
    #[test]
    fn throttled_waits_recheck_pause_before_dispatch_and_resume_uses_current_tokens() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_bytes_per_second = Some(10.0);
        let loader = loader(&host, Some(settings));
        for key in ["a", "b"] {
            let mut entry = descriptor(key, Arc::new(|_, _| Box::pin(async { Ok(1) })));
            entry.bytes_hint = Some(10.0);
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        }
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        pause_resource_load(&loader);
        host.advance(1000.0);
        assert!(complete.lock().unwrap().is_none());
        assert_eq!(
            get_resource_load_item_status(&loader, "b"),
            ResourceLoadItemStatus::Pending
        );
        resume_resource_load(&loader);
        host.run_ready();
        assert_eq!(reports(&complete).len(), 2);
    }
}

mod failures {
    use super::*;
    #[test]
    fn thrown_platform_abort_and_timeout_values_are_terminal_through_the_canonical_catch_bridge() {
        for name in ["AbortError", "TimeoutError"] {
            let host = MockHost::new();
            let loader = loader(&host, None);
            let calls = Arc::new(AtomicUsize::new(0));
            let count = calls.clone();
            let mut entry = descriptor::<i32>(
                "a",
                Arc::new(move |_, _| {
                    count.fetch_add(1, Ordering::SeqCst);
                    std::panic::panic_any(flight_stream::AbortError {
                        name: name.to_string(),
                        message: "platform".to_string(),
                    });
                }),
            );
            entry.retries = Some(3.0);
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.run_ready();
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            assert_eq!(reports(&complete)[0].attempts, 1);
        }
    }

    #[test]
    fn sync_and_future_panics_use_the_canonical_lossless_unknown_catch_bridge() {
        for synchronous in [true, false] {
            let host = MockHost::new();
            let loader = loader(&host, None);
            let factory: Arc<
                dyn Fn(
                        flight_stream::AbortSignal,
                        ResourceLoadBytesReporter,
                    ) -> ResourceLoadFuture<i32>
                    + Send
                    + Sync,
            > = if synchronous {
                Arc::new(|_, _| flight_entity::throw_error("factory error"))
            } else {
                Arc::new(|_, _| {
                    Box::pin(async { std::panic::panic_any("opaque future payload".to_string()) })
                })
            };
            let handle =
                queue_resource_load(&loader, ResourceLoadInput::Item(descriptor("a", factory)));
            start_resource_load(&loader);
            host.run_ready();
            let failure = handle_result(&handle).unwrap().unwrap_err().unwrap();
            if synchronous {
                assert_eq!(
                    failure
                        .downcast_ref::<flight_entity::FlightError>()
                        .unwrap()
                        .message,
                    "factory error"
                );
            } else {
                let caught = failure
                    .downcast_ref::<flight_entity::CaughtPanic>()
                    .unwrap();
                assert_eq!(
                    flight_entity::get_caught_panic_payload(caught)
                        .downcast_ref::<String>()
                        .unwrap(),
                    "opaque future payload"
                );
            }
        }
    }
    #[test]
    fn synchronous_factory_throw_reaches_fail_fast_before_peer_dispatch() {
        let host = MockHost::new();
        let mut settings = options();
        settings.error_policy = Some(ResourceLoaderErrorPolicy::FailFast);
        settings.max_concurrent = Some(2.0);
        let loader = loader(&host, Some(settings));
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "fail",
                Arc::new(|_, _| flight_entity::throw_error("synchronous")),
            )),
        );
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "peer",
                Arc::new(move |_, _| {
                    count.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async { Ok(1) })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(
            reports(&complete)
                .iter()
                .map(|r| r.status)
                .collect::<Vec<_>>(),
            [
                ResourceLoadReportStatus::Failed,
                ResourceLoadReportStatus::Skipped
            ]
        );
    }
    #[test]
    fn item_complete_throw_runs_the_source_catch_after_the_handle_has_already_resolved() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let signals = enable_resource_loader_item_signals(&loader);
        connect_signal(
            &signals.read().unwrap().on_item_complete,
            Arc::new(|_| panic!("item callback")),
            None,
        );
        let handle = queue_resource_load(&loader, item("a", 42));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(handle_result(&handle).unwrap().unwrap(), 42);
        assert_eq!(
            reports(&complete)
                .iter()
                .map(|r| r.status)
                .collect::<Vec<_>>(),
            [
                ResourceLoadReportStatus::Loaded,
                ResourceLoadReportStatus::Failed
            ]
        );
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
        dispose_resource_loader(&loader);
    }
}

mod identity_and_defaults {
    use super::*;
    #[test]
    fn completed_streaming_dedupe_returns_the_original_handle_and_promise_value() {
        let host = MockHost::new();
        let mut settings = options();
        settings.streaming = Some(true);
        let loader = loader(&host, Some(settings));
        let first = queue_resource_load(&loader, item("a", 42));
        start_resource_load(&loader);
        host.run_ready();
        let second = queue_resource_load(&loader, item("a", 99));
        assert!(Arc::ptr_eq(&first, &second));
        assert_eq!(handle_result(&second).unwrap().unwrap(), 42);
        assert_eq!(get_resource_load_counts(&loader).total_items, 1);
    }
    #[test]
    fn opaque_value_identity_survives_handle_and_item_complete_and_null_is_a_success_value() {
        struct Opaque(u32);
        let host = MockHost::new();
        let loader = loader(&host, None);
        let signals = enable_resource_loader_item_signals(&loader);
        let values = Arc::new(Mutex::new(Vec::new()));
        let seen = values.clone();
        connect_signal(
            &signals.read().unwrap().on_item_complete,
            Arc::new(move |(_, value)| seen.lock().unwrap().push(value.clone())),
            None,
        );
        let original: Unknown = Some(Arc::new(Opaque(73)));
        let value = original.clone();
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<Unknown>(
                "opaque",
                Arc::new(move |_, _| {
                    let value = value.clone();
                    Box::pin(async move { Ok(value) })
                }),
            )),
        );
        let null = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<Unknown>(
                "null",
                Arc::new(|_, _| Box::pin(async { Ok(None) })),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        let actual = handle_result(&handle).unwrap().unwrap();
        assert!(Arc::ptr_eq(
            actual.as_ref().unwrap(),
            original.as_ref().unwrap()
        ));
        assert_eq!(
            actual.as_ref().unwrap().downcast_ref::<Opaque>().unwrap().0,
            73
        );
        assert!(Arc::ptr_eq(
            values.lock().unwrap()[0].as_ref().unwrap(),
            original.as_ref().unwrap()
        ));
        assert!(values.lock().unwrap()[1].is_none());
        assert!(handle_result(&null).unwrap().unwrap().is_none());
    }
    #[test]
    fn streaming_completion_reuses_the_same_reports_array_and_preserves_report_object_identity() {
        let host = MockHost::new();
        let mut settings = options();
        settings.streaming = Some(true);
        let loader = loader(&host, Some(settings));
        let complete = observe_complete(&loader);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        host.run_ready();
        let first = complete.lock().unwrap().clone().unwrap();
        let report = first.read().unwrap()[0].clone();
        report.write().unwrap().bytes = 7.0;
        queue_resource_load(&loader, item("b", 2));
        host.run_ready();
        let second = complete.lock().unwrap().clone().unwrap();
        assert!(Arc::ptr_eq(&first, &second));
        assert!(Arc::ptr_eq(&report, &second.read().unwrap()[0]));
        assert_eq!(get_resource_load_bytes(&loader).bytes_loaded, 7.0);
    }
    #[test]
    fn zero_weights_use_item_fraction_and_groups_use_counts_even_when_global_progress_is_weighted()
    {
        for weights in [[0.0, 0.0], [99.0, 1.0]] {
            let host = MockHost::new();
            let mut settings = options();
            settings.max_concurrent = Some(1.0);
            let loader = loader(&host, Some(settings));
            for (i, weight) in weights.into_iter().enumerate() {
                let mut entry =
                    descriptor(&i.to_string(), Arc::new(|_, _| Box::pin(async { Ok(1) })));
                entry.weight = Some(weight);
                entry.group = Some("g".to_string());
                queue_resource_load(&loader, ResourceLoadInput::Item(entry));
            }
            start_resource_load(&loader);
            pause_resource_load(&loader);
            host.run_ready();
            assert_eq!(get_resource_load_progress(&loader, Some("g")), 0.5);
            assert_eq!(
                get_resource_load_progress(&loader, None),
                if weights[0] == 0.0 { 0.5 } else { 0.99 }
            );
        }
    }
    #[test]
    fn reported_total_is_only_callback_metadata_and_does_not_replace_the_source_hint() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (resolve, future) = deferred::<i32>();
        let mut entry = descriptor(
            "a",
            Arc::new(move |_, report| {
                report(600.0, Some(1200.0));
                Box::pin(future.clone())
            }),
        );
        entry.bytes_hint = Some(1000.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        start_resource_load(&loader);
        let bytes = get_resource_load_bytes(&loader);
        assert_eq!(
            (bytes.bytes_loaded, bytes.bytes_total_known),
            (600.0, 1000.0)
        );
        resolve(Ok(1));
        host.run_ready();
        let bytes = get_resource_load_bytes(&loader);
        assert_eq!(
            (bytes.bytes_loaded, bytes.bytes_total_known),
            (600.0, 600.0)
        );
    }
}

mod reentry {
    use super::*;
    #[test]
    fn item_start_can_pause_and_reenter_queries_without_any_sdk_lock_held() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let signals = enable_resource_loader_item_signals(&loader);
        let current = loader.clone();
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        connect_signal(
            &signals.read().unwrap().on_item_start,
            Arc::new(move |_| {
                assert!(current.try_write().is_ok());
                assert_eq!(get_resource_load_counts(&current).in_flight_items, 1);
                if count.fetch_add(1, Ordering::SeqCst) == 0 {
                    pause_resource_load(&current);
                }
            }),
            None,
        );
        queue_resource_load(&loader, item("a", 1));
        queue_resource_load(&loader, item("b", 2));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).queued_items, 1);
        resume_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).settled_items, 2);
        dispose_resource_loader(&loader);
    }
    #[test]
    fn item_start_reset_still_calls_the_original_factory_then_orphans_its_settlement() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let signals = enable_resource_loader_item_signals(&loader);
        let count = Arc::new(AtomicUsize::new(0));
        let starts = count.clone();
        let current = loader.clone();
        connect_signal(
            &signals.read().unwrap().on_item_start,
            Arc::new(move |_| {
                if starts.fetch_add(1, Ordering::SeqCst) == 0 {
                    reset_resource_loader(&current);
                    queue_resource_load(&current, item("fresh", 2));
                    start_resource_load(&current);
                }
            }),
            None,
        );
        let called = Arc::new(AtomicUsize::new(0));
        let calls = called.clone();
        let old = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "old",
                Arc::new(move |_, _| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async { Ok(1) })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(called.load(Ordering::SeqCst), 1);
        assert!(handle_result(&old).is_none());
        assert_eq!(
            reports(&complete)
                .iter()
                .map(|r| r.key.as_str())
                .collect::<Vec<_>>(),
            ["fresh"]
        );
        dispose_resource_loader(&loader);
    }
    #[test]
    fn progress_callback_can_reset_and_start_the_next_batch_without_polluting_it() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        let current = loader.clone();
        connect_signal(
            &loader.read().unwrap().on_progress,
            Arc::new(move |_| {
                if captured.fetch_add(1, Ordering::SeqCst) == 0 {
                    reset_resource_loader(&current);
                    queue_resource_load(&current, item("fresh", 2));
                    start_resource_load(&current);
                }
            }),
            None,
        );
        let old = queue_resource_load(&loader, item("old", 1));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(handle_result(&old).unwrap().unwrap(), 1);
        assert_eq!(get_resource_load_counts(&loader).total_items, 1);
        assert_eq!(reports(&complete)[0].key, "fresh");
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
        dispose_resource_loader(&loader);
    }
    #[test]
    fn custom_error_emitter_can_queue_streaming_work_and_preserves_failure_then_success_order() {
        let host = MockHost::new();
        let mut settings = options();
        settings.streaming = Some(true);
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let current = loader.clone();
        *loader.read().unwrap().on_error.emit.write().unwrap() = Arc::new(move |_| {
            assert!(current.try_write().is_ok());
            queue_resource_load(&current, item("fresh", 2));
        });
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "old",
                Arc::new(|_, _| Box::pin(async { Err(error("bad")) })),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            reports(&complete)
                .iter()
                .map(|r| r.status)
                .collect::<Vec<_>>(),
            [
                ResourceLoadReportStatus::Failed,
                ResourceLoadReportStatus::Loaded
            ]
        );
        dispose_resource_loader(&loader);
    }
    #[test]
    fn complete_callback_can_extend_a_stream_and_receives_the_same_live_array() {
        let host = MockHost::new();
        let mut settings = options();
        settings.streaming = Some(true);
        let loader = loader(&host, Some(settings));
        let arrays = Arc::new(Mutex::new(Vec::new()));
        let seen = arrays.clone();
        let current = loader.clone();
        connect_signal(
            &loader.read().unwrap().on_complete,
            Arc::new(move |reports| {
                let first = {
                    let mut seen = seen.lock().unwrap();
                    seen.push(reports.clone());
                    seen.len() == 1
                };
                if first {
                    queue_resource_load(&current, item("second", 2));
                }
            }),
            None,
        );
        queue_resource_load(&loader, item("first", 1));
        start_resource_load(&loader);
        host.run_ready();
        let arrays = arrays.lock().unwrap();
        assert_eq!(arrays.len(), 2);
        assert!(Arc::ptr_eq(&arrays[0], &arrays[1]));
        assert_eq!(arrays[0].read().unwrap().len(), 2);
        drop(arrays);
        dispose_resource_loader(&loader);
    }
    #[test]
    fn resume_callback_can_pause_again_before_the_queue_is_drained() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        queue_resource_load(&loader, item("a", 1));
        queue_resource_load(&loader, item("b", 2));
        start_resource_load(&loader);
        pause_resource_load(&loader);
        host.run_ready();
        let current = loader.clone();
        let slot = connect_signal(
            &loader.read().unwrap().on_resume,
            Arc::new(move |_| pause_resource_load(&current)),
            None,
        );
        resume_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).queued_items, 1);
        disconnect_signal(&loader.read().unwrap().on_resume, slot);
        resume_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).settled_items, 2);
        dispose_resource_loader(&loader);
    }
    #[test]
    fn context_keeps_its_original_timer_provider_across_external_rebinding() {
        let original = MockHost::new();
        let rebound = MockHost::new();
        let mut service = context(&original);
        let mut settings = options();
        settings.retries = Some(1.0);
        settings.retry_backoff = Some(ResourceLoaderRetryBackoff::Linear);
        settings.retry_base_delay_ms = Some(5.0);
        let settings = Arc::new(RwLock::new(settings));
        let loader = create_resource_loader(Some(&settings), &service);
        service.timers = rebound.timers();
        assert!(Arc::ptr_eq(
            &service.timers.provider,
            &rebound.timers().provider
        ));
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |_, _| {
                    let index = captured.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move {
                        if index == 0 {
                            Err(error("retry"))
                        } else {
                            Ok(1)
                        }
                    })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        original.run_ready();
        rebound.advance(100.0);
        assert!(complete.lock().unwrap().is_none());
        original.advance(5.0);
        assert_eq!(reports(&complete)[0].elapsed_ms, 5.0);
    }
}
