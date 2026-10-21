use crate::common::*;
use crate::mock_host::MockHost;
use flight_loader::contract::*;
use flight_signals::{connect_signal, has_signal_slots};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

mod cancel_resource_load {
    use super::*;
    #[test]
    fn aborts_in_flight_loads_and_emits_on_cancel() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (_, future) = deferred::<i32>();
        let seen_signal = Arc::new(Mutex::new(None));
        let captured = seen_signal.clone();
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |signal, _| {
                    *captured.lock().unwrap() = Some(signal);
                    Box::pin(future.clone())
                }),
            )),
        );
        let cancelled = Arc::new(AtomicUsize::new(0));
        let count = cancelled.clone();
        connect_signal(
            &loader.read().unwrap().on_cancel,
            Arc::new(move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        cancel_resource_load(&loader);
        host.run_ready();
        assert_eq!(cancelled.load(Ordering::SeqCst), 1);
        assert!(flight_stream::is_abort_signal_aborted(
            seen_signal.lock().unwrap().as_ref().unwrap()
        ));
        assert!(handle_result(&handle).unwrap().is_err());
        assert_eq!(
            reports(&complete)[0].status,
            ResourceLoadReportStatus::Cancelled
        );
    }
    #[test]
    fn cancels_before_start_and_settles_the_queued_handle() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let complete = observe_complete(&loader);
        let called = Arc::new(AtomicUsize::new(0));
        let captured = called.clone();
        connect_signal(
            &loader.read().unwrap().on_cancel,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        let handle = queue_resource_load(&loader, item("a", 1));
        cancel_resource_load(&loader);
        assert!(handle_result(&handle).unwrap().is_err());
        assert_eq!(called.load(Ordering::SeqCst), 1);
        let reports = reports(&complete);
        assert_eq!(reports[0].status, ResourceLoadReportStatus::Cancelled);
        assert_eq!(reports[0].attempts, 0);
    }
    #[test]
    fn emits_once_for_empty_cancel_and_second_call_is_a_noop() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        connect_signal(
            &loader.read().unwrap().on_cancel,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        cancel_resource_load(&loader);
        cancel_resource_load(&loader);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn already_cancelled_running_batch_does_not_emit_again() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        cancel_resource_load(&loader);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        connect_signal(
            &loader.read().unwrap().on_cancel,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        cancel_resource_load(&loader);
        host.run_ready();
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }
    #[test]
    fn weighted_cancelled_batch_reaches_one_even_when_factory_resolves_after_abort() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let (resolve, future) = deferred::<i32>();
        let mut slow = descriptor("slow", Arc::new(move |_, _| Box::pin(future.clone())));
        slow.weight = Some(3.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(slow));
        let mut waiting = descriptor("waiting", Arc::new(|_, _| Box::pin(async { Ok(2) })));
        waiting.weight = Some(7.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(waiting));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        cancel_resource_load(&loader);
        resolve(Ok(1));
        host.run_ready();
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
        assert_eq!(reports(&complete).len(), 2);
    }
}

mod create_resource_loader {
    use super::*;
    #[test]
    fn creates_all_six_required_signals_and_private_entity_runtime() {
        let host = MockHost::new();
        let loader = create_resource_loader(None, &context(&host));
        let mut loader = loader.write().unwrap();
        assert!(!has_signal_slots(&loader.on_cancel));
        assert!(!has_signal_slots(&loader.on_complete));
        assert!(!has_signal_slots(&loader.on_error));
        assert!(!has_signal_slots(&loader.on_pause));
        assert!(!has_signal_slots(&loader.on_progress));
        assert!(!has_signal_slots(&loader.on_resume));
        flight_entity::set_entity_uid(&mut *loader, "owned".to_string());
        assert_eq!(flight_entity::get_entity_uid(&mut *loader), "owned");
    }
    #[test]
    fn accepts_max_concurrent_and_error_policy_options() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(2.0);
        settings.error_policy = Some(ResourceLoaderErrorPolicy::FailFast);
        let settings = Arc::new(RwLock::new(settings));
        let loader = create_resource_loader(Some(&settings), &context(&host));
        assert_eq!(get_resource_load_counts(&loader).total_items, 0);
    }
}

mod dispose_resource_loader {
    use super::*;
    #[test]
    fn disconnects_all_loader_listeners_without_cancelling_future_work() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let called = Arc::new(AtomicUsize::new(0));
        {
            let loader = loader.read().unwrap();
            let count = called.clone();
            connect_signal(
                &loader.on_complete,
                Arc::new(move |_| {
                    count.fetch_add(1, Ordering::SeqCst);
                }),
                None,
            );
            let count = called.clone();
            connect_signal(
                &loader.on_progress,
                Arc::new(move |_| {
                    count.fetch_add(1, Ordering::SeqCst);
                }),
                None,
            );
        }
        dispose_resource_loader(&loader);
        let handle = queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(called.load(Ordering::SeqCst), 0);
        assert_eq!(handle_result(&handle).unwrap().unwrap(), 1);
    }
    #[test]
    fn disconnects_enabled_item_signal_listeners() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let items = enable_resource_loader_item_signals(&loader);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        connect_signal(
            &items.read().unwrap().on_item_start,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        dispose_resource_loader(&loader);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }
}

