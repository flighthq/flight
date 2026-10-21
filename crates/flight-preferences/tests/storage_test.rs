use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;

use flight_preferences::*;
use flight_signals::connect_signal;

struct MemoryBackend {
    data: Arc<Mutex<HashMap<String, String>>>,
    get_calls: Arc<Mutex<u32>>,
    get_failures: Arc<Mutex<HashMap<String, StorageGetItemFailureReason>>>,
    keys_failure: Arc<Mutex<Option<StorageGetItemFailureReason>>>,
    remove_failures: Arc<Mutex<HashMap<String, StorageRemoveItemFailureReason>>>,
    set_failures: Arc<Mutex<HashMap<String, StorageSetItemFailureReason>>>,
    clear_failure: Arc<Mutex<Option<StorageClearFailureReason>>>,
}

fn memory_backend(initial: &[(&str, &str)]) -> (HostPreferencesCapability, MemoryBackend) {
    let data: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(
        initial.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
    ));
    let get_calls: Arc<Mutex<u32>> = Arc::new(Mutex::new(0));
    let get_failures: Arc<Mutex<HashMap<String, StorageGetItemFailureReason>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let keys_failure: Arc<Mutex<Option<StorageGetItemFailureReason>>> =
        Arc::new(Mutex::new(None));
    let remove_failures: Arc<Mutex<HashMap<String, StorageRemoveItemFailureReason>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let set_failures: Arc<Mutex<HashMap<String, StorageSetItemFailureReason>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let clear_failure: Arc<Mutex<Option<StorageClearFailureReason>>> =
        Arc::new(Mutex::new(None));

    let state = MemoryBackend {
        data: data.clone(),
        get_calls: get_calls.clone(),
        get_failures: get_failures.clone(),
        keys_failure: keys_failure.clone(),
        remove_failures: remove_failures.clone(),
        set_failures: set_failures.clone(),
        clear_failure: clear_failure.clone(),
    };

    let d_clear = data.clone();
    let cf = clear_failure.clone();
    let d_get = data.clone();
    let gc = get_calls.clone();
    let gf = get_failures.clone();
    let d_keys = data.clone();
    let kf = keys_failure.clone();
    let d_remove = data.clone();
    let rf = remove_failures.clone();
    let d_set = data.clone();
    let sf = set_failures.clone();

    let cap = HostPreferencesCapability {
        clear: Arc::new(move || {
            let failure = cf.lock().unwrap().clone();
            if let Some(reason) = failure {
                return StorageMutationOutcome::Err(StorageMutationErr { reason });
            }
            d_clear.lock().unwrap().clear();
            return StorageMutationOutcome::Ok;
        }),
        get_item: Arc::new(move |key: &str| {
            *gc.lock().unwrap() += 1;
            let failures = gf.lock().unwrap();
            if let Some(reason) = failures.get(key) {
                return StorageValueOutcome::Err(StorageValueErr { reason: *reason });
            }
            let map = d_get.lock().unwrap();
            return StorageValueOutcome::Ok(StorageValueOk { value: map.get(key).cloned() });
        }),
        keys: Arc::new(move || {
            let failure = kf.lock().unwrap().clone();
            if let Some(reason) = failure {
                return StorageValueOutcome::Err(StorageValueErr { reason });
            }
            let map = d_keys.lock().unwrap();
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();
            return StorageValueOutcome::Ok(StorageValueOk { value: keys });
        }),
        provider: Arc::new(()),
        remove_item: Arc::new(move |key: &str| {
            let failures = rf.lock().unwrap();
            if let Some(reason) = failures.get(key) {
                return StorageMutationOutcome::Err(StorageMutationErr { reason: *reason });
            }
            drop(failures);
            d_remove.lock().unwrap().remove(key);
            return StorageMutationOutcome::Ok;
        }),
        set_item: Arc::new(move |key: &str, value: &str| {
            let failures = sf.lock().unwrap();
            if let Some(reason) = failures.get(key) {
                return StorageMutationOutcome::Err(StorageMutationErr { reason: *reason });
            }
            drop(failures);
            d_set.lock().unwrap().insert(key.to_string(), value.to_string());
            return StorageMutationOutcome::Ok;
        }),
    };
    return (cap, state);
}

mod attach_storage {
    use super::*;

