use std::collections::HashMap;
use std::sync::Mutex;

use flight_entity::allocate_entity;
use flight_entity::finish_entity;
use flight_signals::clear_signal;
use flight_signals::create_signal;
use flight_signals::emit_signal;
use flight_signals::has_signal_slots;

use crate::types::HostPreferencesCapability;
use crate::types::HostPreferencesChangeCapability;
use crate::types::StorageBatchMutationOutcome;
use crate::types::StorageBooleanOrResult;
use crate::types::StorageBooleanResult;
use crate::types::StorageByteSizeResult;
use crate::types::StorageChange;
use crate::types::StorageClearNamespaceFailureReason;
use crate::types::StorageClearNamespaceResult;
use crate::types::StorageClearResult;
use crate::types::StorageEntriesResult;
use crate::types::StorageFallbackOutcome;
use crate::types::StorageGetItemFailureReason;
use crate::types::StorageGetItemResult;
use crate::types::StorageItemCountResult;
use crate::types::StorageItemOrResult;
use crate::types::StorageItemsResult;
use crate::types::StorageJsonOrResult;
use crate::types::StorageJsonResult;
use crate::types::StorageJsonWriteResult;
use crate::types::StorageKeysResult;
use crate::types::StorageMigration;
use crate::types::StorageMigrationOutcome;
use crate::types::StorageMigrationOutcomeInner;
use crate::types::StorageMigrationReadFailureReason;
use crate::types::StorageMutationOutcome;
use crate::types::StorageNamespace;
use crate::types::StorageNumberOrResult;
use crate::types::StorageNumberResult;
use crate::types::StoragePresenceResult;
use crate::types::StorageQueryOutcome;
use crate::types::StorageReadFailureReason;
use crate::types::StorageRemoveItemFailureReason;
use crate::types::StorageRemoveItemResult;
use crate::types::StorageRemoveItemsResult;
use crate::types::StorageSetItemFailureReason;
use crate::types::StorageSetItemResult;
use crate::types::StorageSetItemsResult;
use crate::types::StorageSignals;
use crate::types::StorageValueOutcome;
use crate::types::StorageWriteFailureReason;

// flight-lint: allow(hidden-state) Subscription tracking for StorageSignals entities
static SUBSCRIPTIONS: Mutex<Option<HashMap<u64, Box<dyn Fn() + Send + Sync>>>> = Mutex::new(None);

fn subscriptions_map() -> &'static Mutex<Option<HashMap<u64, Box<dyn Fn() + Send + Sync>>>> {
    return &SUBSCRIPTIONS;
}

fn with_subscriptions<R>(f: impl FnOnce(&mut HashMap<u64, Box<dyn Fn() + Send + Sync>>) -> R) -> R {
    let mut guard = subscriptions_map().lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    return f(map);
}

pub fn attach_storage(
    host_preferences_change: &HostPreferencesChangeCapability,
    signals: &StorageSignals,
) -> bool {
    detach_storage(signals);
    let on_change = signals.on_change.clone();
    let unsubscribe = (host_preferences_change.subscribe)(Box::new(move |change: &StorageChange| {
        emit_signal(&on_change, change.clone());
    }));
    let unsubscribe = match unsubscribe {
        Some(u) => u,
        None => return false,
    };
    let key = flight_entity::entity_key(signals);
    with_subscriptions(|map| {
        map.insert(key, unsubscribe);
    });
    return true;
}

pub fn clear_storage(
    host_preferences: &HostPreferencesCapability,
    signals: Option<&StorageSignals>,
) -> StorageClearResult {
    let result = (host_preferences.clear)();
    if result.is_ok() && storage_signals_active(signals) {
        emit_signal(
            &signals.unwrap().on_change,
            StorageChange { key: None, new_value: None, old_value: None },
        );
    }
    return result;
}