mod enable_resource_loader_item_signals {
    use super::*;
    #[test]
    fn creates_all_four_item_signals_and_returns_the_same_entity_each_time() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let first = enable_resource_loader_item_signals(&loader);
        let second = enable_resource_loader_item_signals(&loader);
        assert!(Arc::ptr_eq(&first, &second));
        let mut items = first.write().unwrap();
        assert!(!has_signal_slots(&items.on_item_complete));
        assert!(!has_signal_slots(&items.on_item_error));
        assert!(!has_signal_slots(&items.on_item_retry));
        assert!(!has_signal_slots(&items.on_item_start));
        flight_entity::set_entity_uid(&mut *items, "items".to_string());
        assert_eq!(flight_entity::get_entity_uid(&mut *items), "items");
    }
    #[test]
    fn fires_start_and_complete_for_each_successful_key() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let items = enable_resource_loader_item_signals(&loader);
        let starts = Arc::new(Mutex::new(Vec::new()));
        let ends = Arc::new(Mutex::new(Vec::new()));
        let captured = starts.clone();
        connect_signal(
            &items.read().unwrap().on_item_start,
            Arc::new(move |key| captured.lock().unwrap().push(key.clone())),
            None,
        );
        let captured = ends.clone();
        connect_signal(
            &items.read().unwrap().on_item_complete,
            Arc::new(move |(key, value)| {
                assert!(value.is_some());
                captured.lock().unwrap().push(key.clone());
            }),
            None,
        );
        queue_resource_load(&loader, item("a", 1));
        queue_resource_load(&loader, item("b", 2));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*starts.lock().unwrap(), ["a", "b"]);
        assert_eq!(*ends.lock().unwrap(), ["a", "b"]);
    }
    #[test]
    fn fires_item_error_with_key_original_error_and_attempt() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let items = enable_resource_loader_item_signals(&loader);
        let failures = Arc::new(Mutex::new(Vec::new()));
        let captured = failures.clone();
        connect_signal(
            &items.read().unwrap().on_item_error,
            Arc::new(move |event| captured.lock().unwrap().push(event.clone())),
            None,
        );
        let cause = error("oops");
        let captured = cause.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "fail",
                Arc::new(move |_, _| {
                    let cause = captured.clone();
                    Box::pin(async move { Err(cause) })
                }),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        let failures = failures.lock().unwrap();
        assert_eq!(failures.len(), 1);
        assert_eq!(failures[0].0, "fail");
        assert_eq!(failures[0].2, 1);
        assert!(Arc::ptr_eq(
            failures[0].1.as_ref().unwrap(),
            cause.as_ref().unwrap()
        ));
    }
}

mod get_resource_load_bytes {
    use super::*;
    #[test]
    fn returns_zeros_with_nothing_queued() {
        let host = MockHost::new();
        assert_eq!(
            get_resource_load_bytes(&loader(&host, None)),
            ResourceLoadBytes {
                bytes_loaded: 0.0,
                bytes_total_known: 0.0,
                items_with_known_bytes: 0
            }
        );
    }
    #[test]
    fn counts_only_hinted_queued_items_toward_known_bytes() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let mut known = descriptor("known", Arc::new(|_, _| Box::pin(async { Ok(1) })));
        known.bytes_hint = Some(1000.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(known));
        queue_resource_load(&loader, item("unknown", 2));
        assert_eq!(
            get_resource_load_bytes(&loader),
            ResourceLoadBytes {
                bytes_loaded: 0.0,
                bytes_total_known: 1000.0,
                items_with_known_bytes: 1
            }
        );
    }
    #[test]
    fn accumulates_reported_transfers_as_items_settle() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let mut known = descriptor(
            "known",
            Arc::new(|_, report| {
                report(8.0, Some(8.0));
                Box::pin(async { Ok("a") })
            }),
        );
        known.bytes_hint = Some(8.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(known));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_bytes(&loader).bytes_loaded, 8.0);
    }
    #[test]
    fn unknown_byte_totals_remain_valid_and_do_not_invent_a_denominator() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        host.run_ready();
        let bytes = get_resource_load_bytes(&loader);
        assert!(!bytes.bytes_total_known.is_nan());
        assert_eq!(bytes.items_with_known_bytes, 0);
    }
}

mod get_resource_load_counts {
    use super::*;
    #[test]
    fn returns_zeros_for_an_empty_loader() {
        let host = MockHost::new();
        assert_eq!(
            get_resource_load_counts(&loader(&host, None)),
            ResourceLoadCounts {
                settled_items: 0,
                in_flight_items: 0,
                queued_items: 0,
                total_items: 0
            }
        );
    }
    #[test]
    fn counts_queued_items_before_start() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("a", 1));
        queue_resource_load(&loader, item("b", 2));
        let counts = get_resource_load_counts(&loader);
        assert_eq!(
            (
                counts.queued_items,
                counts.total_items,
                counts.settled_items
            ),
            (2, 2, 0)
        );
    }
    #[test]
    fn separates_in_flight_from_waiting_under_a_concurrency_limit() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let (resolve, future) = deferred::<i32>();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        queue_resource_load(&loader, item("b", 2));
        queue_resource_load(&loader, item("c", 3));
        start_resource_load(&loader);
        let counts = get_resource_load_counts(&loader);
        assert_eq!(
            (
                counts.in_flight_items,
                counts.queued_items,
                counts.total_items
            ),
            (1, 2, 3)
        );
        resolve(Ok(1));
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).settled_items, 3);
    }
    #[test]
    fn counts_both_successes_and_failures_as_settled() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("ok", 1));
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "fail",
                Arc::new(|_, _| Box::pin(async { Err(error("nope")) })),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            get_resource_load_counts(&loader),
            ResourceLoadCounts {
                settled_items: 2,
                in_flight_items: 0,
                queued_items: 0,
                total_items: 2
            }
        );
    }
}