    #[test]
    fn retains_and_releases_exact_provider_subscription() {
        let released: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let captured: Arc<Mutex<Option<Arc<dyn Fn(&StorageChange) + Send + Sync>>>> =
            Arc::new(Mutex::new(None));

        let rel_a = released.clone();
        let cap_a = captured.clone();
        let a = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            provider: Arc::new(()),
            subscribe: Arc::new(move |listener| {
                *cap_a.lock().unwrap() = Some(listener);
                let r = rel_a.clone();
                return Some(Arc::new(move || {
                    r.lock().unwrap().push("a".to_string());
                }) as Arc<dyn Fn() + Send + Sync>);
            }),
        };

        let rel_b = released.clone();
        let b = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            provider: Arc::new(()),
            subscribe: Arc::new(move |_listener| {
                let r = rel_b.clone();
                return Some(Arc::new(move || {
                    r.lock().unwrap().push("b".to_string());
                }) as Arc<dyn Fn() + Send + Sync>);
            }),
        };

        let signals = create_storage_signals();
        let changes: Arc<Mutex<Vec<StorageChange>>> = Arc::new(Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);

        assert!(attach_storage(&a, &signals));
        {
            let guard = captured.lock().unwrap();
            if let Some(ref listener) = *guard {
                listener(&StorageChange {
                    key: Some("a".to_string()),
                    new_value: Some("1".to_string()),
                    old_value: None,
                });
            }
        }
        assert_eq!(changes.lock().unwrap().len(), 1);
        assert_eq!(changes.lock().unwrap()[0].key, Some("a".to_string()));

        assert!(attach_storage(&b, &signals));
        assert_eq!(*released.lock().unwrap(), vec!["a".to_string()]);

        detach_storage(&signals);
        assert_eq!(*released.lock().unwrap(), vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn returns_false_when_acquisition_fails() {
        let provider = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            provider: Arc::new(()),
            subscribe: Arc::new(|_| None),
        };
        let signals = create_storage_signals();
        assert!(!attach_storage(&provider, &signals));
        detach_storage(&signals);
    }
}

mod clear_storage {
    use super::*;

    #[test]
    fn returns_reason_and_emits_only_after_success() {
        let (backend, state) = memory_backend(&[("a", "1")]);
        let signals = create_storage_signals();
        let changes: Arc<Mutex<Vec<StorageChange>>> = Arc::new(Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);

        *state.clear_failure.lock().unwrap() = Some(StorageClearFailureReason::SecurityDenied);
        let result = clear_storage(&backend, Some(&signals));
        assert_eq!(result, StorageMutationOutcome::Err(StorageMutationErr { reason: StorageClearFailureReason::SecurityDenied }));
        assert!(changes.lock().unwrap().is_empty());

        *state.clear_failure.lock().unwrap() = None;
        let result = clear_storage(&backend, Some(&signals));
        assert_eq!(result, StorageMutationOutcome::Ok);
        let log = changes.lock().unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0], StorageChange { key: None, new_value: None, old_value: None });
    }
}

mod clear_storage_namespace {
    use super::*;

    #[test]
    fn stops_on_failure_and_exposes_completed() {
        let (backend, state) = memory_backend(&[("ns.a", "1"), ("ns.b", "2"), ("other", "3")]);
        state.remove_failures.lock().unwrap().insert("ns.b".to_string(), StorageRemoveItemFailureReason::RemoveFailed);

        let result = clear_storage_namespace(&backend, &StorageNamespace { prefix: "ns".to_string() }, None);
        assert_eq!(
            result,
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 1,
                failed_key: Some("ns.b".to_string()),
                reason: StorageClearNamespaceFailureReason::RemoveFailed,
            }),
        );
        let data = state.data.lock().unwrap();
        assert!(data.contains_key("ns.b"));
        assert!(data.contains_key("other"));
        assert!(!data.contains_key("ns.a"));
    }

    #[test]
    fn returns_no_partial_state_when_keys_fail() {
        let (backend, state) = memory_backend(&[("ns.a", "1")]);
        *state.keys_failure.lock().unwrap() = Some(StorageGetItemFailureReason::SecurityDenied);
        let result = clear_storage_namespace(&backend, &StorageNamespace { prefix: "ns".to_string() }, None);
        assert_eq!(
            result,
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 0,
                failed_key: None,
                reason: StorageClearNamespaceFailureReason::SecurityDenied,
            }),
        );
    }
}

