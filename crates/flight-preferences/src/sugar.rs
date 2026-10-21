use crate::contract::*;

// ── D18 sugar tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::Arc;
    use flight_signals::connect_signal;

    fn memory_backend() -> HostPreferencesCapability {
        return memory_backend_with(Vec::new());
    }

    fn memory_backend_with(initial: Vec<(&str, &str)>) -> HostPreferencesCapability {
        use std::collections::HashMap;
        use std::sync::{Arc, Mutex};
        let data: Arc<Mutex<HashMap<String, String>>> = Arc::new(Mutex::new(
            initial.into_iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
        ));
        let d1 = data.clone();
        let d2 = data.clone();
        let d3 = data.clone();
        let d4 = data.clone();
        let d5 = data.clone();
        return HostPreferencesCapability {
            clear: Arc::new(move || {
                d1.lock().unwrap().clear();
                return StorageMutationOutcome::Ok;
            }),
            get_item: Arc::new(move |key: &str| {
                let map = d2.lock().unwrap();
                return StorageValueOutcome::Ok { value: map.get(key).cloned() };
            }),
            keys: Arc::new(move || {
                let map = d3.lock().unwrap();
                let mut keys: Vec<String> = map.keys().cloned().collect();
                keys.sort();
                return StorageValueOutcome::Ok { value: keys };
            }),
            remove_item: Arc::new(move |key: &str| {
                d4.lock().unwrap().remove(key);
                return StorageMutationOutcome::Ok;
            }),
            set_item: Arc::new(move |key: &str, value: &str| {
                d5.lock().unwrap().insert(key.to_string(), value.to_string());
                return StorageMutationOutcome::Ok;
            }),
        };
    }

    #[test]
    fn storage_clear_failure_reason_parse_delegates() {
        assert_eq!(
            StorageClearFailureReason::parse("clear-failed"),
            parse_storage_clear_failure_reason("clear-failed"),
        );
    }

    #[test]
    fn storage_clear_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageClearFailureReason::ClearFailed.to_str(),
            get_storage_clear_failure_reason_string(StorageClearFailureReason::ClearFailed),
        );
    }

    #[test]
    fn storage_clear_namespace_failure_reason_parse_delegates() {
        assert_eq!(
            StorageClearNamespaceFailureReason::parse("remove-failed"),
            parse_storage_clear_namespace_failure_reason("remove-failed"),
        );
    }

    #[test]
    fn storage_clear_namespace_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageClearNamespaceFailureReason::RemoveFailed.to_str(),
            get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::RemoveFailed),
        );
    }

    #[test]
    fn storage_get_item_failure_reason_parse_delegates() {
        assert_eq!(
            StorageGetItemFailureReason::parse("read-failed"),
            parse_storage_get_item_failure_reason("read-failed"),
        );
    }

    #[test]
    fn storage_get_item_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageGetItemFailureReason::ReadFailed.to_str(),
            get_storage_get_item_failure_reason_string(StorageGetItemFailureReason::ReadFailed),
        );
    }

    #[test]
    fn storage_migration_read_failure_reason_parse_delegates() {
        assert_eq!(
            StorageMigrationReadFailureReason::parse("version-parse-failed"),
            parse_storage_migration_read_failure_reason("version-parse-failed"),
        );
    }

    #[test]
    fn storage_migration_read_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageMigrationReadFailureReason::VersionParseFailed.to_str(),
            get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::VersionParseFailed),
        );
    }

    #[test]
    fn storage_read_failure_reason_parse_delegates() {
        assert_eq!(
            StorageReadFailureReason::parse("parse-failed"),
            parse_storage_read_failure_reason("parse-failed"),
        );
    }

    #[test]
    fn storage_read_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageReadFailureReason::ParseFailed.to_str(),
            get_storage_read_failure_reason_string(StorageReadFailureReason::ParseFailed),
        );
    }

    #[test]
    fn storage_remove_item_failure_reason_parse_delegates() {
        assert_eq!(
            StorageRemoveItemFailureReason::parse("quota-exceeded"),
            parse_storage_remove_item_failure_reason("quota-exceeded"),
        );
    }

    #[test]
    fn storage_remove_item_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageRemoveItemFailureReason::QuotaExceeded.to_str(),
            get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::QuotaExceeded),
        );
    }

    #[test]
    fn storage_set_item_failure_reason_parse_delegates() {
        assert_eq!(
            StorageSetItemFailureReason::parse("write-failed"),
            parse_storage_set_item_failure_reason("write-failed"),
        );
    }

    #[test]
    fn storage_set_item_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageSetItemFailureReason::WriteFailed.to_str(),
            get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::WriteFailed),
        );
    }

    #[test]
    fn storage_write_failure_reason_parse_delegates() {
        assert_eq!(
            StorageWriteFailureReason::parse("serialization-failed"),
            parse_storage_write_failure_reason("serialization-failed"),
        );
    }

    #[test]
    fn storage_write_failure_reason_to_string_delegates() {
        assert_eq!(
            StorageWriteFailureReason::SerializationFailed.to_str(),
            get_storage_write_failure_reason_string(StorageWriteFailureReason::SerializationFailed),
        );
    }

    #[test]
    fn attach_storage_returns_true_and_forwards_changes() {
        let signals = create_storage_signals();
        let changes: std::sync::Arc<std::sync::Mutex<Vec<StorageChange>>> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let c = changes.clone();
        connect_signal(&signals.on_change, Arc::new(move |change: &StorageChange| {
            c.lock().unwrap().push(change.clone());
        }), None);
        let captured: std::sync::Arc<std::sync::Mutex<Option<Arc<dyn Fn(&StorageChange) + Send + Sync>>>> =
            std::sync::Arc::new(std::sync::Mutex::new(None));
        let cap = captured.clone();
        let change_cap = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            subscribe: Arc::new(move |listener| {
                *cap.lock().unwrap() = Some(listener);
                return Some(Arc::new(|| {}) as Arc<dyn Fn() + Send + Sync>);
            }),
        };
        assert!(attach_storage(&change_cap, &signals));
        let guard = captured.lock().unwrap();
        if let Some(ref listener) = *guard {
            listener(&StorageChange {
                key: Some("k".to_string()),
                new_value: Some("v".to_string()),
                old_value: None,
            });
        }
        let log = changes.lock().unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].key, Some("k".to_string()));
    }

    #[test]
    fn clear_storage_removes_all_keys() {
        let backend = memory_backend_with(vec![("a", "1"), ("b", "2")]);
        let result = clear_storage(&backend, None);
        assert!(result.is_ok());
        let keys = get_storage_keys(&backend);
        assert_eq!(keys, StorageValueOutcome::Ok { value: vec![] });
    }

    #[test]
    fn clear_storage_namespace_removes_only_prefixed_keys() {
        let backend = memory_backend_with(vec![("ns.a", "1"), ("ns.b", "2"), ("other", "3")]);
        let ns = StorageNamespace { prefix: "ns".to_string() };
        let result = clear_storage_namespace(&backend, &ns, None);
        assert_eq!(result, StorageBatchMutationOutcome::Ok { completed: 2 });
        assert_eq!(
            get_storage_item(&backend, "other"),
            StorageValueOutcome::Ok { value: Some("3".to_string()) },
        );
    }

    #[test]
    fn create_storage_signals_produces_valid_entity() {
        let signals = create_storage_signals();
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }

    #[test]
    fn destroy_storage_calls_provider_teardown() {
        let destroyed = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let d = destroyed.clone();
        let cap = HostPreferencesChangeCapability {
            destroy: Arc::new(move || {
                d.store(true, std::sync::atomic::Ordering::SeqCst);
            }),
            subscribe: Arc::new(|_| None),
        };
        destroy_storage(&cap);
        assert!(destroyed.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn detach_storage_is_idempotent() {
        let released = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let r = released.clone();
        let cap = HostPreferencesChangeCapability {
            destroy: Arc::new(|| {}),
            subscribe: Arc::new(move |_| {
                let r2 = r.clone();
                return Some(Arc::new(move || {
                    r2.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                }) as Arc<dyn Fn() + Send + Sync>);
            }),
        };
        let signals = create_storage_signals();
        attach_storage(&cap, &signals);
        detach_storage(&signals);
        detach_storage(&signals);
        assert_eq!(released.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn dispose_storage_detaches_and_clears_signal() {
        let signals = create_storage_signals();
        connect_signal(&signals.on_change, Arc::new(|_: &StorageChange| {}), None);
        dispose_storage(&signals);
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }

    #[test]
    fn get_namespaced_storage_byte_size_scopes_to_prefix() {
        let backend = memory_backend_with(vec![("n.a", "xy"), ("other", "ignored")]);
        let ns = StorageNamespace { prefix: "n".to_string() };
        let result = get_namespaced_storage_byte_size(&backend, &ns);
        assert_eq!(result, StorageQueryOutcome::Ok { value: ("n.a".len() + "xy".len()) * 2 });
    }

    #[test]
    fn get_namespaced_storage_entries_strips_prefix() {
        let backend = memory_backend_with(vec![("app.a", "1"), ("app.b", "2"), ("other", "3")]);
        let ns = StorageNamespace { prefix: "app".to_string() };
        let result = get_namespaced_storage_entries(&backend, &ns);
        assert_eq!(
            result,
            StorageQueryOutcome::Ok {
                value: vec![("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())],
            },
        );
    }

    #[test]
    fn get_namespaced_storage_item_reads_prefixed_key() {
        let backend = memory_backend_with(vec![("app.a", "1")]);
        let ns = StorageNamespace { prefix: "app".to_string() };
        assert_eq!(
            get_namespaced_storage_item(&backend, &ns, "a"),
            StorageValueOutcome::Ok { value: Some("1".to_string()) },
        );
    }

    #[test]
    fn get_namespaced_storage_item_presence_reports_missing() {
        let backend = memory_backend();
        let ns = StorageNamespace { prefix: "app".to_string() };
        assert_eq!(
            get_namespaced_storage_item_presence(&backend, &ns, "missing"),
            StorageValueOutcome::Ok { value: false },
        );
    }

    #[test]
    fn get_namespaced_storage_keys_strips_prefix() {
        let backend = memory_backend_with(vec![("app.a", "1"), ("app.b", "2"), ("other", "3")]);
        let ns = StorageNamespace { prefix: "app".to_string() };
        assert_eq!(
            get_namespaced_storage_keys(&backend, &ns),
            StorageValueOutcome::Ok { value: vec!["a".to_string(), "b".to_string()] },
        );
    }

    #[test]
    fn get_storage_boolean_distinguishes_true_false_missing_bad() {
        let backend = memory_backend_with(vec![("t", "true"), ("f", "false"), ("bad", "yes")]);
        assert_eq!(get_storage_boolean(&backend, "t"), StorageValueOutcome::Ok { value: Some(true) });
        assert_eq!(get_storage_boolean(&backend, "f"), StorageValueOutcome::Ok { value: Some(false) });
        assert_eq!(get_storage_boolean(&backend, "missing"), StorageValueOutcome::Ok { value: None });
        assert_eq!(
            get_storage_boolean(&backend, "bad"),
            StorageValueOutcome::Err { reason: StorageReadFailureReason::ParseFailed },
        );
    }

    #[test]
    fn get_storage_boolean_or_returns_fallback_on_parse_failure() {
        let backend = memory_backend_with(vec![("bad", "yes")]);
        assert_eq!(
            get_storage_boolean_or(&backend, "bad", true),
            StorageFallbackOutcome::ParseFailed { value: true },
        );
    }

    #[test]
    fn get_storage_byte_size_returns_total_byte_cost() {
        let backend = memory_backend_with(vec![("ab", "cd")]);
        assert_eq!(
            get_storage_byte_size(&backend),
            StorageQueryOutcome::Ok { value: ("ab".len() + "cd".len()) * 2 },
        );
    }

    #[test]
    fn get_storage_entries_returns_all_pairs() {
        let backend = memory_backend_with(vec![("a", "1"), ("b", "2")]);
        let result = get_storage_entries(&backend);
        assert_eq!(
            result,
            StorageQueryOutcome::Ok {
                value: vec![("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())],
            },
        );
    }

    #[test]
    fn get_storage_item_distinguishes_missing_and_empty() {
        let backend = memory_backend_with(vec![("empty", "")]);
        assert_eq!(
            get_storage_item(&backend, "missing"),
            StorageValueOutcome::Ok { value: None },
        );
        assert_eq!(
            get_storage_item(&backend, "empty"),
            StorageValueOutcome::Ok { value: Some("".to_string()) },
        );
    }

    #[test]
    fn get_storage_item_count_counts_keys() {
        let backend = memory_backend_with(vec![("a", "1"), ("b", "2")]);
        assert_eq!(
            get_storage_item_count(&backend),
            StorageValueOutcome::Ok { value: 2 },
        );
    }

    #[test]
    fn get_storage_item_or_returns_fallback_for_missing() {
        let backend = memory_backend();
        assert_eq!(
            get_storage_item_or(&backend, "missing", "fallback"),
            StorageValueOutcome::Ok { value: "fallback".to_string() },
        );
    }

    #[test]
    fn get_storage_item_presence_returns_true_for_existing() {
        let backend = memory_backend_with(vec![("key", "val")]);
        assert_eq!(
            get_storage_item_presence(&backend, "key"),
            StorageValueOutcome::Ok { value: true },
        );
    }

    #[test]
    fn get_storage_items_returns_ordered_values() {
        let backend = memory_backend_with(vec![("a", "1"), ("b", "2")]);
        assert_eq!(
            get_storage_items(&backend, &["a", "b"]),
            StorageQueryOutcome::Ok { value: vec![Some("1".to_string()), Some("2".to_string())] },
        );
    }

    #[test]
    fn get_storage_json_parses_valid_json() {
        let backend = memory_backend_with(vec![("obj", r#"{"x":1}"#)]);
        let result = get_storage_json(&backend, "obj");
        assert_eq!(
            result,
            StorageValueOutcome::Ok { value: Some(serde_json::json!({"x": 1})) },
        );
    }

    #[test]
    fn get_storage_json_or_returns_fallback_on_parse_failure() {
        let backend = memory_backend_with(vec![("bad", "{")]);
        let fallback = serde_json::json!({"default": true});
        assert_eq!(
            get_storage_json_or(&backend, "bad", fallback.clone()),
            StorageFallbackOutcome::ParseFailed { value: Some(fallback) },
        );
    }

    #[test]
    fn get_storage_keys_returns_sorted_keys() {
        let backend = memory_backend_with(vec![("b", "2"), ("a", "1")]);
        assert_eq!(
            get_storage_keys(&backend),
            StorageValueOutcome::Ok { value: vec!["a".to_string(), "b".to_string()] },
        );
    }

    #[test]
    fn get_storage_number_returns_finite_values() {
        let backend = memory_backend_with(vec![("num", "2.5"), ("bad", "Infinity")]);
        assert_eq!(
            get_storage_number(&backend, "num"),
            StorageValueOutcome::Ok { value: Some(2.5) },
        );
        assert_eq!(
            get_storage_number(&backend, "bad"),
            StorageValueOutcome::Err { reason: StorageReadFailureReason::ParseFailed },
        );
    }

    #[test]
    fn get_storage_number_or_returns_fallback_on_parse_failure() {
        let backend = memory_backend_with(vec![("bad", "Infinity")]);
        assert_eq!(
            get_storage_number_or(&backend, "bad", 7.0),
            StorageFallbackOutcome::ParseFailed { value: 7.0 },
        );
    }

    #[test]
    fn initialize_storage_signals_is_construction_initializer() {
        let signals = create_storage_signals();
        assert!(!flight_signals::has_signal_slots(&signals.on_change));
    }

    #[test]
    fn migrate_storage_runs_callbacks_in_version_order() {
        let backend = memory_backend();
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let s1 = seen.clone();
        let s2 = seen.clone();
        let m1 = StorageMigration {
            version: 2,
            migrate: Arc::new(move |_| { s1.lock().unwrap().push(2); }),
        };
        let m2 = StorageMigration {
            version: 1,
            migrate: Arc::new(move |_| { s2.lock().unwrap().push(1); }),
        };
        let result = migrate_storage(&backend, None, &[&m1, &m2], None);
        assert_eq!(result, StorageMigrationOutcomeInner::Ok { version: 2 });
        assert_eq!(*seen.lock().unwrap(), vec![1, 2]);
    }

    #[test]
    fn remove_namespaced_storage_item_removes_prefixed_key() {
        let backend = memory_backend_with(vec![("ns.a", "1")]);
        let ns = StorageNamespace { prefix: "ns".to_string() };
        let result = remove_namespaced_storage_item(&backend, &ns, "a", None);
        assert!(result.is_ok());
        assert_eq!(get_storage_item(&backend, "ns.a"), StorageValueOutcome::Ok { value: None });
    }

    #[test]
    fn remove_storage_item_returns_ok_for_missing() {
        let backend = memory_backend();
        assert!(remove_storage_item(&backend, "missing", None).is_ok());
    }

    #[test]
    fn remove_storage_items_removes_multiple_keys() {
        let backend = memory_backend_with(vec![("a", "1"), ("b", "2"), ("c", "3")]);
        let result = remove_storage_items(&backend, &["a", "b"], None);
        assert_eq!(result, StorageBatchMutationOutcome::Ok { completed: 2 });
        assert_eq!(get_storage_item(&backend, "a"), StorageValueOutcome::Ok { value: None });
        assert_eq!(get_storage_item(&backend, "c"), StorageValueOutcome::Ok { value: Some("3".to_string()) });
    }

    #[test]
    fn set_namespaced_storage_item_writes_prefixed_key() {
        let backend = memory_backend();
        let ns = StorageNamespace { prefix: "app".to_string() };
        let result = set_namespaced_storage_item(&backend, &ns, "key", "value", None);
        assert!(result.is_ok());
        assert_eq!(
            get_storage_item(&backend, "app.key"),
            StorageValueOutcome::Ok { value: Some("value".to_string()) },
        );
    }

    #[test]
    fn set_storage_boolean_serializes_values() {
        let backend = memory_backend();
        set_storage_boolean(&backend, "flag", true, None);
        assert_eq!(
            get_storage_item(&backend, "flag"),
            StorageValueOutcome::Ok { value: Some("true".to_string()) },
        );
    }

    #[test]
    fn set_storage_item_writes_value() {
        let backend = memory_backend();
        let result = set_storage_item(&backend, "key", "value", None);
        assert!(result.is_ok());
        assert_eq!(
            get_storage_item(&backend, "key"),
            StorageValueOutcome::Ok { value: Some("value".to_string()) },
        );
    }

    #[test]
    fn set_storage_items_writes_all_pairs() {
        let backend = memory_backend();
        let result = set_storage_items(&backend, &[("a", "1"), ("b", "2")], None);
        assert_eq!(result, StorageBatchMutationOutcome::Ok { completed: 2 });
    }

    #[test]
    fn set_storage_json_writes_serialized_value() {
        let backend = memory_backend();
        let result = set_storage_json(&backend, "obj", &serde_json::json!({"x": 1}), None);
        assert!(result.is_ok());
        let stored = get_storage_item(&backend, "obj");
        assert_eq!(
            stored,
            StorageValueOutcome::Ok { value: Some(r#"{"x":1}"#.to_string()) },
        );
    }

    #[test]
    fn set_storage_number_stores_finite_value() {
        let backend = memory_backend();
        let result = set_storage_number(&backend, "num", 2.5, None);
        assert!(result.is_ok());
        assert_eq!(
            get_storage_item(&backend, "num"),
            StorageValueOutcome::Ok { value: Some("2.5".to_string()) },
        );
    }

    #[test]
    #[should_panic(expected = "set_storage_number value must be finite")]
    fn set_storage_number_panics_on_non_finite() {
        let backend = memory_backend();
        set_storage_number(&backend, "nan", f64::NAN, None);
    }

    // ── persistence sugar tests ────────────────────────────────────────────

    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = std::task::Context::from_waker(std::task::Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                std::task::Poll::Ready(value) => return value,
                std::task::Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    #[test]
    fn get_storage_persistence_delegates_to_backend() {
        use flight_permissions::HostPreferencesPersistenceQueryCapability;
        use flight_permissions::StoragePersistenceOutcome;
        use flight_permissions::StoragePersistenceOutcomeReason;
        use flight_permissions::PermissionState;
        use std::pin::Pin;
        let cap = HostPreferencesPersistenceQueryCapability {
            get_persistence: Arc::new(move || {
                Box::pin(async move {
                    Ok(StoragePersistenceOutcome {
                        outcome: StoragePersistenceOutcomeReason::Persistent,
                        permission_state: Some(PermissionState::Granted),
                    })
                }) as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = block_on(get_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, StoragePersistenceOutcomeReason::Persistent);
        assert_eq!(result.permission_state, Some(PermissionState::Granted));
    }

    #[test]
    fn request_storage_persistence_delegates_to_backend() {
        use flight_permissions::HostPreferencesPersistenceRequestCapability;
        use flight_permissions::StoragePersistenceOutcome;
        use flight_permissions::StoragePersistenceOutcomeReason;
        use flight_permissions::PermissionState;
        use std::pin::Pin;
        let cap = HostPreferencesPersistenceRequestCapability {
            request_persistence: Arc::new(move || {
                Box::pin(async move {
                    Ok(StoragePersistenceOutcome {
                        outcome: StoragePersistenceOutcomeReason::BestEffort,
                        permission_state: Some(PermissionState::Denied),
                    })
                }) as Pin<Box<dyn std::future::Future<Output = _> + Send>>
            }),
            provider: Arc::new(()),
        };
        let result = block_on(request_storage_persistence(&cap)).unwrap();
        assert_eq!(result.outcome, StoragePersistenceOutcomeReason::BestEffort);
        assert_eq!(result.permission_state, Some(PermissionState::Denied));
    }
}

// ── Impl sugar (alphabetical by type) ──────────────────────────────────────

impl StorageClearFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_clear_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_clear_failure_reason_string(self);
    }
}

impl StorageClearNamespaceFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_clear_namespace_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_clear_namespace_failure_reason_string(self);
    }
}

impl StorageGetItemFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_get_item_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_get_item_failure_reason_string(self);
    }
}

impl StorageMigrationReadFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_migration_read_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_migration_read_failure_reason_string(self);
    }
}

impl StorageReadFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_read_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_read_failure_reason_string(self);
    }
}

impl StorageRemoveItemFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_remove_item_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_remove_item_failure_reason_string(self);
    }
}

impl StorageSetItemFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_set_item_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_set_item_failure_reason_string(self);
    }
}

impl StorageWriteFailureReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_storage_write_failure_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_storage_write_failure_reason_string(self);
    }
}