mod get_resource_load_item_status {
    use super::*;
    #[test]
    fn returns_pending_for_unstarted_and_unknown_keys() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("a", 1));
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Pending
        );
        assert_eq!(
            get_resource_load_item_status(&loader, "absent"),
            ResourceLoadItemStatus::Pending
        );
    }
    #[test]
    fn returns_loaded_after_success() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Loaded
        );
    }
    #[test]
    fn returns_failed_after_rejection() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "a",
                Arc::new(|_, _| Box::pin(async { Err(error("fail")) })),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Failed
        );
    }
}

mod get_resource_load_progress {
    use super::*;
    #[test]
    fn returns_zero_before_start_and_one_for_started_empty_batch() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        assert_eq!(get_resource_load_progress(&loader, None), 0.0);
        start_resource_load(&loader);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
    #[test]
    fn reports_fractional_progress_after_each_item_and_one_at_completion() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        connect_signal(
            &loader.read().unwrap().on_progress,
            Arc::new(move |value| captured.lock().unwrap().push(*value)),
            None,
        );
        for i in 0..3 {
            queue_resource_load(&loader, item(&i.to_string(), i));
        }
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*seen.lock().unwrap(), [1.0 / 3.0, 2.0 / 3.0, 1.0]);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
    #[test]
    fn filters_groups_and_keeps_missing_groups_at_zero() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        for group in ["preload", "level2"] {
            let mut entry = descriptor(group, Arc::new(|_, _| Box::pin(async { Ok(1) })));
            entry.group = Some(group.to_string());
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        }
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(get_resource_load_progress(&loader, Some("preload")), 1.0);
        assert_eq!(get_resource_load_progress(&loader, Some("level2")), 1.0);
        assert_eq!(get_resource_load_progress(&loader, Some("missing")), 0.0);
    }
}

mod initialize_resource_loader {
    use super::*;
    #[test]
    fn is_the_real_construction_initializer_and_reinitializes_existing_storage() {
        let host = MockHost::new();
        let mut out: ResourceLoader = flight_entity::allocate_entity();
        initialize_resource_loader(&mut out, None, &context(&host));
        let loader = Arc::new(RwLock::new(out));
        queue_resource_load(&loader, item("old", 1));
        initialize_resource_loader(&mut loader.write().unwrap(), None, &context(&host));
        assert_eq!(get_resource_load_counts(&loader).total_items, 0);
        assert_eq!(get_resource_load_progress(&loader, None), 0.0);
    }
}