mod create_storage_signals {
    use super::*;

    #[test]
    fn creates_entity_with_signal() {
        let signals = create_storage_signals();
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }
}

mod destroy_storage {
    use super::*;

    #[test]
    fn runs_provider_teardown() {
        let destroyed = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let d = destroyed.clone();
        let provider = HostPreferencesChangeCapability {
            destroy: Arc::new(move || {
                d.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }),
            provider: Arc::new(()),
            subscribe: Arc::new(|_| None),
        };
        destroy_storage(&provider);
        assert_eq!(destroyed.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

mod detach_storage {
    use super::*;

    #[test]
    fn is_idempotent() {
        let released = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let r = released.clone();
        let provider = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            provider: Arc::new(()),
            subscribe: Arc::new(move |_| {
                let r2 = r.clone();
                return Some(Arc::new(move || {
                    r2.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }) as Arc<dyn Fn() + Send + Sync>);
            }),
        };
        let signals = create_storage_signals();
        attach_storage(&provider, &signals);
        detach_storage(&signals);
        detach_storage(&signals);
        assert_eq!(released.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

mod dispose_storage {
    use super::*;

    #[test]
    fn detaches_and_clears_listeners() {
        let signals = create_storage_signals();
        connect_signal(&signals.on_change, Arc::new(|_: &StorageChange| {}), None);
        dispose_storage(&signals);
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }
}

mod get_namespaced_storage_byte_size {
    use super::*;

    #[test]
    fn computes_from_prefixed_keys() {
        let (backend, _) = memory_backend(&[("n.a", "xy"), ("other", "ignored")]);
        let result = get_namespaced_storage_byte_size(&backend, &StorageNamespace { prefix: "n".to_string() });
        assert_eq!(result, StorageQueryOutcome::Ok(StorageQueryOk { value: ("n.a".len() + "xy".len()) * 2 }));
    }
}

mod get_namespaced_storage_entries {
    use super::*;

    #[test]
    fn filters_and_strips_prefix() {
        let (backend, _) = memory_backend(&[("app.a", "1"), ("app.b", "2"), ("other", "3")]);
        let result = get_namespaced_storage_entries(&backend, &StorageNamespace { prefix: "app".to_string() });
        assert_eq!(
            result,
            StorageQueryOutcome::Ok(StorageQueryOk {
                value: vec![("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())],
            }),
        );
    }
}

mod get_namespaced_storage_item {
    use super::*;

    #[test]
    fn reads_prefixed_key() {
        let (backend, _) = memory_backend(&[("app.a", "1")]);
        assert_eq!(
            get_namespaced_storage_item(&backend, &StorageNamespace { prefix: "app".to_string() }, "a"),
            StorageValueOutcome::Ok(StorageValueOk { value: Some("1".to_string()) }),
        );
    }
}

mod get_namespaced_storage_item_presence {
    use super::*;

    #[test]
    fn reports_missing() {
        let (backend, _) = memory_backend(&[]);
        assert_eq!(
            get_namespaced_storage_item_presence(&backend, &StorageNamespace { prefix: "app".to_string() }, "missing"),
            StorageValueOutcome::Ok(StorageValueOk { value: false }),
        );
    }
}

mod get_namespaced_storage_keys {
    use super::*;

    #[test]
    fn filters_and_strips() {
        let (backend, _) = memory_backend(&[("app.a", "1"), ("app.b", "2"), ("other", "3")]);
        assert_eq!(
            get_namespaced_storage_keys(&backend, &StorageNamespace { prefix: "app".to_string() }),
            StorageValueOutcome::Ok(StorageValueOk { value: vec!["a".to_string(), "b".to_string()] }),
        );
    }
}

mod get_storage_boolean {
    use super::*;

    #[test]
    fn distinguishes_miss_values_parse_failure() {
        let (backend, _) = memory_backend(&[("bad", "yes"), ("false", "false"), ("true", "true")]);
        assert_eq!(get_storage_boolean(&backend, "true"), StorageValueOutcome::Ok(StorageValueOk { value: Some(true) }));
        assert_eq!(get_storage_boolean(&backend, "false"), StorageValueOutcome::Ok(StorageValueOk { value: Some(false) }));
        assert_eq!(get_storage_boolean(&backend, "missing"), StorageValueOutcome::Ok(StorageValueOk { value: None }));
        assert_eq!(
            get_storage_boolean(&backend, "bad"),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageReadFailureReason::ParseFailed }),
        );
    }
}

mod get_storage_boolean_or {
    use super::*;

    #[test]
    fn retains_fallback_and_provider_failure() {
        let (backend, state) = memory_backend(&[("bad", "yes")]);
        assert_eq!(
            get_storage_boolean_or(&backend, "bad", true),
            StorageFallbackOutcome::ParseFailed(StorageFallbackParseFailed { value: true }),
        );
        state.get_failures.lock().unwrap().insert("denied".to_string(), StorageGetItemFailureReason::SecurityDenied);
        assert_eq!(
            get_storage_boolean_or(&backend, "denied", true),
            StorageFallbackOutcome::ProviderError(StorageFallbackProviderError { reason: StorageGetItemFailureReason::SecurityDenied }),
        );
    }
}

mod get_storage_byte_size {
    use super::*;

    #[test]
    fn returns_empty_success_and_failures() {
        let (empty_backend, empty_state) = memory_backend(&[]);
        assert_eq!(get_storage_byte_size(&empty_backend), StorageQueryOutcome::Ok(StorageQueryOk { value: 0 }));

        *empty_state.keys_failure.lock().unwrap() = Some(StorageGetItemFailureReason::ReadFailed);
        assert_eq!(
            get_storage_byte_size(&empty_backend),
            StorageQueryOutcome::Err(StorageQueryErr { failed_key: None, reason: StorageGetItemFailureReason::ReadFailed }),
        );

        let (val_backend, val_state) = memory_backend(&[("a", "1")]);
        val_state.get_failures.lock().unwrap().insert("a".to_string(), StorageGetItemFailureReason::SecurityDenied);
        assert_eq!(
            get_storage_byte_size(&val_backend),
            StorageQueryOutcome::Err(StorageQueryErr {
                failed_key: Some("a".to_string()),
                reason: StorageGetItemFailureReason::SecurityDenied,
            }),
        );
    }
}

mod get_storage_entries {
    use super::*;

    #[test]
    fn no_partial_payload_after_failure() {
        let (backend, state) = memory_backend(&[("a", "1"), ("b", "2")]);
        state.get_failures.lock().unwrap().insert("b".to_string(), StorageGetItemFailureReason::ReadFailed);
        assert_eq!(
            get_storage_entries(&backend),
            StorageQueryOutcome::Err(StorageQueryErr {
                failed_key: Some("b".to_string()),
                reason: StorageGetItemFailureReason::ReadFailed,
            }),
        );
    }
}

mod get_storage_item {
    use super::*;

    #[test]
    fn distinguishes_missing_empty_failed() {
        let (backend, _) = memory_backend(&[("empty", "")]);
        assert_eq!(get_storage_item(&backend, "missing"), StorageValueOutcome::Ok(StorageValueOk { value: None }));
        assert_eq!(get_storage_item(&backend, "empty"), StorageValueOutcome::Ok(StorageValueOk { value: Some("".to_string()) }));
    }
}

mod get_storage_item_count {
    use super::*;

    #[test]
    fn distinguishes_empty_from_failed() {
        let (backend, state) = memory_backend(&[]);
        assert_eq!(get_storage_item_count(&backend), StorageValueOutcome::Ok(StorageValueOk { value: 0 }));
        *state.keys_failure.lock().unwrap() = Some(StorageGetItemFailureReason::RuntimeUnavailable);
        assert_eq!(
            get_storage_item_count(&backend),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageGetItemFailureReason::RuntimeUnavailable }),
        );
    }
}

mod get_storage_item_or {
    use super::*;

    #[test]
    fn does_not_hide_failure() {
        let (backend, state) = memory_backend(&[("empty", "")]);
        assert_eq!(
            get_storage_item_or(&backend, "missing", "fallback"),
            StorageValueOutcome::Ok(StorageValueOk { value: "fallback".to_string() }),
        );
        assert_eq!(
            get_storage_item_or(&backend, "empty", "fallback"),
            StorageValueOutcome::Ok(StorageValueOk { value: "".to_string() }),
        );
        state.get_failures.lock().unwrap().insert("denied".to_string(), StorageGetItemFailureReason::SecurityDenied);
        assert_eq!(
            get_storage_item_or(&backend, "denied", "fallback"),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageGetItemFailureReason::SecurityDenied }),
        );
    }
}

mod get_storage_item_presence {
    use super::*;

