use crate::common::*;
use crate::mock_host::MockHost;
use flight_assets::contract::*;
use flight_entity::{FlightError, FlightErrorKind, Ref, Unknown};
use flight_signals::create_signal;
use std::sync::{Arc, Mutex, RwLock};

mod catalog {
    use super::*;
    #[test]
    fn manifest_last_duplicate_wins_and_all_replacements_are_preflighted_before_mutation() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "held");
        let pending = acquire(&library, "held");
        let changed = descriptor("held", &["changed"]);
        changed.write().unwrap().url = "invalid.bin".to_string();
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            register_asset_manifest(
                &library,
                &vec![descriptor("new", &["new"]), changed.clone()],
            )
        }))
        .unwrap_err();
        assert!(
            error
                .downcast_ref::<FlightError>()
                .unwrap()
                .message
                .contains("cannot replace acquired descriptor")
        );
        assert_eq!(
            explain_asset_load(&library, "new").status,
            AssetLoadStatus::MissingDescriptor
        );
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "new");
        assert!(actual_ids.is_empty());
        register_asset_manifest(
            &library,
            &vec![changed, descriptor("new", &["g"]), descriptor("held", &[])],
        );
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "g");
        assert_eq!(actual_ids, ["new"]);
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
    }
    #[test]
    fn equivalent_acquired_groups_ignore_duplicates_and_order_without_replacing_the_stored_descriptor()
     {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_descriptor(&library, &descriptor("a", &["x", "y"]));
        let stored = library
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .descriptors["a"]
            .clone();
        let pending = acquire(&library, "a");
        register_asset_descriptor(&library, &descriptor("a", &["y", "x", "y"]));
        let actual = library
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .descriptors["a"]
            .clone();
        assert!(Arc::ptr_eq(&stored, &actual));
        assert_eq!(
            actual.read().unwrap().groups,
            Some(vec!["x".to_string(), "y".to_string()])
        );
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
    }
    #[test]
    fn snapshots_stay_detached_and_reacquisition_moves_a_freed_id_to_the_end() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_manifest(&library, &vec![descriptor("a", &[]), descriptor("b", &[])]);
        let a = acquire(&library, "a");
        let b = acquire(&library, "b");
        let mut ids = Vec::new();
        get_asset_ids(&mut ids, &library);
        ids.clear();
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert_eq!(actual_ids, ["a", "b"]);
        release_asset(&library, "a");
        let fresh = acquire(&library, "a");
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert_eq!(actual_ids, ["b", "a"]);
        flush(&mock, &host);
        assert!(result(&a).unwrap().is_ok());
        assert!(result(&b).unwrap().is_ok());
        assert!(result(&fresh).unwrap().is_ok());
    }
}
mod failures {
    use super::*;
    #[test]
    fn concurrent_rejections_keep_the_actual_error_and_evict_the_shared_entry() {
        let host = MockHost::new();
        let library = library(&host);
        let (settle, future) = deferred::<Unknown>();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| Box::pin(future.clone())),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &[]));
        let first = acquire_asset::<Unknown>(&library, "a");
        let second = acquire_asset::<Unknown>(&library, "a");
        assert!(first.ptr_eq(&second));
        assert_eq!(get_asset_ref_count(&library, "a"), 2);
        let error = failure("same rejection");
        settle(Err(error.clone()));
        host.run_ready();
        let a = result(&first).unwrap().unwrap_err().unwrap();
        let b = result(&second).unwrap().unwrap_err().unwrap();
        assert!(Arc::ptr_eq(&a, error.as_ref().unwrap()));
        assert!(Arc::ptr_eq(&a, &b));
        assert_eq!(get_asset_ref_count(&library, "a"), 0);
        assert_eq!(
            explain_asset_load(&library, "a").status,
            AssetLoadStatus::NeverAcquired
        );
    }
    #[test]
    fn synchronous_adapter_throw_keeps_the_source_half_entry_then_raises_the_approved_programmer_error()
     {
        let host = MockHost::new();
        let library = library(&host);
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter::<Unknown> {
            load: Arc::new(|_| flight_entity::throw_error("sync load")),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &[]));
        let first = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            acquire_asset::<Unknown>(&library, "a")
        }))
        .unwrap_err();
        assert_eq!(
            first.downcast_ref::<FlightError>().unwrap().message,
            "sync load"
        );
        let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            acquire_asset::<Unknown>(&library, "a")
        }))
        .unwrap_err();
        assert_eq!(
            second.downcast_ref::<FlightError>().unwrap().message,
            "assets: acquire for \"a\" re-entered before its load promise was initialized"
        );
        assert_eq!(get_asset_ref_count(&library, "a"), 2);
        let runtime = library.read().unwrap().library_runtime.clone();
        let entry = runtime.read().unwrap().entries["a"].clone();
        assert!(!entry.read().unwrap().resident);
        assert!(entry.read().unwrap().load_promise.is_none());
        release_asset(&library, "a");
        release_asset(&library, "a");
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn synchronous_same_id_reentry_uses_the_approved_programmer_failure_without_poisoning_the_outer_load()
     {
        let host = MockHost::new();
        let library = library(&host);
        let current = library.clone();
        let saw = Arc::new(Mutex::new(false));
        let captured = saw.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| {
                let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    acquire_asset::<Unknown>(&current, "a")
                }))
                .unwrap_err();
                assert!(
                    error
                        .downcast_ref::<FlightError>()
                        .unwrap()
                        .message
                        .contains("before its load promise was initialized")
                );
                *captured.lock().unwrap() = true;
                Box::pin(async { Ok(1_i32) })
            }),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &[]));
        let promise = acquire_asset::<i32>(&library, "a");
        host.run_ready();
        assert_eq!(result(&promise).unwrap().unwrap(), 1);
        assert!(*saw.lock().unwrap());
        assert_eq!(get_asset_ref_count(&library, "a"), 2);
        dispose_asset_library(&library);
    }
    #[test]
    fn orphan_disposer_throw_rejects_the_returned_promise_without_recreating_a_cache_entry() {
        let host = MockHost::new();
        let library = library(&host);
        let (settle, future) = deferred::<i32>();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| Box::pin(future.clone())),
            dispose: Arc::new(|_| flight_entity::throw_error("orphan free")),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &[]));
        let promise = acquire_asset::<i32>(&library, "a");
        release_asset(&library, "a");
        settle(Ok(7));
        host.run_ready();
        assert_eq!(
            error_message(&result(&promise).unwrap().unwrap_err()),
            "orphan free"
        );
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
        assert_eq!(
            explain_asset_load(&library, "a").status,
            AssetLoadStatus::Freed
        );
    }
}
mod group {
    use super::*;
    #[test]
    fn resident_members_take_extra_holds_without_new_loads_and_empty_scheduler_progress_is_zero_of_zero()
     {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_descriptor(&library, &descriptor("a", &["g"]));
        let promise = acquire(&library, "a");
        flush(&mock, &host);
        assert!(result(&promise).unwrap().is_ok());
        let ticks = Arc::new(Mutex::new(Vec::new()));
        let seen = ticks.clone();
        let signal = create_signal::<Ref<AssetLoadProgress>>();
        *signal.emit.write().unwrap() =
            Arc::new(move |progress| seen.lock().unwrap().push(progress.read().unwrap().clone()));
        let options = Arc::new(RwLock::new(AssetGroupLoadOptions {
            progress: Some(Arc::new(RwLock::new(signal))),
        }));
        let done = load_asset_group(&library, "g", Some(&options));
        assert_eq!(get_asset_ref_count(&library, "a"), 2);
        host.run_ready();
        assert!(result(&done).unwrap().is_ok());
        assert_eq!(*mock.calls.lock().unwrap(), 1);
        assert_eq!(
            *ticks.lock().unwrap(),
            [AssetLoadProgress {
                loaded: 0,
                total: 0
            }]
        );
        release_asset_group(&library, "g");
        assert_eq!(get_asset_ref_count(&library, "a"), 1);
        assert!(mock.disposed.lock().unwrap().is_empty());
        release_asset(&library, "a");
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
    }
    #[test]
    fn waits_for_every_settlement_and_rejects_the_first_failed_member_in_group_order() {
        let host = MockHost::new();
        let library = library(&host);
        let (a, fa) = deferred::<Unknown>();
        let (b, fb) = deferred::<Unknown>();
        let (good, fg) = deferred::<Unknown>();
        let freed = Arc::new(Mutex::new(0));
        let count = freed.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |descriptor| {
                let id = descriptor.read().unwrap().id.clone();
                let future = match id.as_str() {
                    "a" => fa.clone(),
                    "b" => fb.clone(),
                    _ => fg.clone(),
                };
                Box::pin(future)
            }),
            dispose: Arc::new(move |_| *count.lock().unwrap() += 1),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_manifest(
            &library,
            &vec![
                descriptor("a", &["g"]),
                descriptor("b", &["g"]),
                descriptor("good", &["g"]),
            ],
        );
        let done = load_asset_group(&library, "g", None);
        b(Err(failure("second member finished first")));
        host.run_ready();
        assert!(result(&done).is_none());
        let value: Unknown = Some(Arc::new("resident".to_string()));
        good(Ok(value.clone()));
        host.run_ready();
        assert!(result(&done).is_none());
        let first = failure("first member finished last");
        a(Err(first.clone()));
        host.run_ready();
        let error = result(&done).unwrap().unwrap_err().unwrap();
        assert!(Arc::ptr_eq(&error, first.as_ref().unwrap()));
        assert!(Arc::ptr_eq(
            get_asset::<Unknown>(&library, "good")
                .unwrap()
                .as_ref()
                .unwrap(),
            value.as_ref().unwrap()
        ));
        assert_eq!(get_asset_ref_count(&library, "good"), 1);
        release_asset_group(&library, "g");
        assert_eq!(*freed.lock().unwrap(), 1);
    }
    #[test]
    fn progress_uses_the_captured_signal_custom_emitter_and_can_reenter_without_any_record_lock() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_descriptor(&library, &descriptor("a", &["g"]));
        let signal = Arc::new(RwLock::new(create_signal::<Ref<AssetLoadProgress>>()));
        let current = library.clone();
        let target = signal.clone();
        let events = Arc::new(Mutex::new(Vec::new()));
        let seen = events.clone();
        *signal.read().unwrap().emit.write().unwrap() = Arc::new(move |value| {
            assert!(current.try_write().is_ok());
            assert!(target.try_write().is_ok());
            let runtime = current.read().unwrap().library_runtime.clone();
            assert!(runtime.try_write().is_ok());
            register_asset_descriptor(&current, &descriptor("extra", &[]));
            seen.lock().unwrap().push(value.clone());
        });
        let options = Arc::new(RwLock::new(AssetGroupLoadOptions {
            progress: Some(signal.clone()),
        }));
        let done = load_asset_group(&library, "g", Some(&options));
        options.write().unwrap().progress = None;
        flush(&mock, &host);
        assert!(result(&done).unwrap().is_ok());
        assert_eq!(events.lock().unwrap().len(), 1);
        assert_eq!(
            *events.lock().unwrap()[0].read().unwrap(),
            AssetLoadProgress {
                loaded: 1,
                total: 1
            }
        );
        assert_eq!(
            explain_asset_load(&library, "extra").status,
            AssetLoadStatus::NeverAcquired
        );
        *signal.read().unwrap().emit.write().unwrap() = Arc::new(|_| {});
    }
}
mod identity {
    use super::*;
    #[test]
    fn undefined_pending_value_is_distinct_from_a_successfully_loaded_null() {
        let host = MockHost::new();
        let library = library(&host);
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter::<Unknown> {
            load: Arc::new(|_| Box::pin(async { Ok(None) })),
            dispose: Arc::new(|value| assert!(value.is_none())),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("null", &[]));
        let first = acquire_asset::<Unknown>(&library, "null");
        let second = acquire_asset::<Unknown>(&library, "null");
        assert!(first.ptr_eq(&second));
        let runtime = library.read().unwrap().library_runtime.clone();
        let entry = runtime.read().unwrap().entries["null"].clone();
        assert!(entry.read().unwrap().value.is_none());
        assert!(get_asset::<Unknown>(&library, "null").is_none());
        host.run_ready();
        assert!(result(&first).unwrap().unwrap().is_none());
        assert!(entry.read().unwrap().value.as_ref().unwrap().is_none());
        assert!(entry.read().unwrap().resident);
        assert!(entry.read().unwrap().load_promise.is_none());
        assert!(matches!(get_asset::<Unknown>(&library, "null"), Some(None)));
        release_asset(&library, "null");
        release_asset(&library, "null");
    }
    #[test]
    fn passes_the_original_stored_descriptor_and_reads_live_fields_of_the_actual_registered_adapter()
     {
        let host = MockHost::new();
        let library = library(&host);
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter::<i32> {
            load: Arc::new(|_| panic!("old load must be replaced")),
            dispose: Arc::new(|_| panic!("old disposer must be replaced")),
        }));
        register_asset_loader(&library, "image", &adapter);
        let input = descriptor("a", &[]);
        register_asset_descriptor(&library, &input);
        let stored = library
            .read()
            .unwrap()
            .library_runtime
            .read()
            .unwrap()
            .descriptors["a"]
            .clone();
        input.write().unwrap().url = "caller mutation".to_string();
        let expected = stored.clone();
        let current = library.clone();
        let original = adapter.clone();
        adapter.write().unwrap().load = Arc::new(move |descriptor| {
            assert!(Arc::ptr_eq(descriptor, &expected));
            assert_eq!(descriptor.read().unwrap().url, "a.bin");
            assert!(current.try_write().is_ok());
            assert!(current.read().unwrap().library_runtime.try_write().is_ok());
            assert!(original.try_write().is_ok());
            Box::pin(async { Ok(17) })
        });
        let promise = acquire_asset::<i32>(&library, "a");
        host.run_ready();
        assert_eq!(result(&promise).unwrap().unwrap(), 17);
        let freed = Arc::new(Mutex::new(Vec::new()));
        let seen = freed.clone();
        adapter.write().unwrap().dispose = Arc::new(move |value| seen.lock().unwrap().push(value));
        release_asset(&library, "a");
        assert_eq!(*freed.lock().unwrap(), [17]);
        dispose_asset_library(&library);
    }
    #[test]
    fn generic_opaque_arc_value_retains_identity_across_typed_and_unknown_views() {
        let host = MockHost::new();
        let library = library(&host);
        let value = Arc::new(vec![1_i32, 2, 3]);
        let expected = value.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| {
                let value = expected.clone();
                Box::pin(async move { Ok(value) })
            }),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "custom.open", &adapter);
        let desc = descriptor("a", &[]);
        desc.write().unwrap().r#type = "custom.open".to_string();
        register_asset_descriptor(&library, &desc);
        let typed = acquire_asset::<Arc<Vec<i32>>>(&library, "a");
        let unknown = acquire_asset::<Unknown>(&library, "a");
        host.run_ready();
        assert!(Arc::ptr_eq(&result(&typed).unwrap().unwrap(), &value));
        let erased = result(&unknown).unwrap().unwrap().unwrap();
        assert!(Arc::ptr_eq(
            erased.downcast_ref::<Arc<Vec<i32>>>().unwrap(),
            &value
        ));
        assert!(Arc::ptr_eq(
            &get_asset::<Arc<Vec<i32>>>(&library, "a").unwrap(),
            &value
        ));
    }
    #[test]
    fn retains_original_spawn_clock_and_logger_references_after_external_service_rebinding() {
        let original = MockHost::new();
        let rebound = MockHost::new();
        let mut services = context(&original);
        let library = create_asset_library(&services);
        services.spawn = rebound.spawn();
        services.timers = rebound.timers();
        assert!(Arc::ptr_eq(
            &services.spawn.provider,
            &rebound.spawn().provider
        ));
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_descriptor(&library, &descriptor("a", &["g"]));
        let done = load_asset_group(&library, "g", None);
        flush(&mock, &rebound);
        assert!(result(&done).is_none());
        original.run_ready();
        assert!(result(&done).unwrap().is_ok());
        let captured = Arc::new(RwLock::new(flight_log::create_log_state()));
        let other = Arc::new(RwLock::new(flight_log::create_log_state()));
        let sink = flight_log::create_memory_log_sink(8);
        flight_log::add_log_sink(&captured, sink.sink.clone());
        let mut log_state = captured.clone();
        enable_asset_guards(&library, &log_state);
        log_state = other.clone();
        assert!(Arc::ptr_eq(&log_state, &other));
        original.advance(37.0);
        rebound.advance(900.0);
        let failure = acquire_asset::<Unknown>(&library, "missing");
        assert!(result(&failure).unwrap().is_err());
        let entries = {
            let mut collected = Vec::new();
            flight_log::get_memory_log_sink_entries(&mut collected, &sink);
            collected
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].timestamp_ms, 37.0);
        assert!(other.read().unwrap().once_keys.is_empty());
    }
    #[test]
    fn resident_release_uses_current_registry_but_an_orphan_uses_its_original_adapter() {
        let host = MockHost::new();
        let (library, original) = with_asset(&host, "a");
        let replacement = mock_adapter();
        let resident = acquire(&library, "a");
        flush(&original, &host);
        let first = result(&resident).unwrap().unwrap();
        register_asset_loader(&library, "image", &replacement.adapter);
        release_asset(&library, "a");
        assert!(original.disposed.lock().unwrap().is_empty());
        assert!(Arc::ptr_eq(
            &replacement.disposed.lock().unwrap()[0],
            &first
        ));
        register_asset_loader(&library, "image", &original.adapter);
        let orphan = acquire(&library, "a");
        register_asset_loader(&library, "image", &replacement.adapter);
        release_asset(&library, "a");
        flush(&original, &host);
        let last = result(&orphan).unwrap().unwrap();
        assert_eq!(original.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&original.disposed.lock().unwrap()[0], &last));
        assert_eq!(replacement.disposed.lock().unwrap().len(), 1);
    }
}