mod pause_resource_load {
    use super::*;
    #[test]
    fn stops_dispatching_new_items_and_emits_pause() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let (resolve, future) = deferred::<i32>();
        let order = Arc::new(Mutex::new(Vec::new()));
        let seen = order.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "one",
                Arc::new(move |_, _| {
                    Box::pin({
                        let future = future.clone();
                        let seen = seen.clone();
                        async move {
                            let value = future.await?;
                            seen.lock().unwrap().push(value);
                            Ok(value)
                        }
                    })
                }),
            )),
        );
        let seen = order.clone();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "two",
                Arc::new(move |_, _| {
                    seen.lock().unwrap().push(2);
                    Box::pin(async { Ok(2) })
                }),
            )),
        );
        let paused = Arc::new(AtomicUsize::new(0));
        let seen = paused.clone();
        connect_signal(
            &loader.read().unwrap().on_pause,
            Arc::new(move |_| {
                seen.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        start_resource_load(&loader);
        pause_resource_load(&loader);
        resolve(Ok(1));
        host.run_ready();
        assert_eq!(*order.lock().unwrap(), [1]);
        assert_eq!(paused.load(Ordering::SeqCst), 1);
        assert_eq!(get_resource_load_counts(&loader).queued_items, 1);
    }
    #[test]
    fn is_a_noop_before_start_and_when_already_paused() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let seen = count.clone();
        connect_signal(
            &loader.read().unwrap().on_pause,
            Arc::new(move |_| {
                seen.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        pause_resource_load(&loader);
        assert_eq!(count.load(Ordering::SeqCst), 0);
        queue_resource_load(&loader, item("a", 1));
        start_resource_load(&loader);
        pause_resource_load(&loader);
        pause_resource_load(&loader);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
}

mod queue_resource_load {
    use super::*;
    #[test]
    fn accepts_thunks_and_item_descriptors_and_returns_the_key_and_stored_promise() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let thunk = queue_resource_load(
            &loader,
            ResourceLoadInput::Thunk(ResourceLoadThunk {
                load: Arc::new(|| Box::pin(async { Ok("hello") })),
            }),
        );
        let handle = queue_resource_load(&loader, item("myKey", 42));
        assert_eq!(handle.read().unwrap().key, "myKey");
        assert!(handle_result(&handle).is_none());
        assert!(thunk.read().unwrap().key.starts_with("__item_"));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(handle_result(&handle).unwrap().unwrap(), 42);
        assert_eq!(handle_result(&thunk).unwrap().unwrap(), "hello");
    }
    #[test]
    fn throws_the_source_error_after_non_streaming_start() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        start_resource_load(&loader);
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            queue_resource_load(&loader, item("a", 1));
        }))
        .unwrap_err()
        .downcast::<flight_entity::FlightError>()
        .unwrap();
        assert_eq!(
            error.message,
            "Cannot queue resources after loading has started"
        );
    }
    #[test]
    fn deduplicates_identical_keys_to_the_same_handle_and_executes_the_factory_once() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        let factory = Arc::new(
            move |_: flight_stream::AbortSignal,
                  _: ResourceLoadBytesReporter|
                  -> ResourceLoadFuture<String> {
                captured.fetch_add(1, Ordering::SeqCst);
                Box::pin(async { Ok("value".to_string()) })
            },
        );
        let first = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor("myAsset", factory.clone())),
        );
        let second = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor("myAsset", factory)),
        );
        assert!(Arc::ptr_eq(&first, &second));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(handle_result(&first).unwrap().unwrap(), "value");
    }
    #[test]
    fn does_not_deduplicate_when_disabled() {
        let host = MockHost::new();
        let mut settings = options();
        settings.dedupe = Some(false);
        let loader = loader(&host, Some(settings));
        let first = queue_resource_load(&loader, item("same", 1));
        let second = queue_resource_load(&loader, item("same", 2));
        assert!(!Arc::ptr_eq(&first, &second));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(handle_result(&first).unwrap().unwrap(), 1);
        assert_eq!(handle_result(&second).unwrap().unwrap(), 2);
        assert_eq!(get_resource_load_counts(&loader).settled_items, 2);
    }
    #[test]
    fn emits_progress_after_each_item_and_matches_the_weighted_accessor() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let current = loader.clone();
        connect_signal(
            &loader.read().unwrap().on_progress,
            Arc::new(move |value| {
                assert_eq!(*value, get_resource_load_progress(&current, None));
                captured.lock().unwrap().push(*value);
            }),
            None,
        );
        for (key, weight) in [("small", 1.0), ("big", 99.0)] {
            let mut entry = descriptor(key, Arc::new(|_, _| Box::pin(async { Ok(1) })));
            entry.weight = Some(weight);
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        }
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*seen.lock().unwrap(), [0.01, 1.0]);
        assert_eq!(reports(&complete).len(), 2);
    }
    #[test]
    fn emits_three_progress_ticks_and_complete_after_all_items_finish() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        connect_signal(
            &loader.read().unwrap().on_progress,
            Arc::new(move |value| captured.lock().unwrap().push(*value)),
            None,
        );
        let complete = observe_complete(&loader);
        for i in 0..3 {
            queue_resource_load(&loader, item(&i.to_string(), i));
        }
        start_resource_load(&loader);
        host.run_ready();
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[2], 1.0);
        assert_eq!(reports(&complete).len(), 3);
    }
    #[test]
    fn emits_original_error_and_key_but_still_completes_the_default_batch() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let errors = Arc::new(Mutex::new(Vec::new()));
        let captured = errors.clone();
        connect_signal(
            &loader.read().unwrap().on_error,
            Arc::new(move |event| captured.lock().unwrap().push(event.clone())),
            None,
        );
        let cause = error("oops");
        let copy = cause.clone();
        queue_resource_load(&loader, item("ok", 1));
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "fail",
                Arc::new(move |_, _| {
                    let cause = copy.clone();
                    Box::pin(async move { Err(cause) })
                }),
            )),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        let errors = errors.lock().unwrap();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].1, "fail");
        assert!(Arc::ptr_eq(
            errors[0].0.as_ref().unwrap(),
            cause.as_ref().unwrap()
        ));
        assert_eq!(
            errors[0]
                .0
                .as_ref()
                .unwrap()
                .downcast_ref::<flight_entity::FlightError>()
                .unwrap()
                .message,
            "oops"
        );
        assert_eq!(reports(&complete).len(), 2);
    }
    #[test]
    fn runs_parallel_items_in_completion_order_and_sequential_items_in_dispatch_order() {
        for (limit, expected) in [(0.0, vec![2, 1]), (1.0, vec![1, 2])] {
            let host = MockHost::new();
            let mut settings = options();
            settings.max_concurrent = Some(limit);
            let loader = loader(&host, Some(settings));
            let order = Arc::new(Mutex::new(Vec::new()));
            for (value, ms) in [(1, 20.0), (2, 5.0)] {
                let timers = host.timers();
                let order = order.clone();
                queue_resource_load(
                    &loader,
                    ResourceLoadInput::Item(descriptor(
                        &value.to_string(),
                        Arc::new(move |_, _| {
                            let (resolve, future) = deferred();
                            let order = order.clone();
                            (timers.set_timeout)(
                                ms,
                                Arc::new(move || {
                                    order.lock().unwrap().push(value);
                                    resolve(Ok(value));
                                }),
                            );
                            Box::pin(future)
                        }),
                    )),
                );
            }
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.advance(30.0);
            assert_eq!(*order.lock().unwrap(), expected);
            assert_eq!(reports(&complete).len(), 2);
        }
    }
    #[test]
    fn never_exceeds_max_concurrent() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(2.0);
        let loader = loader(&host, Some(settings));
        let current = Arc::new(AtomicUsize::new(0));
        let max = Arc::new(AtomicUsize::new(0));
        for i in 0..6 {
            let timers = host.timers();
            let current = current.clone();
            let max = max.clone();
            queue_resource_load(
                &loader,
                ResourceLoadInput::Item(descriptor(
                    &i.to_string(),
                    Arc::new(move |_, _| {
                        let active = current.fetch_add(1, Ordering::SeqCst) + 1;
                        max.fetch_max(active, Ordering::SeqCst);
                        let (resolve, future) = deferred();
                        let current = current.clone();
                        (timers.set_timeout)(
                            10.0,
                            Arc::new(move || {
                                current.fetch_sub(1, Ordering::SeqCst);
                                resolve(Ok(1));
                            }),
                        );
                        Box::pin(future)
                    }),
                )),
            );
        }
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.advance(30.0);
        assert_eq!(max.load(Ordering::SeqCst), 2);
        assert_eq!(reports(&complete).len(), 6);
    }
    #[test]
    fn hands_the_factory_a_byte_reporter_and_forwards_every_loaded_total_figure() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let events = Arc::new(Mutex::new(Vec::new()));
        let seen = events.clone();
        let mut entry = descriptor(
            "a",
            Arc::new(|_, report| {
                report(250.0, None);
                report(600.0, Some(1200.0));
                Box::pin(async { Ok("v") })
            }),
        );
        entry.bytes_hint = Some(1000.0);
        entry.on_bytes_progress = Some(Arc::new(move |loaded, total| {
            seen.lock().unwrap().push((loaded, total))
        }));
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*events.lock().unwrap(), [(250.0, 1000.0), (600.0, 1200.0)]);
        assert_eq!(reports(&complete)[0].bytes, 600.0);
    }
    #[test]
    fn falls_back_to_the_hint_and_records_the_last_byte_figure() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let totals = Arc::new(Mutex::new(Vec::new()));
        let seen = totals.clone();
        let mut entry = descriptor(
            "a",
            Arc::new(|_, report| {
                report(10.0, None);
                report(9000.0, None);
                Box::pin(async { Ok("v") })
            }),
        );
        entry.bytes_hint = Some(4096.0);
        entry.on_bytes_progress = Some(Arc::new(move |_, total| seen.lock().unwrap().push(total)));
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*totals.lock().unwrap(), [4096.0, 4096.0]);
        assert_eq!(reports(&complete)[0].bytes, 9000.0);
    }
    #[test]
    fn a_factory_that_reports_nothing_keeps_zero_bytes_and_never_synthesizes_progress_callbacks() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let events = Arc::new(Mutex::new(Vec::<(f32, f32)>::new()));
        let seen = events.clone();
        let mut entry = descriptor("file", Arc::new(|_, _| Box::pin(async { Ok("data") })));
        entry.on_bytes_progress = Some(Arc::new(move |loaded, total| {
            seen.lock().unwrap().push((loaded, total))
        }));
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        queue_resource_load(&loader, item("streaming", "streamed-data"));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        let reports = reports(&complete);
        assert_eq!(reports.len(), 2);
        assert!(reports.iter().all(|report| report.bytes == 0.0));
        assert!(reports[0].bytes >= 0.0);
        assert!(events.lock().unwrap().is_empty());
    }
    #[test]
    fn a_factory_can_ignore_the_additive_reporter_and_thunks_remain_compatible() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "one",
                Arc::new(|signal, _| {
                    Box::pin(async move { Ok(flight_stream::is_abort_signal_aborted(&signal)) })
                }),
            )),
        );
        queue_resource_load(
            &loader,
            ResourceLoadInput::Thunk(ResourceLoadThunk {
                load: Arc::new(|| Box::pin(async { Ok("thunk") })),
            }),
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert!(
            reports(&complete)
                .iter()
                .all(|report| report.status == ResourceLoadReportStatus::Loaded
                    && report.bytes == 0.0)
        );
    }
    #[test]
    fn ignores_late_reports_after_settlement_and_after_recycling_the_record() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let reporter = Arc::new(Mutex::new(None::<ResourceLoadBytesReporter>));
        let saved = reporter.clone();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        let mut entry = descriptor(
            "a",
            Arc::new(move |_, report| {
                report(5.0, None);
                *saved.lock().unwrap() = Some(report);
                Box::pin(async { Ok(1) })
            }),
        );
        entry.bytes_hint = Some(100.0);
        entry.on_bytes_progress = Some(Arc::new(move |loaded, _| {
            captured.lock().unwrap().push(loaded)
        }));
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        let late = reporter.lock().unwrap().clone().unwrap();
        late(999.0, None);
        assert_eq!(*seen.lock().unwrap(), [5.0]);
        assert_eq!(reports(&complete)[0].bytes, 5.0);
        reset_resource_loader(&loader);
        let mut next = descriptor(
            "b",
            Arc::new(move |_, report| {
                report(11.0, None);
                late(999999.0, None);
                Box::pin(async { Ok(2) })
            }),
        );
        next.bytes_hint = Some(20.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(next));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(reports(&complete)[0].key, "b");
        assert_eq!(reports(&complete)[0].bytes, 11.0);
    }
    #[test]
    fn retries_rejections_the_exact_number_of_times_and_resolves_when_a_retry_succeeds() {
        for succeed in [false, true] {
            let host = MockHost::new();
            let loader = loader(&host, None);
            let attempts = Arc::new(AtomicUsize::new(0));
            let count = attempts.clone();
            let mut entry = descriptor(
                "a",
                Arc::new(move |_, _| {
                    let index = count.fetch_add(1, Ordering::SeqCst);
                    Box::pin(async move {
                        if succeed && index == 2 {
                            Ok("success")
                        } else {
                            Err(error("transient"))
                        }
                    })
                }),
            );
            entry.retries = Some(if succeed { 3.0 } else { 2.0 });
            let handle = queue_resource_load(&loader, ResourceLoadInput::Item(entry));
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.run_ready();
            assert_eq!(attempts.load(Ordering::SeqCst), 3);
            assert_eq!(reports(&complete)[0].attempts, 3);
            if succeed {
                assert_eq!(handle_result(&handle).unwrap().unwrap(), "success");
            } else {
                assert!(handle_result(&handle).unwrap().is_err());
            }
        }
    }
}