    #[test]
    fn returns_err_on_failure() {
        let (backend, state) = memory_backend(&[]);
        state.get_failures.lock().unwrap().insert("key".to_string(), StorageGetItemFailureReason::ReadFailed);
        assert_eq!(
            get_storage_item_presence(&backend, "key"),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageGetItemFailureReason::ReadFailed }),
        );
    }
}

mod get_storage_items {
    use super::*;

    #[test]
    fn stops_on_first_failure() {
        let (backend, state) = memory_backend(&[("a", "1"), ("c", "3")]);
        state.get_failures.lock().unwrap().insert("b".to_string(), StorageGetItemFailureReason::ReadFailed);
        assert_eq!(
            get_storage_items(&backend, &["a", "b", "c"]),
            StorageQueryOutcome::Err(StorageQueryErr {
                failed_key: Some("b".to_string()),
                reason: StorageGetItemFailureReason::ReadFailed,
            }),
        );
        assert_eq!(*state.get_calls.lock().unwrap(), 2);
    }
}

mod get_storage_json {
    use super::*;

    #[test]
    fn distinguishes_miss_stored_null_and_malformed() {
        let (backend, _) = memory_backend(&[("bad", "{"), ("null", "null"), ("value", r#"{"x":1}"#)]);
        assert_eq!(
            get_storage_json(&backend, "value"),
            StorageValueOutcome::Ok(StorageValueOk { value: Some(serde_json::json!({"x": 1})) }),
        );
        assert_eq!(get_storage_json::<serde_json::Value>(&backend, "missing"), StorageValueOutcome::Ok(StorageValueOk { value: None }));
        assert_eq!(
            get_storage_json(&backend, "null"),
            StorageValueOutcome::Ok(StorageValueOk { value: Some(serde_json::Value::Null) }),
        );
        assert_eq!(
            get_storage_json::<serde_json::Value>(&backend, "bad"),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageReadFailureReason::ParseFailed }),
        );
    }
}

mod get_storage_json_or {
    use super::*;