mod lifecycle {
    use super::*;
    #[test]
    fn old_success_frees_only_the_orphan_and_never_overwrites_a_fresh_same_id_entry() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "a");
        let old = acquire(&library, "a");
        release_asset(&library, "a");
        let fresh = acquire(&library, "a");
        assert!(!old.ptr_eq(&fresh));
        flush(&mock, &host);
        let a = result(&old).unwrap().unwrap();
        let b = result(&fresh).unwrap().unwrap();
        assert!(!Arc::ptr_eq(&a, &b));
        assert!(Arc::ptr_eq(&loaded(&library, "a").unwrap(), &b));
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&mock.disposed.lock().unwrap()[0], &a));
        assert_eq!(get_asset_ref_count(&library, "a"), 1);
        release_asset(&library, "a");
        assert_eq!(mock.disposed.lock().unwrap().len(), 2);
    }
    #[test]
    fn old_failure_does_not_evict_the_new_entry_or_its_reference_count() {
        let host = MockHost::new();
        let library = library(&host);
        let (old, fo) = deferred::<i32>();
        let (new, fnw) = deferred::<i32>();
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| {
                let mut count = count.lock().unwrap();
                *count += 1;
                let future = if *count == 1 { fo.clone() } else { fnw.clone() };
                Box::pin(future)
            }),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &[]));
        let first = acquire_asset::<i32>(&library, "a");
        release_asset(&library, "a");
        let second = acquire_asset::<i32>(&library, "a");
        old(Err(failure("stale")));
        host.run_ready();
        assert!(result(&first).unwrap().is_err());
        assert_eq!(get_asset_ref_count(&library, "a"), 1);
        assert_eq!(
            explain_asset_load(&library, "a").status,
            AssetLoadStatus::Loading
        );
        new(Ok(42));
        host.run_ready();
        assert_eq!(result(&second).unwrap().unwrap(), 42);
        assert_eq!(get_asset::<i32>(&library, "a"), Some(42));
    }
    #[test]
    fn disposing_a_pending_library_does_not_cancel_its_future_and_uses_the_original_orphan_disposer()
     {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "a");
        let promise = acquire(&library, "a");
        dispose_asset_library(&library);
        assert!(result(&promise).is_none());
        flush(&mock, &host);
        let value = result(&promise).unwrap().unwrap();
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&mock.disposed.lock().unwrap()[0], &value));
        assert_eq!(
            explain_asset_load(&library, "a").status,
            AssetLoadStatus::MissingDescriptor
        );
    }
    #[test]
    fn the_host_driver_retains_original_runtime_until_settlement_without_a_self_owning_promise_cycle()
     {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "a");
        let runtime = Arc::downgrade(&library.read().unwrap().library_runtime);
        let promise = acquire(&library, "a");
        drop(library);
        assert!(runtime.upgrade().is_some());
        flush(&mock, &host);
        assert!(result(&promise).unwrap().is_ok());
        assert!(mock.disposed.lock().unwrap().is_empty());
        assert!(runtime.upgrade().is_none());
    }
    #[test]
    fn dropping_the_host_releases_pending_runtime_even_if_a_caller_still_holds_the_promise() {
        let host = MockHost::new();
        let (library, _mock) = with_asset(&host, "a");
        let runtime = Arc::downgrade(&library.read().unwrap().library_runtime);
        let promise = acquire(&library, "a");
        drop(library);
        assert!(runtime.upgrade().is_some());
        drop(host);
        assert!(runtime.upgrade().is_none());
        assert!(result(&promise).is_none());
    }
}
mod reentry {
    use super::*;
    #[test]
    fn a_guard_can_register_the_missing_descriptor_and_adapter_but_the_original_call_still_rejects()
    {
        let host = MockHost::new();
        let library = library(&host);
        let expected = library.clone();
        let mock = mock_adapter();
        let adapter = mock.adapter.clone();
        let guard: AssetAcquireGuard = Arc::new(move |current, explanation| {
            assert!(Arc::ptr_eq(current, &expected));
            assert!(current.try_write().is_ok());
            assert!(current.read().unwrap().library_runtime.try_write().is_ok());
            assert_eq!(
                explanation.read().unwrap().status,
                AssetLoadStatus::MissingDescriptor
            );
            register_asset_loader(current, "image", &adapter);
            register_asset_descriptor(current, &descriptor("a", &[]));
        });
        set_asset_acquire_guard(&library, Some(guard));
        let first = acquire(&library, "a");
        assert!(error_message(&result(&first).unwrap().unwrap_err()).contains("no descriptor"));
        let second = acquire(&library, "a");
        flush(&mock, &host);
        assert!(result(&second).unwrap().is_ok());
        dispose_asset_library(&library);
    }
    #[test]
    fn library_disposal_iterates_live_entries_so_reentrant_release_never_double_frees_a_deleted_peer()
     {
        let host = MockHost::new();
        let library = library(&host);
        let current = library.clone();
        let freed = Arc::new(Mutex::new(Vec::new()));
        let seen = freed.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(|descriptor| {
                let id = descriptor.read().unwrap().id.clone();
                Box::pin(async move { Ok(id) })
            }),
            dispose: Arc::new(move |value: String| {
                assert!(current.try_write().is_ok());
                assert!(current.read().unwrap().library_runtime.try_write().is_ok());
                seen.lock().unwrap().push(value.clone());
                if value == "a" {
                    release_asset(&current, "b");
                }
            }),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_manifest(&library, &vec![descriptor("a", &[]), descriptor("b", &[])]);
        let _ = acquire_asset::<String>(&library, "a");
        let _ = acquire_asset::<String>(&library, "b");
        host.run_ready();
        dispose_asset_library(&library);
        assert_eq!(*freed.lock().unwrap(), ["a", "b"]);
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn release_group_keeps_the_origin_member_array_live_during_disposer_catalog_mutations() {
        let host = MockHost::new();
        let library = library(&host);
        let current = library.clone();
        let freed = Arc::new(Mutex::new(Vec::new()));
        let seen = freed.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(|descriptor| {
                let id = descriptor.read().unwrap().id.clone();
                Box::pin(async move { Ok(id) })
            }),
            dispose: Arc::new(move |value: String| {
                seen.lock().unwrap().push(value.clone());
                if value == "a" {
                    release_asset(&current, "b");
                    register_asset_descriptor(&current, &descriptor("b", &["other"]));
                    let _ = acquire_asset::<String>(&current, "b");
                }
            }),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_manifest(
            &library,
            &vec![descriptor("a", &["g"]), descriptor("b", &["g"])],
        );
        let done = load_asset_group(&library, "g", None);
        host.run_ready();
        assert!(result(&done).unwrap().is_ok());
        release_asset_group(&library, "g");
        assert_eq!(*freed.lock().unwrap(), ["a", "b"]);
        assert_eq!(get_asset_ref_count(&library, "b"), 1);
        host.run_ready();
        assert_eq!(get_asset::<String>(&library, "b"), Some("b".to_string()));
        dispose_asset_library(&library);
    }
    #[test]
    fn a_disposer_throw_stops_library_clear_but_last_release_still_deletes_its_entry_first() {
        let host = MockHost::new();
        let library = library(&host);
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter::<i32> {
            load: Arc::new(|_| Box::pin(async { Ok(1) })),
            dispose: Arc::new(|_| flight_entity::throw_error("free throws")),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("a", &["g"]));
        let _ = acquire_asset::<i32>(&library, "a");
        host.run_ready();
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            dispose_asset_library(&library)
        }))
        .unwrap_err();
        assert_eq!(
            error.downcast_ref::<FlightError>().unwrap().message,
            "free throws"
        );
        assert_eq!(get_asset_ref_count(&library, "a"), 1);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "g");
        assert_eq!(actual_ids, ["a"]);
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            release_asset(&library, "a")
        }))
        .unwrap_err();
        assert_eq!(
            error.downcast_ref::<FlightError>().unwrap().kind,
            FlightErrorKind::Error
        );
        assert_eq!(get_asset_ref_count(&library, "a"), 0);
        assert_eq!(
            explain_asset_load(&library, "a").status,
            AssetLoadStatus::Freed
        );
    }
}