pub fn clear_storage_namespace(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
    signals: Option<&StorageSignals>,
) -> StorageClearNamespaceResult {
    let prefix = format!("{}.", namespace.prefix);
    let keys = (host_preferences.keys)();
    let key_list = match keys {
        StorageValueOutcome::Ok { value } => value,
        StorageValueOutcome::Err { reason } => {
            return StorageBatchMutationOutcome::Err {
                completed: 0,
                failed_key: None,
                reason: reason.into_clear_namespace(),
            };
        }
    };
    let mut completed = 0;
    for key in &key_list {
        if !key.starts_with(&prefix) {
            continue;
        }
        let result = remove_storage_item_from_backend(host_preferences, key, signals);
        match result {
            StorageMutationOutcome::Ok => {
                completed += 1;
            }
            StorageMutationOutcome::Err { reason } => {
                return StorageBatchMutationOutcome::Err {
                    completed,
                    failed_key: Some(key.clone()),
                    reason: reason.into_clear_namespace(),
                };
            }
        }
    }
    return StorageBatchMutationOutcome::Ok { completed };
}

pub fn create_storage_signals() -> StorageSignals {
    let mut out = allocate_entity::<StorageSignals>();
    initialize_storage_signals(&mut out);
    return finish_entity(out);
}

pub fn destroy_storage(host_preferences_change: &HostPreferencesChangeCapability) {
    (host_preferences_change.destroy)();
}

pub fn detach_storage(signals: &StorageSignals) {
    let key = flight_entity::entity_key(signals);
    let unsubscribe = with_subscriptions(|map| map.remove(&key));
    if let Some(unsub) = unsubscribe {
        unsub();
    }
}

pub fn dispose_storage(signals: &StorageSignals) {
    detach_storage(signals);
    clear_signal(&signals.on_change);
}

pub fn get_namespaced_storage_byte_size(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
) -> StorageByteSizeResult {
    return get_storage_byte_size_for_prefix(host_preferences, Some(&format!("{}.", namespace.prefix)));
}

pub fn get_namespaced_storage_entries(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
) -> StorageEntriesResult {
    let prefix = format!("{}.", namespace.prefix);
    let result = get_storage_entries_for_prefix(host_preferences, Some(&prefix));
    match result {
        StorageQueryOutcome::Ok { value } => {
            let stripped: Vec<(String, String)> = value
                .into_iter()
                .map(|(key, val)| (key[prefix.len()..].to_string(), val))
                .collect();
            return StorageQueryOutcome::Ok { value: stripped };
        }
        StorageQueryOutcome::Err { failed_key, reason } => {
            return StorageQueryOutcome::Err { failed_key, reason };
        }
    }
}

pub fn get_namespaced_storage_item(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
    key: &str,
) -> StorageGetItemResult {
    return (host_preferences.get_item)(&namespaced_key(namespace, key));
}

pub fn get_namespaced_storage_item_presence(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
    key: &str,
) -> StoragePresenceResult {
    return get_storage_item_presence(host_preferences, &namespaced_key(namespace, key));
}

pub fn get_namespaced_storage_keys(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
) -> StorageKeysResult {
    let prefix = format!("{}.", namespace.prefix);
    let result = (host_preferences.keys)();
    match result {
        StorageValueOutcome::Ok { value } => {
            let filtered: Vec<String> = value
                .iter()
                .filter(|key| key.starts_with(&prefix))
                .map(|key| key[prefix.len()..].to_string())
                .collect();
            return StorageValueOutcome::Ok { value: filtered };
        }
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason };
        }
    }
}

pub fn get_storage_boolean(
    host_preferences: &HostPreferencesCapability,
    key: &str,
) -> StorageBooleanResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason: reason.into_read() };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageValueOutcome::Ok { value: None };
        }
        StorageValueOutcome::Ok { value: Some(ref s) } if s == "true" => {
            return StorageValueOutcome::Ok { value: Some(true) };
        }
        StorageValueOutcome::Ok { value: Some(ref s) } if s == "false" => {
            return StorageValueOutcome::Ok { value: Some(false) };
        }
        StorageValueOutcome::Ok { value: Some(_) } => {
            return StorageValueOutcome::Err { reason: StorageReadFailureReason::ParseFailed };
        }
    }
}