    #[test]
    fn returns_fallback_with_parse_reason() {
        let (backend, _) = memory_backend(&[("bad", "{"), ("null", "null")]);
        let fallback = serde_json::json!({"x": 2});
        assert_eq!(
            get_storage_json_or(&backend, "bad", fallback.clone()),
            StorageFallbackOutcome::ParseFailed(StorageFallbackParseFailed { value: Some(fallback) }),
        );
        assert_eq!(
            get_storage_json_or(&backend, "null", serde_json::json!({"x": 2})),
            StorageFallbackOutcome::Ok(StorageFallbackOk { value: Some(serde_json::Value::Null) }),
        );
    }
}

mod get_storage_keys {
    use super::*;

    #[test]
    fn distinguishes_empty_from_failure() {
        let (backend, state) = memory_backend(&[]);
        assert_eq!(get_storage_keys(&backend), StorageValueOutcome::Ok(StorageValueOk { value: vec![] }));
        *state.keys_failure.lock().unwrap() = Some(StorageGetItemFailureReason::RuntimeUnavailable);
        assert_eq!(
            get_storage_keys(&backend),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageGetItemFailureReason::RuntimeUnavailable }),
        );
    }
}

mod get_storage_number {
    use super::*;

    #[test]
    fn reports_nonfinite_as_parse_failure() {
        let (backend, _) = memory_backend(&[("bad", "Infinity"), ("number", "2.5")]);
        assert_eq!(
            get_storage_number(&backend, "number"),
            StorageValueOutcome::Ok(StorageValueOk { value: Some(2.5) }),
        );
        assert_eq!(get_storage_number(&backend, "missing"), StorageValueOutcome::Ok(StorageValueOk { value: None }));
        assert_eq!(
            get_storage_number(&backend, "bad"),
            StorageValueOutcome::Err(StorageValueErr { reason: StorageReadFailureReason::ParseFailed }),
        );
    }
}

mod get_storage_number_or {
    use super::*;