mod reset_resource_loader {
    use super::*;
    #[test]
    fn reuses_the_loader_for_new_batches_and_resets_progress() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let complete = observe_complete(&loader);
        for batch in 0..3 {
            reset_resource_loader(&loader);
            assert_eq!(get_resource_load_progress(&loader, None), 0.0);
            for i in 0..4 {
                queue_resource_load(&loader, item(&format!("batch{batch}-item{i}"), i));
            }
            start_resource_load(&loader);
            host.run_ready();
            let reports = reports(&complete);
            assert_eq!(reports.len(), 4);
            assert!(
                reports
                    .iter()
                    .all(|report| report.status == ResourceLoadReportStatus::Loaded)
            );
        }
    }
    #[test]
    fn recycled_entries_keep_new_resolvers_instead_of_old_promises() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (resolve, future) = deferred::<String>();
        let first = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "first",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        start_resource_load(&loader);
        resolve(Ok("first".to_string()));
        host.run_ready();
        assert_eq!(handle_result(&first).unwrap().unwrap(), "first");
        reset_resource_loader(&loader);
        let second = queue_resource_load(&loader, item("second", "second".to_string()));
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(handle_result(&second).unwrap().unwrap(), "second");
        assert_eq!(handle_result(&first).unwrap().unwrap(), "first");
    }
    #[test]
    fn discards_stale_successes_without_phantom_errors_or_reports_in_the_new_batch() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let errors = Arc::new(Mutex::new(Vec::new()));
        let captured = errors.clone();
        connect_signal(
            &loader.read().unwrap().on_error,
            Arc::new(move |(_, key)| captured.lock().unwrap().push(key.clone())),
            None,
        );
        let (resolve, future) = deferred::<String>();
        let stale = queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "stale",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        reset_resource_loader(&loader);
        queue_resource_load(&loader, item("fresh", "ok"));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        resolve(Ok("late".to_string()));
        host.run_ready();
        assert!(errors.lock().unwrap().is_empty());
        assert_eq!(
            reports(&complete)
                .iter()
                .map(|report| report.key.as_str())
                .collect::<Vec<_>>(),
            ["fresh"]
        );
        assert!(handle_result(&stale).is_none());
    }
    #[test]
    fn stale_rejections_do_not_inflate_new_batch_counts_or_weighted_progress() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let (reject, future) = deferred::<i32>();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "stale",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        start_resource_load(&loader);
        host.run_ready();
        reset_resource_loader(&loader);
        queue_resource_load(&loader, item("one", 1));
        queue_resource_load(&loader, item("two", 2));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        reject(Err(error("late")));
        host.run_ready();
        assert_eq!(reports(&complete).len(), 2);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
        assert_eq!(get_resource_load_counts(&loader).settled_items, 2);
    }
    #[test]
    fn resets_the_bucket_to_full_capacity_for_the_next_batch() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_bytes_per_second = Some(500.0);
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        for batch in 0..2 {
            if batch > 0 {
                reset_resource_loader(&loader);
            }
            let start = host.now();
            let mut entry = descriptor("a", Arc::new(|_, _| Box::pin(async { Ok(1) })));
            entry.bytes_hint = Some(500.0);
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.run_ready();
            assert_eq!(reports(&complete).len(), 1);
            assert_eq!(
                reports(&complete)[0].status,
                ResourceLoadReportStatus::Loaded
            );
            assert!(host.now() - start < 200.0);
        }
    }
}