pub fn get_storage_boolean_or(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    fallback: bool,
) -> StorageBooleanOrResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageFallbackOutcome::ProviderError { reason };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageFallbackOutcome::Ok { value: fallback };
        }
        StorageValueOutcome::Ok { value: Some(ref s) } if s == "true" => {
            return StorageFallbackOutcome::Ok { value: true };
        }
        StorageValueOutcome::Ok { value: Some(ref s) } if s == "false" => {
            return StorageFallbackOutcome::Ok { value: false };
        }
        StorageValueOutcome::Ok { value: Some(_) } => {
            return StorageFallbackOutcome::ParseFailed { value: fallback };
        }
    }
}

pub fn get_storage_byte_size(
    host_preferences: &HostPreferencesCapability,
) -> StorageByteSizeResult {
    return get_storage_byte_size_for_prefix(host_preferences, None);
}

pub fn get_storage_entries(
    host_preferences: &HostPreferencesCapability,
) -> StorageEntriesResult {
    return get_storage_entries_for_prefix(host_preferences, None);
}

pub fn get_storage_item(
    host_preferences: &HostPreferencesCapability,
    key: &str,
) -> StorageGetItemResult {
    return (host_preferences.get_item)(key);
}

pub fn get_storage_item_count(
    host_preferences: &HostPreferencesCapability,
) -> StorageItemCountResult {
    let result = (host_preferences.keys)();
    match result {
        StorageValueOutcome::Ok { value } => {
            return StorageValueOutcome::Ok { value: value.len() };
        }
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason };
        }
    }
}

pub fn get_storage_item_or(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    fallback: &str,
) -> StorageItemOrResult {
    let result = (host_preferences.get_item)(key);
    match result {
        StorageValueOutcome::Ok { value } => {
            return StorageValueOutcome::Ok {
                value: value.unwrap_or_else(|| fallback.to_string()),
            };
        }
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason };
        }
    }
}

pub fn get_storage_item_presence(
    host_preferences: &HostPreferencesCapability,
    key: &str,
) -> StoragePresenceResult {
    let result = (host_preferences.get_item)(key);
    match result {
        StorageValueOutcome::Ok { value } => {
            return StorageValueOutcome::Ok { value: value.is_some() };
        }
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason };
        }
    }
}

pub fn get_storage_items(
    host_preferences: &HostPreferencesCapability,
    keys: &[&str],
) -> StorageItemsResult {
    let mut out: Vec<Option<String>> = Vec::new();
    for key in keys {
        let result = (host_preferences.get_item)(key);
        match result {
            StorageValueOutcome::Ok { value } => {
                out.push(value);
            }
            StorageValueOutcome::Err { reason } => {
                return StorageQueryOutcome::Err {
                    failed_key: Some(key.to_string()),
                    reason,
                };
            }
        }
    }
    return StorageQueryOutcome::Ok { value: out };
}

pub fn get_storage_json(
    host_preferences: &HostPreferencesCapability,
    key: &str,
) -> StorageJsonResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason: reason.into_read() };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageValueOutcome::Ok { value: None };
        }
        StorageValueOutcome::Ok { value: Some(s) } => {
            match serde_json::from_str::<serde_json::Value>(&s) {
                Ok(v) => return StorageValueOutcome::Ok { value: Some(v) },
                Err(_) => {
                    return StorageValueOutcome::Err {
                        reason: StorageReadFailureReason::ParseFailed,
                    };
                }
            }
        }
    }
}

pub fn get_storage_json_or(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    fallback: serde_json::Value,
) -> StorageJsonOrResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageFallbackOutcome::ProviderError { reason };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageFallbackOutcome::Ok { value: Some(fallback) };
        }
        StorageValueOutcome::Ok { value: Some(s) } => {
            match serde_json::from_str::<serde_json::Value>(&s) {
                Ok(v) => return StorageFallbackOutcome::Ok { value: Some(v) },
                Err(_) => {
                    return StorageFallbackOutcome::ParseFailed { value: Some(fallback) };
                }
            }
        }
    }
}

pub fn get_storage_keys(
    host_preferences: &HostPreferencesCapability,
) -> StorageKeysResult {
    return (host_preferences.keys)();
}

