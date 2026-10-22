use crate::common::*;
use crate::mock_host::MockHost;
use flight_assets::contract::*;
use flight_entity::{Ref, Unknown};
use flight_signals::{connect_signal, create_signal};
use std::sync::{Arc, Mutex, RwLock};

mod acquire_asset {
    use super::*;
    #[test]
    fn drops_a_rejected_entry_and_allows_a_new_attempt() {
        let host = MockHost::new();
        let library = library(&host);
        let attempts = Arc::new(Mutex::new(0));
        let count = attempts.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(move |_| {
                let attempt = {
                    let mut n = count.lock().unwrap();
                    *n += 1;
                    *n
                };
                Box::pin(async move {
                    if attempt == 1 {
                        Err(failure("temporary"))
                    } else {
                        Ok(Arc::new(RwLock::new(MockAsset {
                            id: "hero".to_string(),
                        })))
                    }
                })
            }),
            dispose: Arc::new(|_| {}),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_descriptor(&library, &descriptor("hero", &[]));
        let first = acquire(&library, "hero");
        host.run_ready();
        assert_eq!(
            error_message(&result(&first).unwrap().unwrap_err()),
            "temporary"
        );
        let second = acquire(&library, "hero");
        host.run_ready();
        assert_eq!(result(&second).unwrap().unwrap().read().unwrap().id, "hero");
        assert_eq!(*attempts.lock().unwrap(), 2);
        assert_eq!(get_asset_ref_count(&library, "hero"), 1);
    }
    #[test]
    fn resolves_the_actual_value_and_shares_one_in_flight_promise_with_live_refs() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let first: flight_stream::SharedFuture<flight_loader::ResourceLoadResult<Ref<MockAsset>>> =
            acquire_asset(&library, "hero");
        let second = acquire(&library, "hero");
        assert!(first.ptr_eq(&second));
        assert_eq!(*mock.calls.lock().unwrap(), 1);
        assert_eq!(get_asset_ref_count(&library, "hero"), 2);
        flush(&mock, &host);
        let a = result(&first).unwrap().unwrap();
        let b = result(&second).unwrap().unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert!(Arc::ptr_eq(&a, &loaded(&library, "hero").unwrap()));
        assert!(Arc::ptr_eq(&a, &mock.values.lock().unwrap()[0]));
        assert_eq!(a.read().unwrap().id, "hero");
    }
    #[test]
    fn missing_descriptor_and_loader_return_exact_rejections_without_cache_entries() {
        let host = MockHost::new();
        let library = library(&host);
        let missing = acquire_asset::<Unknown>(&library, "missing");
        assert_eq!(
            error_message(&result(&missing).unwrap().unwrap_err()),
            "assets: no descriptor for id \"missing\""
        );
        register_asset_descriptor(&library, &descriptor("hero", &[]));
        let missing = acquire_asset::<Unknown>(&library, "hero");
        assert_eq!(
            error_message(&result(&missing).unwrap().unwrap_err()),
            "assets: no loader for type \"image\""
        );
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
    }
}
mod create_asset_library {
    use super::*;
    #[test]
    fn creates_an_empty_entity_without_adapters_or_residency() {
        let host = MockHost::new();
        let library = create_asset_library(&context(&host));
        assert!(loaded(&library, "hero").is_none());
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
        assert!(
            library
                .read()
                .unwrap()
                .library_runtime
                .read()
                .unwrap()
                .adapters
                .is_empty()
        );
        assert!(
            flight_entity::Entity::entity_runtime(&*library.read().unwrap())
                .data
                .is_none()
        );
    }
}
mod dispose_asset_library {
    use super::*;
    #[test]
    fn disposes_each_resident_value_once_and_empties_the_reusable_library() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let pending = acquire(&library, "hero");
        flush(&mock, &host);
        let value = result(&pending).unwrap().unwrap();
        let resident = acquire(&library, "hero");
        assert!(Arc::ptr_eq(&value, &result(&resident).unwrap().unwrap()));
        assert_eq!(get_asset_ref_count(&library, "hero"), 2);
        dispose_asset_library(&library);
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&mock.disposed.lock().unwrap()[0], &value));
        assert!(loaded(&library, "hero").is_none());
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "unknown");
        assert!(actual_ids.is_empty());
        assert_eq!(
            explain_asset_load(&library, "hero").status,
            AssetLoadStatus::MissingDescriptor
        );
    }
}
mod get_asset {
    use super::*;
    #[test]
    fn returns_none_before_and_during_load_then_the_same_resident_value() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let before: Option<Ref<MockAsset>> = get_asset(&library, "hero");
        assert!(before.is_none());
        let promise = acquire(&library, "hero");
        assert!(loaded(&library, "hero").is_none());
        flush(&mock, &host);
        assert!(Arc::ptr_eq(
            &loaded(&library, "hero").unwrap(),
            &result(&promise).unwrap().unwrap()
        ));
    }
}
mod get_asset_group_ids {
    use super::*;
    #[test]
    fn returns_detached_insertion_ordered_members_and_empty_unknown_group() {
        let host = MockHost::new();
        let library = library(&host);
        register_asset_manifest(
            &library,
            &vec![
                descriptor("a", &["boot"]),
                descriptor("b", &["boot", "shared"]),
            ],
        );
        let mut ids = Vec::new();
        get_asset_group_ids(&mut ids, &library, "boot");
        assert_eq!(ids, ["a", "b"]);
        ids.clear();
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "boot");
        assert_eq!(actual_ids, ["a", "b"]);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "unknown");
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn clears_stale_members_and_reuses_storage_for_smaller_and_missing_groups() {
        let host = MockHost::new();
        let library = library(&host);
        register_asset_manifest(
            &library,
            &vec![
                descriptor("a", &["boot"]),
                descriptor("b", &["boot", "shared"]),
            ],
        );
        let mut ids = Vec::with_capacity(16);
        ids.push("stale".to_string());
        let pointer = ids.as_ptr();
        let capacity = ids.capacity();
        get_asset_group_ids(&mut ids, &library, "boot");
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(ids.as_ptr(), pointer);
        assert_eq!(ids.capacity(), capacity);
        ids[0] = "caller-only".to_string();
        get_asset_group_ids(&mut ids, &library, "boot");
        assert_eq!(ids, ["a", "b"]);
        get_asset_group_ids(&mut ids, &library, "shared");
        assert_eq!(ids, ["b"]);
        assert_eq!(ids.as_ptr(), pointer);
        get_asset_group_ids(&mut ids, &library, "unknown");
        assert!(ids.is_empty());
        assert_eq!(ids.as_ptr(), pointer);
        assert_eq!(ids.capacity(), capacity);
    }
}
mod get_asset_ids {
    use super::*;
    #[test]
    fn includes_held_loading_and_resident_ids_and_drops_freed_entries() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let pending = acquire(&library, "hero");
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert_eq!(actual_ids, ["hero"]);
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert_eq!(actual_ids, ["hero"]);
        release_asset(&library, "hero");
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
    }
    #[test]
    fn reuses_snapshot_storage_through_loading_residency_and_release_without_changing_order() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_manifest(&library, &vec![descriptor("a", &[]), descriptor("b", &[])]);
        let a = acquire(&library, "a");
        let b = acquire(&library, "b");
        let mut ids = Vec::with_capacity(16);
        ids.push("stale".to_string());
        let pointer = ids.as_ptr();
        let capacity = ids.capacity();
        get_asset_ids(&mut ids, &library);
        assert_eq!(ids, ["a", "b"]);
        ids[0] = "caller-only".to_string();
        flush(&mock, &host);
        assert!(result(&a).unwrap().is_ok());
        assert!(result(&b).unwrap().is_ok());
        get_asset_ids(&mut ids, &library);
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(ids.as_ptr(), pointer);
        assert_eq!(ids.capacity(), capacity);
        release_asset(&library, "a");
        get_asset_ids(&mut ids, &library);
        assert_eq!(ids, ["b"]);
        release_asset(&library, "b");
        get_asset_ids(&mut ids, &library);
        assert!(ids.is_empty());
        assert_eq!(ids.as_ptr(), pointer);
        assert_eq!(ids.capacity(), capacity);
    }
}
mod get_asset_ref_count {
    use super::*;
    #[test]
    fn counts_acquires_and_releases_down_to_zero() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let pending = acquire(&library, "hero");
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
        let _ = acquire(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 2);
        release_asset(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 1);
        release_asset(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
    }
}
mod initialize_asset_library {
    use super::*;
    #[test]
    fn initializes_the_actual_constructor_and_resets_only_library_runtime() {
        let host = MockHost::new();
        let library = library(&host);
        register_asset_descriptor(&library, &descriptor("old", &["g"]));
        let old = library.read().unwrap().library_runtime.clone();
        initialize_asset_library(&mut library.write().unwrap(), &context(&host));
        let new = library.read().unwrap().library_runtime.clone();
        assert!(!Arc::ptr_eq(&old, &new));
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "g");
        assert!(actual_ids.is_empty());
        assert!(old.read().unwrap().descriptors.contains_key("old"));
    }
}
mod load_asset_group {
    use super::*;
    #[test]
    fn successful_members_remain_available_after_the_first_failure_and_all_members_settle() {
        let host = MockHost::new();
        let library = library(&host);
        let freed = Arc::new(Mutex::new(Vec::<Ref<MockAsset>>::new()));
        let saved = freed.clone();
        let adapter = Arc::new(RwLock::new(AssetLoaderAdapter {
            load: Arc::new(|descriptor| {
                let id = descriptor.read().unwrap().id.clone();
                Box::pin(async move {
                    if id == "bad" {
                        Err(failure("load failed: bad"))
                    } else {
                        Ok(Arc::new(RwLock::new(MockAsset { id })))
                    }
                })
            }),
            dispose: Arc::new(move |value| saved.lock().unwrap().push(value)),
        }));
        register_asset_loader(&library, "image", &adapter);
        register_asset_manifest(
            &library,
            &vec![
                descriptor("ok-1", &["mixed"]),
                descriptor("bad", &["mixed"]),
                descriptor("ok-2", &["mixed"]),
            ],
        );
        let promise = load_asset_group(&library, "mixed", None);
        host.run_ready();
        assert_eq!(
            error_message(&result(&promise).unwrap().unwrap_err()),
            "load failed: bad"
        );
        assert_eq!(loaded(&library, "ok-1").unwrap().read().unwrap().id, "ok-1");
        assert_eq!(loaded(&library, "ok-2").unwrap().read().unwrap().id, "ok-2");
        assert!(loaded(&library, "bad").is_none());
        assert!(freed.lock().unwrap().is_empty());
    }
    #[test]
    fn schedules_ten_members_at_default_six_concurrency_with_count_based_progress() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_manifest(
            &library,
            &(0..10)
                .map(|i| descriptor(&format!("tile-{i}"), &["level"]))
                .collect(),
        );
        let ticks = Arc::new(Mutex::new(Vec::new()));
        let seen = ticks.clone();
        let progress = create_signal::<Ref<AssetLoadProgress>>();
        connect_signal(
            &progress,
            Arc::new(move |value| seen.lock().unwrap().push(value.read().unwrap().clone())),
            None,
        );
        let options = Arc::new(RwLock::new(AssetGroupLoadOptions {
            progress: Some(Arc::new(RwLock::new(progress))),
        }));
        let done = load_asset_group(&library, "level", Some(&options));
        assert_eq!(*mock.peak.lock().unwrap(), 6);
        for _ in 0..10 {
            if result(&done).is_some() {
                break;
            }
            flush(&mock, &host);
        }
        assert!(result(&done).unwrap().is_ok());
        assert_eq!(*mock.calls.lock().unwrap(), 10);
        assert!(*mock.peak.lock().unwrap() <= 6);
        assert_eq!(*mock.active.lock().unwrap(), 0);
        for i in 0..10 {
            let id = format!("tile-{i}");
            assert_eq!(loaded(&library, &id).unwrap().read().unwrap().id, id);
            assert_eq!(get_asset_ref_count(&library, &id), 1);
        }
        assert_eq!(
            ticks.lock().unwrap().last(),
            Some(&AssetLoadProgress {
                loaded: 10,
                total: 10
            })
        );
    }
    #[test]
    fn unknown_or_empty_group_resolves_without_scheduling() {
        let host = MockHost::new();
        let library = library(&host);
        let promise = load_asset_group(&library, "nope", None);
        assert!(result(&promise).unwrap().is_ok());
        assert_eq!(host.timer_count(), 0);
        host.advance(0.0);
        assert_eq!(host.now(), 0.0);
    }
}
mod register_asset_descriptor {
    use super::*;
    #[test]
    fn copies_and_deduplicates_caller_groups_without_retaining_mutable_catalog_input() {
        let host = MockHost::new();
        let library = library(&host);
        let input = descriptor("hero", &["boot", "boot"]);
        register_asset_descriptor(&library, &input);
        input
            .write()
            .unwrap()
            .groups
            .as_mut()
            .unwrap()
            .push("mutated".to_string());
        let runtime = library.read().unwrap().library_runtime.clone();
        assert_eq!(
            runtime.read().unwrap().descriptors["hero"]
                .read()
                .unwrap()
                .groups,
            Some(vec!["boot".to_string()])
        );
        assert!(!runtime.read().unwrap().groups.contains_key("mutated"));
    }
    #[test]
    fn replaces_group_membership_and_removes_empty_old_groups() {
        let host = MockHost::new();
        let library = library(&host);
        register_asset_descriptor(&library, &descriptor("hero", &["boot", "shared"]));
        let replacement = descriptor("hero", &["level", "shared"]);
        replacement.write().unwrap().url = "hero-b.bin".to_string();
        register_asset_descriptor(&library, &replacement);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "boot");
        assert!(actual_ids.is_empty());
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "level");
        assert_eq!(actual_ids, ["hero"]);
        let mut actual_ids = Vec::new();
        get_asset_group_ids(&mut actual_ids, &library, "shared");
        assert_eq!(actual_ids, ["hero"]);
    }
    #[test]
    fn equivalent_acquired_registration_is_allowed_and_incompatible_replacement_throws() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let pending = acquire(&library, "hero");
        register_asset_descriptor(&library, &descriptor("hero", &[]));
        let changed = descriptor("hero", &[]);
        changed.write().unwrap().url = "replacement.bin".to_string();
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            register_asset_descriptor(&library, &changed)
        }))
        .unwrap_err()
        .downcast::<flight_entity::FlightError>()
        .unwrap();
        assert_eq!(
            error.message,
            "assets: cannot replace acquired descriptor \"hero\" (releaseAsset first)"
        );
        flush(&mock, &host);
        assert!(result(&pending).unwrap().is_ok());
    }
}
mod register_asset_loader {
    use super::*;
    #[test]
    fn replaced_adapter_is_last_write_wins_for_an_open_type() {
        let host = MockHost::new();
        let library = library(&host);
        let first = mock_adapter();
        let second = mock_adapter();
        register_asset_loader(&library, "acme.custom", &first.adapter);
        register_asset_loader(&library, "acme.custom", &second.adapter);
        let desc = descriptor("hero", &[]);
        desc.write().unwrap().r#type = "acme.custom".to_string();
        register_asset_descriptor(&library, &desc);
        let pending = acquire(&library, "hero");
        flush(&second, &host);
        assert!(result(&pending).unwrap().is_ok());
        assert_eq!(*first.calls.lock().unwrap(), 0);
        assert_eq!(*second.calls.lock().unwrap(), 1);
    }
}
mod register_asset_manifest {
    use super::*;
    #[test]
    fn records_descriptors_without_loading_then_acquire_uses_the_catalog() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_manifest(
            &library,
            &vec![descriptor("a", &["boot"]), descriptor("b", &["boot"])],
        );
        assert_eq!(*mock.calls.lock().unwrap(), 0);
        assert!(loaded(&library, "a").is_none());
        let pending = acquire(&library, "a");
        flush(&mock, &host);
        assert_eq!(result(&pending).unwrap().unwrap().read().unwrap().id, "a");
    }
}
mod release_asset {
    use super::*;
    #[test]
    fn releases_an_in_flight_value_as_an_orphan_exactly_once() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let promise = acquire(&library, "hero");
        release_asset(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
        assert!(loaded(&library, "hero").is_none());
        flush(&mock, &host);
        let value = result(&promise).unwrap().unwrap();
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&mock.disposed.lock().unwrap()[0], &value));
        assert!(loaded(&library, "hero").is_none());
    }
    #[test]
    fn one_of_two_holders_keeps_the_value_and_the_last_release_disposes_it() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        let first = acquire(&library, "hero");
        let second = acquire(&library, "hero");
        assert_eq!(*mock.calls.lock().unwrap(), 1);
        flush(&mock, &host);
        let a = result(&first).unwrap().unwrap();
        let b = result(&second).unwrap().unwrap();
        assert!(Arc::ptr_eq(&a, &b));
        assert_eq!(get_asset_ref_count(&library, "hero"), 2);
        release_asset(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 1);
        assert!(mock.disposed.lock().unwrap().is_empty());
        assert!(Arc::ptr_eq(&loaded(&library, "hero").unwrap(), &a));
        release_asset(&library, "hero");
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
        assert_eq!(mock.disposed.lock().unwrap().len(), 1);
        assert!(Arc::ptr_eq(&mock.disposed.lock().unwrap()[0], &a));
        assert!(loaded(&library, "hero").is_none());
    }
    #[test]
    fn unmatched_releases_are_noops() {
        let host = MockHost::new();
        let (library, mock) = with_asset(&host, "hero");
        release_asset(&library, "hero");
        release_asset(&library, "hero");
        assert!(mock.disposed.lock().unwrap().is_empty());
        assert_eq!(get_asset_ref_count(&library, "hero"), 0);
    }
}
mod release_asset_group {
    use super::*;
    #[test]
    fn releases_each_member_in_group_insertion_order() {
        let host = MockHost::new();
        let library = library(&host);
        let mock = mock_adapter();
        register_asset_loader(&library, "image", &mock.adapter);
        register_asset_manifest(
            &library,
            &vec![descriptor("a", &["level"]), descriptor("b", &["level"])],
        );
        let done = load_asset_group(&library, "level", None);
        for _ in 0..10 {
            if result(&done).is_some() {
                break;
            }
            flush(&mock, &host);
        }
        assert!(result(&done).unwrap().is_ok());
        assert_eq!(get_asset_ref_count(&library, "a"), 1);
        assert_eq!(get_asset_ref_count(&library, "b"), 1);
        release_asset_group(&library, "level");
        assert_eq!(
            mock.disposed
                .lock()
                .unwrap()
                .iter()
                .map(|v| v.read().unwrap().id.clone())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert!(loaded(&library, "a").is_none());
        assert!(loaded(&library, "b").is_none());
    }
    #[test]
    fn unknown_group_is_a_noop() {
        let host = MockHost::new();
        let library = library(&host);
        release_asset_group(&library, "nope");
        let mut actual_ids = Vec::new();
        get_asset_ids(&mut actual_ids, &library);
        assert!(actual_ids.is_empty());
    }
}
mod set_asset_acquire_guard {
    use super::*;
    #[test]
    fn installs_and_removes_the_actual_per_library_failure_callback() {
        let host = MockHost::new();
        let library = library(&host);
        let statuses = Arc::new(Mutex::new(Vec::new()));
        let seen = statuses.clone();
        let guard: AssetAcquireGuard = Arc::new(move |_, explanation| {
            seen.lock()
                .unwrap()
                .push(explanation.read().unwrap().status)
        });
        set_asset_acquire_guard(&library, Some(guard.clone()));
        assert!(Arc::ptr_eq(
            library
                .read()
                .unwrap()
                .library_runtime
                .read()
                .unwrap()
                .acquire_guard
                .as_ref()
                .unwrap(),
            &guard
        ));
        let first = acquire_asset::<Unknown>(&library, "missing");
        assert!(error_message(&result(&first).unwrap().unwrap_err()).contains("no descriptor"));
        set_asset_acquire_guard(&library, None);
        let second = acquire_asset::<Unknown>(&library, "still-missing");
        assert!(error_message(&result(&second).unwrap().unwrap_err()).contains("no descriptor"));
        assert_eq!(
            *statuses.lock().unwrap(),
            [AssetLoadStatus::MissingDescriptor]
        );
    }
}