mod resume_resource_load {
    use super::*;
    #[test]
    fn emits_resume_and_dispatches_remaining_work() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let (resolve, future) = deferred::<i32>();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "a",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        queue_resource_load(&loader, item("b", 2));
        let complete = observe_complete(&loader);
        let resumed = Arc::new(AtomicUsize::new(0));
        let captured = resumed.clone();
        connect_signal(
            &loader.read().unwrap().on_resume,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        start_resource_load(&loader);
        pause_resource_load(&loader);
        resolve(Ok(1));
        host.run_ready();
        assert!(complete.lock().unwrap().is_none());
        resume_resource_load(&loader);
        host.run_ready();
        assert_eq!(resumed.load(Ordering::SeqCst), 1);
        assert_eq!(reports(&complete).len(), 2);
    }
    #[test]
    fn is_a_noop_when_not_paused() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        connect_signal(
            &loader.read().unwrap().on_resume,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        resume_resource_load(&loader);
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }
}

mod set_resource_load_priority {
    use super::*;
    #[test]
    fn boosts_a_pending_item_and_preserves_stable_order_for_equal_priorities() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let order = Arc::new(Mutex::new(Vec::new()));
        for key in ["low", "high", "equal"] {
            let order = order.clone();
            queue_resource_load(
                &loader,
                ResourceLoadInput::Item(descriptor(
                    key,
                    Arc::new(move |_, _| {
                        order.lock().unwrap().push(key);
                        Box::pin(async { Ok(1) })
                    }),
                )),
            );
        }
        set_resource_load_priority(&loader, "high", 10.0);
        set_resource_load_priority(&loader, "missing", 99.0);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(*order.lock().unwrap(), ["high", "low", "equal"]);
    }
}