pub fn get_storage_number(
    host_preferences: &HostPreferencesCapability,
    key: &str,
) -> StorageNumberResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageValueOutcome::Err { reason: reason.into_read() };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageValueOutcome::Ok { value: None };
        }
        StorageValueOutcome::Ok { value: Some(s) } => {
            match s.parse::<f64>() {
                Ok(v) if v.is_finite() => return StorageValueOutcome::Ok { value: Some(v) },
                _ => {
                    return StorageValueOutcome::Err {
                        reason: StorageReadFailureReason::ParseFailed,
                    };
                }
            }
        }
    }
}

pub fn get_storage_number_or(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    fallback: f64,
) -> StorageNumberOrResult {
    let raw = (host_preferences.get_item)(key);
    match raw {
        StorageValueOutcome::Err { reason } => {
            return StorageFallbackOutcome::ProviderError { reason };
        }
        StorageValueOutcome::Ok { value: None } => {
            return StorageFallbackOutcome::Ok { value: fallback };
        }
        StorageValueOutcome::Ok { value: Some(s) } => {
            match s.parse::<f64>() {
                Ok(v) if v.is_finite() => return StorageFallbackOutcome::Ok { value: v },
                _ => return StorageFallbackOutcome::ParseFailed { value: fallback },
            }
        }
    }
}

pub fn initialize_storage_signals(out: &mut StorageSignals) {
    out.on_change = create_signal();
}

pub fn migrate_storage(
    host_preferences: &HostPreferencesCapability,
    namespace: Option<&StorageNamespace>,
    migrations: &[&StorageMigration],
    signals: Option<&StorageSignals>,
) -> StorageMigrationOutcome {
    let sorted = validate_storage_migrations(migrations);
    let version_key = match namespace {
        None => "__flight_storage_version".to_string(),
        Some(ns) => namespaced_key(ns, "__flight_storage_version"),
    };
    let stored_version = (host_preferences.get_item)(&version_key);
    let stored_value = match stored_version {
        StorageValueOutcome::Ok { value } => value,
        StorageValueOutcome::Err { reason } => {
            return StorageMigrationOutcomeInner::ReadVersionFailed {
                reason: reason.into_migration_read(),
            };
        }
    };
    let mut checkpoint: u32 = 0;
    if let Some(s) = stored_value {
        match s.parse::<u32>() {
            Ok(v) => checkpoint = v,
            Err(_) => {
                return StorageMigrationOutcomeInner::ReadVersionFailed {
                    reason: StorageMigrationReadFailureReason::VersionParseFailed,
                };
            }
        }
    }
    let initial_checkpoint = checkpoint;
    for migration in &sorted {
        if migration.version <= initial_checkpoint {
            continue;
        }
        (migration.migrate)(namespace.map(|ns| ns.prefix.as_str()));
        let stored = set_storage_item_on_backend(
            host_preferences,
            &version_key,
            &migration.version.to_string(),
            signals,
        );
        match stored {
            StorageMutationOutcome::Ok => {
                checkpoint = migration.version;
            }
            StorageMutationOutcome::Err { reason } => {
                return StorageMigrationOutcomeInner::CheckpointFailed {
                    failed_version: migration.version,
                    reason,
                    version: checkpoint,
                };
            }
        }
    }
    return StorageMigrationOutcomeInner::Ok { version: checkpoint };
}

pub fn remove_namespaced_storage_item(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
    key: &str,
    signals: Option<&StorageSignals>,
) -> StorageRemoveItemResult {
    return remove_storage_item_from_backend(host_preferences, &namespaced_key(namespace, key), signals);
}

pub fn remove_storage_item(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    signals: Option<&StorageSignals>,
) -> StorageRemoveItemResult {
    return remove_storage_item_from_backend(host_preferences, key, signals);
}