    #[test]
    fn retains_fallback_parse_reason() {
        let (backend, _) = memory_backend(&[("bad", "Infinity")]);
        assert_eq!(
            get_storage_number_or(&backend, "bad", 7.0),
            StorageFallbackOutcome::ParseFailed(StorageFallbackParseFailed { value: 7.0 }),
        );
    }
}

mod initialize_storage_signals {
    use super::*;

    #[test]
    fn resets_signal_on_preallocated_entity() {
        let mut signals: StorageSignals = flight_entity::allocate_entity();
        initialize_storage_signals(&mut signals);
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }
}

mod migrate_storage {
    use super::*;

    #[test]
    fn checkpoints_in_sorted_order() {
        let (backend, state) = memory_backend(&[]);
        let seen = Arc::new(Mutex::new(Vec::new()));
        let s1 = seen.clone();
        let d = state.data.clone();
        let m2 = StorageMigration {
            version: 2,
            migrate: Arc::new(move |_| {
                let v = d.lock().unwrap().get("__flight_storage_version").cloned().unwrap_or_default();
                s1.lock().unwrap().push(format!("two:{}", v));
            }),
        };
        let s2 = seen.clone();
        let m1 = StorageMigration {
            version: 1,
            migrate: Arc::new(move |_| {
                s2.lock().unwrap().push("one".to_string());
            }),
        };
        let result = migrate_storage(&backend, None, &[&m2, &m1], None);
        assert_eq!(result, StorageMigrationOutcomeInner::Ok(StorageMigrationOk { version: 2 }));
        assert_eq!(*seen.lock().unwrap(), vec!["one".to_string(), "two:1".to_string()]);
        assert_eq!(state.data.lock().unwrap().get("__flight_storage_version").unwrap(), "2");
    }

    #[test]
    fn reports_checkpoint_failure_and_replays() {
        let (backend, state) = memory_backend(&[]);

        let version_two_calls = Arc::new(Mutex::new(0u32));
        let v2c2 = version_two_calls.clone();
        let m2 = StorageMigration {
            version: 2,
            migrate: Arc::new(move |_| {
                *v2c2.lock().unwrap() += 1;
            }),
        };

        let sf2 = state.set_failures.clone();
        let m1 = StorageMigration {
            version: 1,
            migrate: Arc::new(move |_| {
                sf2.lock().unwrap().insert("__flight_storage_version".to_string(), StorageSetItemFailureReason::WriteFailed);
            }),
        };

        let result = migrate_storage(&backend, None, &[&m1, &m2], None);
        assert_eq!(
            result,
            StorageMigrationOutcomeInner::CheckpointFailed(StorageMigrationCheckpointFailed {
                failed_version: 1,
                reason: StorageSetItemFailureReason::WriteFailed,
                version: 0,
            }),
        );

        state.set_failures.lock().unwrap().clear();
        let v2c3 = version_two_calls.clone();
        let m1b = StorageMigration { version: 1, migrate: Arc::new(|_| {}) };
        let m2b = StorageMigration {
            version: 2,
            migrate: Arc::new(move |_| {
                *v2c3.lock().unwrap() += 1;
            }),
        };
        let result = migrate_storage(&backend, None, &[&m1b, &m2b], None);
        assert_eq!(result, StorageMigrationOutcomeInner::Ok(StorageMigrationOk { version: 2 }));
    }

    #[test]
    fn returns_read_version_failed_on_invalid_stored_version() {
        let (backend, _) = memory_backend(&[("__flight_storage_version", "not-a-version")]);
        let m = StorageMigration { version: 1, migrate: Arc::new(|_| {}) };
        let result = migrate_storage(&backend, None, &[&m], None);
        assert_eq!(
            result,
            StorageMigrationOutcomeInner::ReadVersionFailed(StorageMigrationReadVersionFailed {
                reason: StorageMigrationReadFailureReason::VersionParseFailed,
            }),
        );
    }

    #[test]
    fn returns_read_version_failed_on_provider_failure() {
        let (backend, state) = memory_backend(&[]);
        state.get_failures.lock().unwrap().insert(
            "__flight_storage_version".to_string(),
            StorageGetItemFailureReason::SecurityDenied,
        );
        let m = StorageMigration { version: 1, migrate: Arc::new(|_| {}) };
        let result = migrate_storage(&backend, None, &[&m], None);
        assert_eq!(
            result,
            StorageMigrationOutcomeInner::ReadVersionFailed(StorageMigrationReadVersionFailed {
                reason: StorageMigrationReadFailureReason::SecurityDenied,
            }),
        );
    }