mod set_resource_loader_concurrency {
    use super::*;
    #[test]
    fn increasing_concurrency_on_a_running_loader_drains_new_slots_immediately() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let (_, future) = deferred::<i32>();
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor(
                "slow",
                Arc::new(move |_, _| Box::pin(future.clone())),
            )),
        );
        queue_resource_load(&loader, item("b", 2));
        queue_resource_load(&loader, item("c", 3));
        start_resource_load(&loader);
        assert_eq!(get_resource_load_counts(&loader).in_flight_items, 1);
        set_resource_loader_concurrency(&loader, 4.0);
        assert_eq!(get_resource_load_counts(&loader).in_flight_items, 3);
        host.run_ready();
        assert_eq!(get_resource_load_counts(&loader).settled_items, 2);
    }
}

mod start_resource_load {
    use super::*;
    #[test]
    fn empty_start_immediately_emits_progress_one_and_an_empty_reports_array() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let progress = Arc::new(Mutex::new(None));
        let captured = progress.clone();
        connect_signal(
            &loader.read().unwrap().on_progress,
            Arc::new(move |value| *captured.lock().unwrap() = Some(*value)),
            None,
        );
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        assert_eq!(*progress.lock().unwrap(), Some(1.0));
        assert!(reports(&complete).is_empty());
    }
    #[test]
    fn repeated_non_streaming_start_is_a_noop() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let count = Arc::new(AtomicUsize::new(0));
        let captured = count.clone();
        connect_signal(
            &loader.read().unwrap().on_complete,
            Arc::new(move |_| {
                captured.fetch_add(1, Ordering::SeqCst);
            }),
            None,
        );
        start_resource_load(&loader);
        start_resource_load(&loader);
        assert_eq!(count.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn complete_receives_the_report_array_and_streaming_accepts_new_items_after_start() {
        let host = MockHost::new();
        let mut settings = options();
        settings.streaming = Some(true);
        let loader = loader(&host, Some(settings));
        start_resource_load(&loader);
        let complete = observe_complete(&loader);
        let handle = queue_resource_load(&loader, item("a", "streamed"));
        host.run_ready();
        assert_eq!(handle_result(&handle).unwrap().unwrap(), "streamed");
        let reports = reports(&complete);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].key, "a");
        assert_eq!(reports[0].status, ResourceLoadReportStatus::Loaded);
    }
    #[test]
    fn missing_bandwidth_limit_does_not_throttle_and_zero_hints_are_free_with_a_limit() {
        for limit in [None, Some(100.0)] {
            let host = MockHost::new();
            let mut settings = options();
            settings.max_concurrent = Some(0.0);
            settings.max_bytes_per_second = limit;
            let loader = loader(&host, Some(settings));
            for i in 0..4 {
                let mut entry =
                    descriptor(&i.to_string(), Arc::new(|_, _| Box::pin(async { Ok(1) })));
                entry.bytes_hint = Some(0.0);
                queue_resource_load(&loader, ResourceLoadInput::Item(entry));
            }
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.run_ready();
            assert_eq!(reports(&complete).len(), 4);
            assert!(
                reports(&complete)
                    .iter()
                    .all(|report| report.status == ResourceLoadReportStatus::Loaded)
            );
            assert_eq!(host.timer_count(), 0);
        }
    }
    #[test]
    fn throttles_by_dispatch_budget_and_observes_two_refill_windows() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_bytes_per_second = Some(1000.0);
        settings.max_concurrent = Some(4.0);
        let loader = loader(&host, Some(settings));
        let times = Arc::new(Mutex::new(Vec::new()));
        for i in 0..3 {
            let times = times.clone();
            let timers = host.timers();
            let mut entry = descriptor(
                &i.to_string(),
                Arc::new(move |_, _| {
                    times.lock().unwrap().push((timers.now_ms)());
                    Box::pin(async { Ok(1) })
                }),
            );
            entry.bytes_hint = Some(1000.0);
            queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        }
        let complete = observe_complete(&loader);
        let start = host.now();
        start_resource_load(&loader);
        host.advance(50.0);
        assert!(times.lock().unwrap().len() <= 1);
        assert!(complete.lock().unwrap().is_none());
        host.advance(1950.0);
        let reports = reports(&complete);
        assert_eq!(reports.len(), 3);
        assert!(
            reports
                .iter()
                .all(|report| report.status == ResourceLoadReportStatus::Loaded)
        );
        assert!(host.now() - start >= 1800.0);
        assert!(reports.iter().all(|report| report.bytes == 0.0));
        assert_eq!(*times.lock().unwrap(), [0.0, 1000.0, 2000.0]);
    }
    #[test]
    fn hints_still_gate_throttle_when_factories_never_report_bytes() {
        let host = MockHost::new();
        let mut settings = options();
        settings.max_bytes_per_second = Some(1000.0);
        let loader = loader(&host, Some(settings));
        let mut entry = descriptor("a", Arc::new(|_, _| Box::pin(async { Ok("v") })));
        entry.bytes_hint = Some(10.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(
            reports(&complete)[0].status,
            ResourceLoadReportStatus::Loaded
        );
    }
    #[test]
    fn continue_policy_finishes_other_items_after_a_failure_and_weights_all_outcomes() {
        let host = MockHost::new();
        let mut settings = options();
        settings.error_policy = Some(ResourceLoaderErrorPolicy::Continue);
        let loader = loader(&host, Some(settings));
        queue_resource_load(
            &loader,
            ResourceLoadInput::Item(descriptor::<i32>(
                "fail",
                Arc::new(|_, _| Box::pin(async { Err(error("fail")) })),
            )),
        );
        queue_resource_load(&loader, item("ok", 1));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        let reports = reports(&complete);
        assert_eq!(reports.len(), 2);
        assert!(
            reports
                .iter()
                .any(|report| report.status == ResourceLoadReportStatus::Failed)
        );
        assert!(
            reports
                .iter()
                .any(|report| report.status == ResourceLoadReportStatus::Loaded)
        );
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
    #[test]
    fn fail_fast_skips_only_pending_items_and_allows_in_flight_peers_to_finish() {
        for limit in [1.0, 2.0] {
            let host = MockHost::new();
            let mut settings = options();
            settings.error_policy = Some(ResourceLoaderErrorPolicy::FailFast);
            settings.max_concurrent = Some(limit);
            let loader = loader(&host, Some(settings));
            let (resolve, future) = deferred::<String>();
            queue_resource_load(
                &loader,
                ResourceLoadInput::Item(descriptor::<String>(
                    "fail",
                    Arc::new(|_, _| Box::pin(async { Err(error("err")) })),
                )),
            );
            let slow = queue_resource_load(
                &loader,
                ResourceLoadInput::Item(descriptor(
                    "slow",
                    Arc::new(move |_, _| Box::pin(future.clone())),
                )),
            );
            queue_resource_load(&loader, item("pending", "never"));
            let complete = observe_complete(&loader);
            start_resource_load(&loader);
            host.run_ready();
            resolve(Ok("ok".to_string()));
            host.run_ready();
            let reports = reports(&complete);
            assert_eq!(
                reports.iter().find(|r| r.key == "fail").unwrap().status,
                ResourceLoadReportStatus::Failed
            );
            assert_eq!(
                reports.iter().find(|r| r.key == "pending").unwrap().status,
                ResourceLoadReportStatus::Skipped
            );
            if limit == 2.0 {
                assert_eq!(
                    reports.iter().find(|r| r.key == "slow").unwrap().status,
                    ResourceLoadReportStatus::Loaded
                );
                assert_eq!(handle_result(&slow).unwrap().unwrap(), "ok");
            } else {
                assert_eq!(
                    reports.iter().find(|r| r.key == "slow").unwrap().status,
                    ResourceLoadReportStatus::Skipped
                );
            }
            assert_eq!(get_resource_load_progress(&loader, None), 1.0);
        }
    }
    #[test]
    fn timeout_rejects_a_non_cooperative_factory_with_the_exact_timeout_reason() {
        let host = MockHost::new();
        let loader = loader(&host, None);
        let timers = host.timers();
        let mut entry = descriptor(
            "slow",
            Arc::new(move |_, _| {
                let (resolve, future) = deferred();
                (timers.set_timeout)(500.0, Arc::new(move || resolve(Ok(1))));
                Box::pin(future)
            }),
        );
        entry.timeout_ms = Some(20.0);
        entry.retries = Some(3.0);
        let handle = queue_resource_load(&loader, ResourceLoadInput::Item(entry));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.advance(20.0);
        let failure = handle_result(&handle).unwrap().unwrap_err().unwrap();
        let error = failure.downcast_ref::<flight_stream::AbortError>().unwrap();
        assert_eq!(
            (&*error.name, &*error.message),
            ("TimeoutError", "Load timed out")
        );
        assert_eq!(reports(&complete)[0].attempts, 1);
        host.advance(480.0);
        assert_eq!(reports(&complete).len(), 1);
    }
    #[test]
    fn weighted_progress_uses_ten_and_ninety_and_counts_a_heavy_failure_at_its_own_weight() {
        for failed in [false, true] {
            let host = MockHost::new();
            let mut settings = options();
            settings.max_concurrent = Some(1.0);
            let loader = loader(&host, Some(settings));
            let seen = Arc::new(Mutex::new(Vec::new()));
            let captured = seen.clone();
            let current = loader.clone();
            connect_signal(
                &loader.read().unwrap().on_progress,
                Arc::new(move |_| {
                    captured
                        .lock()
                        .unwrap()
                        .push(get_resource_load_progress(&current, None))
                }),
                None,
            );
            let mut first = descriptor(
                "a",
                Arc::new(move |_, _| {
                    Box::pin(async move { if failed { Err(error("boom")) } else { Ok(1) } })
                }),
            );
            first.weight = Some(if failed { 90.0 } else { 10.0 });
            let mut second = descriptor("b", Arc::new(|_, _| Box::pin(async { Ok(2) })));
            second.weight = Some(if failed { 10.0 } else { 90.0 });
            queue_resource_load(&loader, ResourceLoadInput::Item(first));
            queue_resource_load(&loader, ResourceLoadInput::Item(second));
            start_resource_load(&loader);
            host.run_ready();
            let seen = seen.lock().unwrap();
            assert!((seen[0] - if failed { 0.9 } else { 0.1 }).abs() < 0.00001);
            assert_eq!(seen[1], 1.0);
        }
    }
    #[test]
    fn weighted_fail_fast_skips_reach_one_after_the_batch_finishes() {
        let host = MockHost::new();
        let mut settings = options();
        settings.error_policy = Some(ResourceLoaderErrorPolicy::FailFast);
        settings.max_concurrent = Some(1.0);
        let loader = loader(&host, Some(settings));
        let mut first =
            descriptor::<i32>("a", Arc::new(|_, _| Box::pin(async { Err(error("boom")) })));
        first.weight = Some(5.0);
        let mut second = descriptor("b", Arc::new(|_, _| Box::pin(async { Ok(1) })));
        second.weight = Some(5.0);
        queue_resource_load(&loader, ResourceLoadInput::Item(first));
        queue_resource_load(&loader, ResourceLoadInput::Item(second));
        let complete = observe_complete(&loader);
        start_resource_load(&loader);
        host.run_ready();
        assert_eq!(reports(&complete).len(), 2);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }
}