pub fn remove_storage_items(
    host_preferences: &HostPreferencesCapability,
    keys: &[&str],
    signals: Option<&StorageSignals>,
) -> StorageRemoveItemsResult {
    let mut completed = 0;
    for key in keys {
        let result = remove_storage_item_from_backend(host_preferences, key, signals);
        match result {
            StorageMutationOutcome::Ok => {
                completed += 1;
            }
            StorageMutationOutcome::Err { reason } => {
                return StorageBatchMutationOutcome::Err {
                    completed,
                    failed_key: Some(key.to_string()),
                    reason,
                };
            }
        }
    }
    return StorageBatchMutationOutcome::Ok { completed };
}

pub fn set_namespaced_storage_item(
    host_preferences: &HostPreferencesCapability,
    namespace: &StorageNamespace,
    key: &str,
    value: &str,
    signals: Option<&StorageSignals>,
) -> StorageSetItemResult {
    return set_storage_item_on_backend(host_preferences, &namespaced_key(namespace, key), value, signals);
}

pub fn set_storage_boolean(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    value: bool,
    signals: Option<&StorageSignals>,
) -> StorageSetItemResult {
    return set_storage_item_on_backend(
        host_preferences,
        key,
        if value { "true" } else { "false" },
        signals,
    );
}

pub fn set_storage_item(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    value: &str,
    signals: Option<&StorageSignals>,
) -> StorageSetItemResult {
    return set_storage_item_on_backend(host_preferences, key, value, signals);
}

pub fn set_storage_items(
    host_preferences: &HostPreferencesCapability,
    record: &[(&str, &str)],
    signals: Option<&StorageSignals>,
) -> StorageSetItemsResult {
    let mut completed = 0;
    for (key, value) in record {
        let result = set_storage_item_on_backend(host_preferences, key, value, signals);
        match result {
            StorageMutationOutcome::Ok => {
                completed += 1;
            }
            StorageMutationOutcome::Err { reason } => {
                return StorageBatchMutationOutcome::Err {
                    completed,
                    failed_key: Some(key.to_string()),
                    reason,
                };
            }
        }
    }
    return StorageBatchMutationOutcome::Ok { completed };
}

pub fn set_storage_json(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    value: &serde_json::Value,
    signals: Option<&StorageSignals>,
) -> StorageJsonWriteResult {
    let raw = match serde_json::to_string(value) {
        Ok(s) => s,
        Err(_) => {
            return StorageMutationOutcome::Err {
                reason: StorageWriteFailureReason::SerializationFailed,
            };
        }
    };
    let result = set_storage_item_on_backend(host_preferences, key, &raw, signals);
    match result {
        StorageMutationOutcome::Ok => return StorageMutationOutcome::Ok,
        StorageMutationOutcome::Err { reason } => {
            return StorageMutationOutcome::Err {
                reason: match reason {
                    StorageSetItemFailureReason::PersistenceInvalid => StorageWriteFailureReason::PersistenceInvalid,
                    StorageSetItemFailureReason::QuotaExceeded => StorageWriteFailureReason::QuotaExceeded,
                    StorageSetItemFailureReason::ReadFailed => StorageWriteFailureReason::ReadFailed,
                    StorageSetItemFailureReason::RuntimeUnavailable => StorageWriteFailureReason::RuntimeUnavailable,
                    StorageSetItemFailureReason::SecurityDenied => StorageWriteFailureReason::SecurityDenied,
                    StorageSetItemFailureReason::WriteFailed => StorageWriteFailureReason::WriteFailed,
                },
            };
        }
    }
}

pub fn set_storage_number(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    value: f64,
    signals: Option<&StorageSignals>,
) -> StorageSetItemResult {
    if !value.is_finite() {
        panic!("set_storage_number value must be finite");
    }
    return set_storage_item_on_backend(host_preferences, key, &value.to_string(), signals);
}

// ── Private helpers (alphabetical) ───────────────────────────────────────────