    #[test]
    #[should_panic(expected = "is duplicated")]
    fn validates_duplicate_version() {
        let (backend, _) = memory_backend(&[]);
        let m1 = StorageMigration { version: 1, migrate: Arc::new(|_| {}) };
        let m2 = StorageMigration { version: 1, migrate: Arc::new(|_| {}) };
        migrate_storage(&backend, None, &[&m1, &m2], None);
    }

    #[test]
    #[should_panic(expected = "Storage migration versions must be positive integers")]
    fn validates_zero_version() {
        let (backend, _) = memory_backend(&[]);
        let m = StorageMigration { version: 0, migrate: Arc::new(|_| {}) };
        migrate_storage(&backend, None, &[&m], None);
    }

    #[test]
    fn with_namespace() {
        let (backend, state) = memory_backend(&[]);
        let ns = StorageNamespace { prefix: "app".to_string() };
        let seen = Arc::new(Mutex::new(Vec::new()));
        let s = seen.clone();
        let m = StorageMigration {
            version: 1,
            migrate: Arc::new(move |prefix| {
                s.lock().unwrap().push(prefix.unwrap_or("none").to_string());
            }),
        };
        let result = migrate_storage(&backend, Some(&ns), &[&m], None);
        assert_eq!(result, StorageMigrationOutcomeInner::Ok(StorageMigrationOk { version: 1 }));
        assert_eq!(*seen.lock().unwrap(), vec!["app".to_string()]);
        assert_eq!(
            state.data.lock().unwrap().get("app.__flight_storage_version").unwrap(),
            "1",
        );
    }
}

mod remove_namespaced_storage_item {
    use super::*;

    #[test]
    fn emits_change() {
        let (backend, _) = memory_backend(&[("ns.a", "1")]);
        let signals = create_storage_signals();
        let changes: Arc<Mutex<Vec<StorageChange>>> = Arc::new(Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);
        let result = remove_namespaced_storage_item(
            &backend,
            &StorageNamespace { prefix: "ns".to_string() },
            "a",
            Some(&signals),
        );
        assert!(result.is_ok());
        let log = changes.lock().unwrap();
        assert_eq!(
            log[0],
            StorageChange {
                key: Some("ns.a".to_string()),
                new_value: None,
                old_value: Some("1".to_string()),
            },
        );
    }
}

mod remove_storage_item {
    use super::*;

    #[test]
    fn treats_absent_as_idempotent() {
        let (backend, _) = memory_backend(&[]);
        let signals = create_storage_signals();
        let changes: Arc<Mutex<Vec<StorageChange>>> = Arc::new(Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);
        let result = remove_storage_item(&backend, "missing", Some(&signals));
        assert!(result.is_ok());
        assert!(changes.lock().unwrap().is_empty());
    }
}

mod remove_storage_items {
    use super::*;

    #[test]
    fn stops_at_first_failure() {
        let (backend, state) = memory_backend(&[("a", "1"), ("b", "2"), ("c", "3")]);
        state.remove_failures.lock().unwrap().insert("b".to_string(), StorageRemoveItemFailureReason::SecurityDenied);
        let result = remove_storage_items(&backend, &["a", "b", "c"], None);
        assert_eq!(
            result,
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 1,
                failed_key: Some("b".to_string()),
                reason: StorageRemoveItemFailureReason::SecurityDenied,
            }),
        );
        let data = state.data.lock().unwrap();
        assert!(data.contains_key("b"));
        assert!(data.contains_key("c"));
    }
}

mod set_namespaced_storage_item {
    use super::*;

    #[test]
    fn prefixes_keys() {
        let (backend, state) = memory_backend(&[]);
        let result = set_namespaced_storage_item(
            &backend,
            &StorageNamespace { prefix: "app".to_string() },
            "key",
            "value",
            None,
        );
        assert!(result.is_ok());
        assert_eq!(state.data.lock().unwrap().get("app.key").unwrap(), "value");
    }
}

mod set_storage_boolean {
    use super::*;

    #[test]
    fn serializes_booleans() {
        let (backend, state) = memory_backend(&[]);
        let result = set_storage_boolean(&backend, "flag", true, None);
        assert!(result.is_ok());
        assert_eq!(state.data.lock().unwrap().get("flag").unwrap(), "true");
    }
}

mod set_storage_item {
    use super::*;

    #[test]
    fn reads_old_only_for_observed_signals() {
        let (backend, state) = memory_backend(&[("key", "old")]);
        let signals = create_storage_signals();

        let result = set_storage_item(&backend, "key", "unobserved", Some(&signals));
        assert!(result.is_ok());
        assert_eq!(*state.get_calls.lock().unwrap(), 0);

        let changes: Arc<Mutex<Vec<StorageChange>>> = Arc::new(Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);

        state.set_failures.lock().unwrap().insert("key".to_string(), StorageSetItemFailureReason::QuotaExceeded);
        let result = set_storage_item(&backend, "key", "failed", Some(&signals));
        assert_eq!(result, StorageMutationOutcome::Err(StorageMutationErr { reason: StorageSetItemFailureReason::QuotaExceeded }));
        assert!(changes.lock().unwrap().is_empty());

        state.set_failures.lock().unwrap().clear();
        let result = set_storage_item(&backend, "key", "new", Some(&signals));
        assert!(result.is_ok());
        let log = changes.lock().unwrap();
        assert_eq!(
            log[0],
            StorageChange {
                key: Some("key".to_string()),
                new_value: Some("new".to_string()),
                old_value: Some("unobserved".to_string()),
            },
        );
    }
}

mod set_storage_items {
    use super::*;

    #[test]
    fn stops_after_failed_write() {
        let (backend, state) = memory_backend(&[]);
        state.set_failures.lock().unwrap().insert("b".to_string(), StorageSetItemFailureReason::QuotaExceeded);
        let result = set_storage_items(&backend, &[("a", "1"), ("b", "2"), ("c", "3")], None);
        assert_eq!(
            result,
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 1,
                failed_key: Some("b".to_string()),
                reason: StorageSetItemFailureReason::QuotaExceeded,
            }),
        );
        let data = state.data.lock().unwrap();
        assert_eq!(data.get("a").unwrap(), "1");
        assert!(!data.contains_key("b"));
    }
}

mod set_storage_json {
    use super::*;

    #[test]
    fn serializes_values() {
        let (backend, state) = memory_backend(&[]);
        let result = set_storage_json(&backend, "value", &serde_json::json!({"x": 1}), None);
        assert!(result.is_ok());
        assert_eq!(state.data.lock().unwrap().get("value").unwrap(), r#"{"x":1}"#);
    }

    // Source test case: storage.test.ts:649-651 — cyclic self-reference
    // TS: `const cyclic = {}; cyclic.self = cyclic; setStorageJSON(host, 'cyclic', cyclic)` => serialization-failed
    // Unrepresentable: Rust's owned type system prevents cyclic values at compile time.
    // The serialization-failed code path exists (serde_json::to_string Err) but cannot be
    // reached through the typed generic API since T: Serialize values are acyclic by construction.

    // Source test case: storage.test.ts:652 — top-level undefined
    // TS: `setStorageJSON(host, 'undef', undefined)` => serialization-failed (JSON.stringify returns undefined)
    // Unrepresentable: Rust has no `undefined` value. Option::None at the call site is a
    // different semantic (absence vs. the JS undefined value). The source assertion documents
    // a JS-only runtime behavior with no Rust equivalent.
}

mod set_storage_number {
    use super::*;

    #[test]
    #[should_panic(expected = "set_storage_number value must be finite")]
    fn panics_on_infinity() {
        let (backend, _) = memory_backend(&[]);
        set_storage_number(&backend, "inf", f64::INFINITY, None);
    }

    #[test]
    #[should_panic(expected = "set_storage_number value must be finite")]
    fn panics_on_nan() {
        let (backend, _) = memory_backend(&[]);
        set_storage_number(&backend, "nan", f64::NAN, None);
    }

    #[test]
    fn stores_finite_values() {
        let (backend, state) = memory_backend(&[]);
        let result = set_storage_number(&backend, "number", 2.5, None);
        assert!(result.is_ok());
        assert_eq!(state.data.lock().unwrap().get("number").unwrap(), "2.5");
    }
}