fn get_storage_byte_size_for_prefix(
    host_preferences: &HostPreferencesCapability,
    prefix: Option<&str>,
) -> StorageByteSizeResult {
    let keys = (host_preferences.keys)();
    let key_list = match keys {
        StorageValueOutcome::Ok { value } => value,
        StorageValueOutcome::Err { reason } => {
            return StorageQueryOutcome::Err { failed_key: None, reason };
        }
    };
    let mut total: usize = 0;
    for key in &key_list {
        if let Some(p) = prefix {
            if !key.starts_with(p) {
                continue;
            }
        }
        let item = (host_preferences.get_item)(key);
        match item {
            StorageValueOutcome::Ok { value: Some(v) } => {
                total += (key.len() + v.len()) * 2;
            }
            StorageValueOutcome::Ok { value: None } => {}
            StorageValueOutcome::Err { reason } => {
                return StorageQueryOutcome::Err {
                    failed_key: Some(key.clone()),
                    reason,
                };
            }
        }
    }
    return StorageQueryOutcome::Ok { value: total };
}

fn get_storage_entries_for_prefix(
    host_preferences: &HostPreferencesCapability,
    prefix: Option<&str>,
) -> StorageEntriesResult {
    let keys = (host_preferences.keys)();
    let key_list = match keys {
        StorageValueOutcome::Ok { value } => value,
        StorageValueOutcome::Err { reason } => {
            return StorageQueryOutcome::Err { failed_key: None, reason };
        }
    };
    let mut entries: Vec<(String, String)> = Vec::new();
    for key in &key_list {
        if let Some(p) = prefix {
            if !key.starts_with(p) {
                continue;
            }
        }
        let item = (host_preferences.get_item)(key);
        match item {
            StorageValueOutcome::Ok { value: Some(v) } => {
                entries.push((key.clone(), v));
            }
            StorageValueOutcome::Ok { value: None } => {}
            StorageValueOutcome::Err { reason } => {
                return StorageQueryOutcome::Err {
                    failed_key: Some(key.clone()),
                    reason,
                };
            }
        }
    }
    return StorageQueryOutcome::Ok { value: entries };
}

fn namespaced_key(namespace: &StorageNamespace, key: &str) -> String {
    return format!("{}.{}", namespace.prefix, key);
}

fn remove_storage_item_from_backend(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    signals: Option<&StorageSignals>,
) -> StorageRemoveItemResult {
    let active = storage_signals_active(signals);
    let old_value = if active {
        match (host_preferences.get_item)(key) {
            StorageValueOutcome::Ok { value } => value,
            _ => None,
        }
    } else {
        None
    };
    let result = (host_preferences.remove_item)(key);
    if result.is_ok() && active {
        if let Some(old) = old_value {
            emit_signal(
                &signals.unwrap().on_change,
                StorageChange {
                    key: Some(key.to_string()),
                    new_value: None,
                    old_value: Some(old),
                },
            );
        }
    }
    return result;
}

fn set_storage_item_on_backend(
    host_preferences: &HostPreferencesCapability,
    key: &str,
    value: &str,
    signals: Option<&StorageSignals>,
) -> StorageSetItemResult {
    let active = storage_signals_active(signals);
    let old_value = if active {
        match (host_preferences.get_item)(key) {
            StorageValueOutcome::Ok { value } => value,
            _ => None,
        }
    } else {
        None
    };
    let result = (host_preferences.set_item)(key, value);
    if result.is_ok() && active {
        let changed = match &old_value {
            Some(old) => old != value,
            None => true,
        };
        if changed {
            emit_signal(
                &signals.unwrap().on_change,
                StorageChange {
                    key: Some(key.to_string()),
                    new_value: Some(value.to_string()),
                    old_value,
                },
            );
        }
    }
    return result;
}

fn storage_signals_active(signals: Option<&StorageSignals>) -> bool {
    return match signals {
        Some(s) => has_signal_slots(&s.on_change),
        None => false,
    };
}

fn validate_storage_migrations(migrations: &[&StorageMigration]) -> Vec<&StorageMigration> {
    let mut versions = std::collections::HashSet::new();
    for migration in migrations {
        if migration.version == 0 {
            panic!("Storage migration versions must be positive integers");
        }
        if versions.contains(&migration.version) {
            panic!("Storage migration version {} is duplicated", migration.version);
        }
        versions.insert(migration.version);
    }
    let mut sorted: Vec<&StorageMigration> = migrations.to_vec();
    sorted.sort_by_key(|m| m.version);
    return sorted;
}
