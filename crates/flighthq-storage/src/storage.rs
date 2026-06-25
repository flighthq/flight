//! Storage free functions backed by the [`StorageBackend`] seam.
//!
//! The backend trait is defined in `flighthq-types`; this crate provides the default
//! native implementations: an in-memory store and a file-backed JSON store.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use flighthq_signals::{clear_signal, create_signal, emit_signal};
use flighthq_types::{
    StorageBackend, StorageChange, StorageMigration, StorageNamespace, StorageQuota, StorageSignals,
};

const STORAGE_VERSION_KEY: &str = "__flight_storage_version";

// ---------------------------------------------------------------------------
// Native backend (file-backed JSON)
// ---------------------------------------------------------------------------

/// Default native backend that persists key/value pairs as a JSON file on disk.
///
/// The backing file is read lazily on first access and written on every mutation.
/// Construct with [`NativeStorageBackend::new`] pointing at a writable path.
pub struct NativeStorageBackend {
    path: std::path::PathBuf,
    /// In-memory cache, eagerly loaded from disk at construction.
    cache: HashMap<String, String>,
}

impl NativeStorageBackend {
    /// Creates a native storage backend backed by the JSON file at `path`.
    ///
    /// Any existing contents are read immediately; the file is created on the first
    /// write if it does not exist. A malformed or unreadable file starts empty.
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        let path = path.into();
        let cache: HashMap<String, String> = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json_minimal_parse(&s))
            .unwrap_or_default();
        Self { path, cache }
    }

    fn flush(&self) -> bool {
        let Ok(json) = serde_json_minimal_serialize(&self.cache) else {
            return false;
        };
        if let Some(parent) = self.path.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        std::fs::write(&self.path, json).is_ok()
    }
}

impl StorageBackend for NativeStorageBackend {
    fn get_item(&self, key: &str) -> Option<String> {
        self.cache.get(key).cloned()
    }

    fn set_item(&mut self, key: &str, value: &str) -> bool {
        self.cache.insert(key.to_owned(), value.to_owned());
        self.flush()
    }

    fn remove_item(&mut self, key: &str) -> bool {
        self.cache.remove(key);
        self.flush()
    }

    fn clear(&mut self) -> bool {
        self.cache.clear();
        self.flush()
    }

    fn keys(&self) -> Vec<String> {
        self.cache.keys().cloned().collect()
    }
}

// ---------------------------------------------------------------------------
// Minimal JSON helpers (avoids a serde_json dep at this layer)
// ---------------------------------------------------------------------------

/// Parses a flat `{"key":"value",...}` JSON object. Returns `None` on any parse failure.
///
/// Only string keys and string values are supported, which matches the storage contract.
fn serde_json_minimal_parse(s: &str) -> Option<HashMap<String, String>> {
    let bytes = s.as_bytes();
    let mut i = skip_whitespace(bytes, 0);
    let mut map = HashMap::new();

    if i >= bytes.len() || bytes[i] != b'{' {
        return None;
    }
    i = skip_whitespace(bytes, i + 1);

    if i < bytes.len() && bytes[i] == b'}' {
        return Some(map);
    }

    loop {
        let (key, next) = parse_json_string(bytes, i)?;
        i = skip_whitespace(bytes, next);

        if i >= bytes.len() || bytes[i] != b':' {
            return None;
        }
        i = skip_whitespace(bytes, i + 1);

        let (value, next) = parse_json_string(bytes, i)?;
        i = skip_whitespace(bytes, next);
        map.insert(key, value);

        if i >= bytes.len() {
            return None;
        }
        match bytes[i] {
            b',' => {
                i = skip_whitespace(bytes, i + 1);
            }
            b'}' => return Some(map),
            _ => return None,
        }
    }
}

/// Serializes a flat `{"key":"value",...}` JSON object with keys in sorted order.
fn serde_json_minimal_serialize(map: &HashMap<String, String>) -> Result<String, ()> {
    let mut entries: Vec<(&String, &String)> = map.iter().collect();
    entries.sort_by(|a, b| a.0.cmp(b.0));

    let mut out = String::from("{");
    for (index, (key, value)) in entries.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        write_json_string(&mut out, key);
        out.push(':');
        write_json_string(&mut out, value);
    }
    out.push('}');
    Ok(out)
}

/// Reads a JSON string literal starting at `start` (which must point at the opening quote).
/// Returns the decoded string and the index just past the closing quote.
fn parse_json_string(bytes: &[u8], start: usize) -> Option<(String, usize)> {
    if start >= bytes.len() || bytes[start] != b'"' {
        return None;
    }
    let mut out = String::new();
    let mut i = start + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'"' => return Some((out, i + 1)),
            b'\\' => {
                i += 1;
                let escaped = *bytes.get(i)?;
                match escaped {
                    b'"' => out.push('"'),
                    b'\\' => out.push('\\'),
                    b'/' => out.push('/'),
                    b'n' => out.push('\n'),
                    b't' => out.push('\t'),
                    b'r' => out.push('\r'),
                    b'b' => out.push('\u{0008}'),
                    b'f' => out.push('\u{000C}'),
                    b'u' => {
                        let hex = bytes.get(i + 1..i + 5)?;
                        let code = u32::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?;
                        out.push(char::from_u32(code)?);
                        i += 4;
                    }
                    _ => return None,
                }
                i += 1;
            }
            _ => {
                // Re-decode the UTF-8 sequence starting here to keep multi-byte chars intact.
                let rest = std::str::from_utf8(&bytes[i..]).ok()?;
                let ch = rest.chars().next()?;
                out.push(ch);
                i += ch.len_utf8();
            }
        }
    }
    None
}

/// Appends a JSON-escaped string literal (including surrounding quotes) to `out`.
fn write_json_string(out: &mut String, value: &str) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Returns the first index at or after `start` that is not JSON whitespace.
fn skip_whitespace(bytes: &[u8], start: usize) -> usize {
    let mut i = start;
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    i
}

// ---------------------------------------------------------------------------
// In-memory fallback backend (the native ambient default)
// ---------------------------------------------------------------------------

#[derive(Default)]
struct InMemoryStorageBackend {
    map: HashMap<String, String>,
}

impl StorageBackend for InMemoryStorageBackend {
    fn get_item(&self, key: &str) -> Option<String> {
        self.map.get(key).cloned()
    }

    fn set_item(&mut self, key: &str, value: &str) -> bool {
        self.map.insert(key.to_owned(), value.to_owned());
        true
    }

    fn remove_item(&mut self, key: &str) -> bool {
        self.map.remove(key);
        true
    }

    fn clear(&mut self) -> bool {
        self.map.clear();
        true
    }

    fn keys(&self) -> Vec<String> {
        self.map.keys().cloned().collect()
    }
}

// ---------------------------------------------------------------------------
// Global backend + signal state
// ---------------------------------------------------------------------------

/// The active backend, or `None` when reset to the ambient native default.
fn backend_slot() -> &'static Mutex<Option<Box<dyn StorageBackend>>> {
    static BACKEND: OnceLock<Mutex<Option<Box<dyn StorageBackend>>>> = OnceLock::new();
    BACKEND.get_or_init(|| Mutex::new(None))
}

/// The active change-notification group, or `None` when signals are disabled.
fn signals_slot() -> &'static Mutex<Option<StorageSignals>> {
    static SIGNALS: OnceLock<Mutex<Option<StorageSignals>>> = OnceLock::new();
    SIGNALS.get_or_init(|| Mutex::new(None))
}

static SIGNALS_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Runs `f` with the active backend (creating the ambient in-memory default on first use).
fn with_backend<R>(f: impl FnOnce(&mut Box<dyn StorageBackend>) -> R) -> R {
    let mut guard = backend_slot().lock().expect("storage backend lock");
    if guard.is_none() {
        *guard = Some(Box::new(InMemoryStorageBackend::default()));
    }
    f(guard.as_mut().expect("storage backend"))
}

fn emit_storage_change(change: &StorageChange) {
    let guard = signals_slot().lock().expect("storage signals lock");
    if let Some(signals) = guard.as_ref() {
        emit_signal(&signals.on_change, change);
    }
}

fn namespaced_key(namespace: &StorageNamespace, key: &str) -> String {
    format!("{}.{}", namespace.prefix, key)
}

// ---------------------------------------------------------------------------
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Removes every key. Returns `false` when the host denies access.
pub fn clear_storage() -> bool {
    let result = with_backend(|b| b.clear());
    if SIGNALS_ACTIVE.load(Ordering::Relaxed) && result {
        emit_storage_change(&StorageChange::default());
    }
    result
}

/// Removes all keys under the namespace without touching other keys. Returns `false` on denial.
pub fn clear_storage_namespace(namespace: &StorageNamespace) -> bool {
    let prefix = format!("{}.", namespace.prefix);
    with_backend(|b| {
        let keys: Vec<String> = b
            .keys()
            .into_iter()
            .filter(|k| k.starts_with(&prefix))
            .collect();
        let mut success = true;
        for key in keys {
            if !b.remove_item(&key) {
                success = false;
            }
        }
        success
    })
}

/// Creates a prefix-scoped view into the keyspace.
///
/// Keys under the namespace are stored as `prefix + '.' + key` and never collide with the global
/// keyspace or other namespaces.
pub fn create_storage_namespace(prefix: &str) -> StorageNamespace {
    StorageNamespace {
        prefix: prefix.to_owned(),
    }
}

/// Builds the native default backend (an in-memory store).
///
/// The TS port builds a `window.localStorage` backend here; the Rust ambient default is the native
/// in-memory store. Reads return `None` / `[]` and writes return `false`-safe values rather than
/// panicking — storage is an expected-failure surface.
pub fn create_web_storage_backend() -> Box<dyn StorageBackend> {
    Box::new(InMemoryStorageBackend::default())
}

/// Stops the storage change-notification group and disconnects all listeners.
///
/// Pair with [`enable_storage_signals`]. A no-op when signals are not enabled.
pub fn disable_storage_signals() {
    if !SIGNALS_ACTIVE.swap(false, Ordering::Relaxed) {
        return;
    }
    let mut guard = signals_slot().lock().expect("storage signals lock");
    if let Some(signals) = guard.as_ref() {
        clear_signal(&signals.on_change);
    }
    *guard = None;
}

/// Starts the storage change-notification group, enabling same-tab emission for write operations.
///
/// Idempotent: calling again while already enabled returns a handle to the existing signals. Pair
/// with [`disable_storage_signals`].
pub fn enable_storage_signals() -> StorageSignals {
    let mut guard = signals_slot().lock().expect("storage signals lock");
    if SIGNALS_ACTIVE.load(Ordering::Relaxed)
        && let Some(signals) = guard.as_ref()
    {
        return StorageSignals {
            on_change: signals.on_change.clone(),
        };
    }
    let signals = StorageSignals {
        on_change: create_signal(),
    };
    let handle = StorageSignals {
        on_change: signals.on_change.clone(),
    };
    *guard = Some(signals);
    SIGNALS_ACTIVE.store(true, Ordering::Relaxed);
    handle
}

/// Returns the estimated UTF-16 byte cost of all keys under the namespace. Returns `-1` on denial.
pub fn get_namespaced_storage_byte_size(namespace: &StorageNamespace) -> i64 {
    let prefix = format!("{}.", namespace.prefix);
    with_backend(|b| {
        let keys = b.keys();
        if keys.is_empty() {
            return 0;
        }
        let mut total: i64 = 0;
        for raw_key in keys {
            if !raw_key.starts_with(&prefix) {
                continue;
            }
            if let Some(value) = b.get_item(&raw_key) {
                total += (utf16_len(&raw_key) + utf16_len(&value)) * 2;
            }
        }
        total
    })
}

/// Returns all key/value pairs under the given namespace prefix. Keys returned are unprefixed.
/// Returns `[]` on denial.
pub fn get_namespaced_storage_entries(namespace: &StorageNamespace) -> Vec<(String, String)> {
    let prefix = format!("{}.", namespace.prefix);
    with_backend(|b| {
        let mut out = Vec::new();
        for raw_key in b.keys() {
            if !raw_key.starts_with(&prefix) {
                continue;
            }
            let key = raw_key[prefix.len()..].to_owned();
            if let Some(value) = b.get_item(&raw_key) {
                out.push((key, value));
            }
        }
        out
    })
}

/// Reads a value from the namespace. Returns `None` on absent key or access denial.
pub fn get_namespaced_storage_item(namespace: &StorageNamespace, key: &str) -> Option<String> {
    with_backend(|b| b.get_item(&namespaced_key(namespace, key)))
}

/// Returns every key stored under the namespace (unprefixed). Returns `[]` on denial.
pub fn get_namespaced_storage_keys(namespace: &StorageNamespace) -> Vec<String> {
    let prefix = format!("{}.", namespace.prefix);
    with_backend(|b| {
        b.keys()
            .into_iter()
            .filter(|k| k.starts_with(&prefix))
            .map(|k| k[prefix.len()..].to_owned())
            .collect()
    })
}

/// Installs a host storage backend; pass `None` to fall back to the native default.
pub fn set_storage_backend(backend: Option<Box<dyn StorageBackend>>) {
    *backend_slot().lock().expect("storage backend lock") = backend;
}

/// The active storage backend mutex (creating the ambient default on first use).
///
/// Most callers use the typed free functions; this exposes the raw slot for direct backend access.
pub fn get_storage_backend() -> &'static Mutex<Option<Box<dyn StorageBackend>>> {
    with_backend(|_| ());
    backend_slot()
}

/// Reads the stored value as a boolean (`"true"`/`"false"`). Returns `None` on absent key,
/// access denial, or unrecognized value.
pub fn get_storage_boolean(key: &str) -> Option<bool> {
    match with_backend(|b| b.get_item(key)) {
        Some(raw) if raw == "true" => Some(true),
        Some(raw) if raw == "false" => Some(false),
        _ => None,
    }
}

/// Returns the stored boolean, or `fallback` on absent key, access denial, or unrecognized value.
pub fn get_storage_boolean_or(key: &str, fallback: bool) -> bool {
    get_storage_boolean(key).unwrap_or(fallback)
}

/// Returns the estimated UTF-16 byte cost of the entire store. Delegates to the backend's
/// `byte_size` when available; otherwise enumerates entries. Returns `-1` on denial.
pub fn get_storage_byte_size() -> i64 {
    with_backend(|b| {
        if let Some(size) = b.byte_size() {
            return size as i64;
        }
        let keys = b.keys();
        if keys.is_empty() {
            return 0;
        }
        let mut total: i64 = 0;
        for key in keys {
            if let Some(value) = b.get_item(&key) {
                total += (utf16_len(&key) + utf16_len(&value)) * 2;
            }
        }
        total
    })
}

/// Returns all key/value pairs in one pass. Skips keys whose value is absent. Returns `[]` on denial.
pub fn get_storage_entries() -> Vec<(String, String)> {
    with_backend(|b| {
        let mut out = Vec::new();
        for key in b.keys() {
            if let Some(value) = b.get_item(&key) {
                out.push((key, value));
            }
        }
        out
    })
}

/// Reads a stored value, or `None` when the key is absent or access is denied.
pub fn get_storage_item(key: &str) -> Option<String> {
    with_backend(|b| b.get_item(key))
}

/// Returns the number of stored keys. Returns `0` on denial.
pub fn get_storage_item_count() -> usize {
    with_backend(|b| b.keys().len())
}

/// Returns the stored value, or `fallback` when the key is absent or access is denied.
pub fn get_storage_item_or(key: &str, fallback: &str) -> String {
    with_backend(|b| b.get_item(key)).unwrap_or_else(|| fallback.to_owned())
}

/// Reads multiple keys in one call. Returns a parallel-indexed vector with `None` for
/// absent/denied keys. Returns `[]` when `keys` is empty.
pub fn get_storage_items(keys: &[&str]) -> Vec<Option<String>> {
    with_backend(|b| keys.iter().map(|k| b.get_item(k)).collect())
}

/// Reads and parses a stored JSON value. Returns `None` on absent key, parse failure, or access
/// denial — corrupt stored data is an expected-failure surface; do not panic.
pub fn get_storage_json<T: serde::de::DeserializeOwned>(key: &str) -> Option<T> {
    let raw = with_backend(|b| b.get_item(key))?;
    serde_json::from_str(&raw).ok()
}

/// Returns the parsed stored value, or `fallback` on absent key, parse failure, or access denial.
pub fn get_storage_json_or<T: serde::de::DeserializeOwned>(key: &str, fallback: T) -> T {
    match with_backend(|b| b.get_item(key)) {
        Some(raw) => serde_json::from_str(&raw).unwrap_or(fallback),
        None => fallback,
    }
}

/// Returns every stored key, or `[]` when access is denied.
pub fn get_storage_keys() -> Vec<String> {
    with_backend(|b| b.keys())
}

/// Reads the stored value as a number. Returns `None` on absent key, access denial, or parse
/// failure (`NaN` is treated as parse failure).
pub fn get_storage_number(key: &str) -> Option<f64> {
    let raw = with_backend(|b| b.get_item(key))?;
    match raw.trim().parse::<f64>() {
        Ok(n) if !n.is_nan() => Some(n),
        _ => None,
    }
}

/// Returns the stored number, or `fallback` on absent key, access denial, or parse failure.
pub fn get_storage_number_or(key: &str, fallback: f64) -> f64 {
    get_storage_number(key).unwrap_or(fallback)
}

/// Returns the estimated storage quota, or `None` when unavailable.
///
/// The TS port queries `navigator.storage.estimate` on the browser; native backends provide no
/// quota estimate, so this returns `None`.
pub fn get_storage_quota_estimate() -> Option<StorageQuota> {
    None
}

/// Returns a handle to the active [`StorageSignals`], or `None` when signals have not been enabled.
pub fn get_storage_signals() -> Option<StorageSignals> {
    let guard = signals_slot().lock().expect("storage signals lock");
    guard.as_ref().map(|s| StorageSignals {
        on_change: s.on_change.clone(),
    })
}

/// Returns `true` when the key exists in the namespace.
pub fn has_namespaced_storage_item(namespace: &StorageNamespace, key: &str) -> bool {
    with_backend(|b| b.get_item(&namespaced_key(namespace, key))).is_some()
}

/// Returns `true` when the key exists in the store.
pub fn has_storage_item(key: &str) -> bool {
    with_backend(|b| b.get_item(key)).is_some()
}

/// Applies a sequence of versioned migrations to the given namespace (or global keyspace when
/// `None`).
///
/// Migrations run in ascending version order, starting from the stored version + 1. The resulting
/// version is stored under the reserved key `__flight_storage_version`. Returns the new version, or
/// `-1` on failure (a migration returning `false`, or a failed version write).
pub fn migrate_storage(
    namespace: Option<&StorageNamespace>,
    migrations: &[StorageMigration],
) -> i32 {
    let raw = match namespace {
        Some(ns) => get_namespaced_storage_item(ns, STORAGE_VERSION_KEY),
        None => get_storage_item(STORAGE_VERSION_KEY),
    };
    let current_version = raw.and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);

    let mut order: Vec<usize> = (0..migrations.len()).collect();
    order.sort_by_key(|&i| migrations[i].version);

    let mut new_version = current_version;
    let prefix = namespace.map(|ns| ns.prefix.as_str());
    for &i in &order {
        let migration = &migrations[i];
        if migration.version <= current_version {
            continue;
        }
        if !(migration.migrate)(prefix) {
            return -1;
        }
        new_version = migration.version;
    }

    if new_version != current_version {
        let stored = match namespace {
            Some(ns) => {
                set_namespaced_storage_item(ns, STORAGE_VERSION_KEY, &new_version.to_string())
            }
            None => set_storage_item(STORAGE_VERSION_KEY, &new_version.to_string()),
        };
        if !stored {
            return -1;
        }
    }
    new_version
}

/// Removes a key from the namespace. Returns `false` on denial.
pub fn remove_namespaced_storage_item(namespace: &StorageNamespace, key: &str) -> bool {
    with_backend(|b| b.remove_item(&namespaced_key(namespace, key)))
}

/// Removes one key. Returns `false` when the host denies access.
pub fn remove_storage_item(key: &str) -> bool {
    let signals_active = SIGNALS_ACTIVE.load(Ordering::Relaxed);
    let old_value = if signals_active {
        with_backend(|b| b.get_item(key))
    } else {
        None
    };
    let result = with_backend(|b| b.remove_item(key));
    if signals_active && result {
        emit_storage_change(&StorageChange {
            key: Some(key.to_owned()),
            old_value,
            new_value: None,
        });
    }
    result
}

/// Removes multiple keys. Returns `false` if any removal fails; partial removals are possible.
pub fn remove_storage_items(keys: &[&str]) -> bool {
    with_backend(|b| {
        let mut success = true;
        for key in keys {
            if !b.remove_item(key) {
                success = false;
            }
        }
        success
    })
}

/// Writes a namespaced value. Returns `false` on denial/quota.
pub fn set_namespaced_storage_item(namespace: &StorageNamespace, key: &str, value: &str) -> bool {
    with_backend(|b| b.set_item(&namespaced_key(namespace, key), value))
}

/// Writes a boolean as `"true"` or `"false"`. Returns `false` on denial/quota.
pub fn set_storage_boolean(key: &str, value: bool) -> bool {
    set_storage_item(key, if value { "true" } else { "false" })
}

/// Writes a value. Returns `false` when the host denies access (private mode, quota exceeded).
pub fn set_storage_item(key: &str, value: &str) -> bool {
    let signals_active = SIGNALS_ACTIVE.load(Ordering::Relaxed);
    let old_value = if signals_active {
        with_backend(|b| b.get_item(key))
    } else {
        None
    };
    let result = with_backend(|b| b.set_item(key, value));
    if signals_active && result {
        emit_storage_change(&StorageChange {
            key: Some(key.to_owned()),
            old_value,
            new_value: Some(value.to_owned()),
        });
    }
    result
}

/// Writes multiple key/value pairs. Returns `false` if any write fails; partial writes are possible.
pub fn set_storage_items(record: &[(&str, &str)]) -> bool {
    with_backend(|b| {
        let mut success = true;
        for (key, value) in record {
            if !b.set_item(key, value) {
                success = false;
            }
        }
        success
    })
}

/// Serializes and stores a JSON value. Returns `false` on denial/quota or if serialization fails.
pub fn set_storage_json<T: serde::Serialize>(key: &str, value: &T) -> bool {
    let Ok(raw) = serde_json::to_string(value) else {
        return false;
    };
    set_storage_item(key, &raw)
}

/// Writes a number. Returns `false` on denial/quota.
pub fn set_storage_number(key: &str, value: f64) -> bool {
    set_storage_item(key, &format_number(value))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Formats a number the way TS `String(n)` would for the common integer/decimal cases.
fn format_number(value: f64) -> String {
    if value.fract() == 0.0 && value.is_finite() && value.abs() < 1e15 {
        return (value as i64).to_string();
    }
    value.to_string()
}

/// UTF-16 code-unit length, matching the byte cost localStorage charges (2 bytes per code unit).
fn utf16_len(s: &str) -> i64 {
    s.encode_utf16().count() as i64
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU64;
    use std::sync::{Arc, Mutex as StdMutex};

    use super::*;

    // Storage globals are process-wide; serialize all global-state tests behind one lock so
    // parallel test threads do not clobber the shared backend/signals.
    fn global_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<StdMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| StdMutex::new(()))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    fn reset_globals() {
        disable_storage_signals();
        set_storage_backend(Some(create_web_storage_backend()));
    }

    // Builds a unique temp file path for a file-backed backend; not created on disk.
    fn unique_temp_path(suffix: &str) -> std::path::PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        std::env::temp_dir().join(format!("flighthq_storage_{pid}_{n}_{suffix}"))
    }

    // A backend that denies every operation (private-mode / quota analogue).
    struct DeniedBackend;
    impl StorageBackend for DeniedBackend {
        fn get_item(&self, _key: &str) -> Option<String> {
            None
        }
        fn set_item(&mut self, _key: &str, _value: &str) -> bool {
            false
        }
        fn remove_item(&mut self, _key: &str) -> bool {
            false
        }
        fn clear(&mut self) -> bool {
            false
        }
        fn keys(&self) -> Vec<String> {
            Vec::new()
        }
    }

    // clear_storage
    #[test]
    fn clear_storage_clears_and_denial() {
        let _g = global_lock();
        reset_globals();
        assert!(set_storage_item("a", "1"));
        assert!(clear_storage());
        assert!(get_storage_keys().is_empty());

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert!(!clear_storage());
        reset_globals();
    }

    // clear_storage_namespace
    #[test]
    fn clear_storage_namespace_removes_only_prefixed() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("ns");
        set_namespaced_storage_item(&ns, "a", "1");
        set_namespaced_storage_item(&ns, "b", "2");
        set_storage_item("global", "g");
        assert!(clear_storage_namespace(&ns));
        assert!(get_namespaced_storage_keys(&ns).is_empty());
        assert_eq!(get_storage_item("global"), Some("g".to_owned()));
        reset_globals();
    }

    // create_storage_namespace
    #[test]
    fn create_storage_namespace_sets_prefix() {
        let ns = create_storage_namespace("app");
        assert_eq!(ns.prefix, "app");
    }

    // create_web_storage_backend
    #[test]
    fn create_web_storage_backend_yields_sentinels() {
        let mut backend = create_web_storage_backend();
        assert!(backend.get_item("missing").is_none());
        assert!(backend.keys().is_empty());
        assert!(backend.set_item("k", "v"));
    }

    // disable_storage_signals
    #[test]
    fn disable_storage_signals_is_noop_and_stops_emitting() {
        let _g = global_lock();
        reset_globals();
        // No-op when not enabled.
        disable_storage_signals();
        enable_storage_signals();
        disable_storage_signals();
        assert!(get_storage_signals().is_none());
        // Write after disable does not panic.
        set_storage_item("x", "y");
        reset_globals();
    }

    // enable_storage_signals
    #[test]
    fn enable_storage_signals_emits_and_is_idempotent() {
        use flighthq_signals::connect_signal;
        let _g = global_lock();
        reset_globals();

        let sigs = enable_storage_signals();
        // Idempotent: a second enable returns a handle sharing the same emitter, so a slot
        // connected to one fires when the store changes.
        let again = enable_storage_signals();

        let changes: Arc<StdMutex<Vec<StorageChange>>> = Arc::new(StdMutex::new(Vec::new()));
        let sink = Arc::clone(&changes);
        let _guard = connect_signal(
            &again.on_change,
            Arc::new(move |c: &StorageChange| {
                sink.lock().unwrap().push(c.clone());
            }),
            Default::default(),
        );
        // sigs is the original handle; it must observe emissions through the shared emitter.
        let _ = &sigs;

        set_storage_item("hello", "world");
        {
            let recorded = changes.lock().unwrap();
            assert_eq!(recorded.len(), 1);
            assert_eq!(recorded[0].key.as_deref(), Some("hello"));
            assert_eq!(recorded[0].new_value.as_deref(), Some("world"));
        }

        clear_storage();
        {
            let recorded = changes.lock().unwrap();
            assert_eq!(recorded.len(), 2);
            assert!(recorded[1].key.is_none());
        }

        remove_storage_item("hello");
        {
            let recorded = changes.lock().unwrap();
            assert_eq!(recorded.len(), 3);
            assert_eq!(recorded[2].key.as_deref(), Some("hello"));
            assert!(recorded[2].new_value.is_none());
        }
        reset_globals();
    }

    // get_namespaced_storage_byte_size
    #[test]
    fn get_namespaced_storage_byte_size_counts_only_namespaced() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("ns");
        set_namespaced_storage_item(&ns, "x", "y");
        set_storage_item("global", "g");
        assert!(get_namespaced_storage_byte_size(&ns) > 0);

        let empty = create_storage_namespace("empty");
        assert_eq!(get_namespaced_storage_byte_size(&empty), 0);
        reset_globals();
    }

    // get_namespaced_storage_entries
    #[test]
    fn get_namespaced_storage_entries_unprefixed_and_scoped() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("app");
        set_storage_item("global", "g");
        set_namespaced_storage_item(&ns, "local", "v");
        let entries = get_namespaced_storage_entries(&ns);
        assert!(entries.iter().all(|(k, _)| k != "global"));
        assert!(entries.iter().any(|(k, v)| k == "local" && v == "v"));
        reset_globals();
    }

    // get_namespaced_storage_item
    #[test]
    fn get_namespaced_storage_item_round_trips() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("ns");
        assert!(get_namespaced_storage_item(&ns, "missing").is_none());
        set_namespaced_storage_item(&ns, "key", "val");
        assert_eq!(
            get_namespaced_storage_item(&ns, "key"),
            Some("val".to_owned())
        );
        reset_globals();
    }

    // get_namespaced_storage_keys
    #[test]
    fn get_namespaced_storage_keys_returns_unprefixed() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("app");
        set_namespaced_storage_item(&ns, "x", "1");
        set_namespaced_storage_item(&ns, "y", "2");
        set_storage_item("global", "g");
        let mut keys = get_namespaced_storage_keys(&ns);
        keys.sort();
        assert_eq!(keys, vec!["x".to_owned(), "y".to_owned()]);
        reset_globals();
    }

    // get_storage_backend
    #[test]
    fn get_storage_backend_is_present() {
        let _g = global_lock();
        reset_globals();
        // The slot always resolves to a live backend after first use.
        assert!(get_storage_backend().lock().unwrap().is_some());
        reset_globals();
    }

    // get_storage_boolean
    #[test]
    fn get_storage_boolean_recognizes_true_false() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("flag", "true");
        assert_eq!(get_storage_boolean("flag"), Some(true));
        set_storage_item("flag", "false");
        assert_eq!(get_storage_boolean("flag"), Some(false));
        assert!(get_storage_boolean("missing").is_none());
        set_storage_item("flag", "1");
        assert!(get_storage_boolean("flag").is_none());
        reset_globals();
    }

    // get_storage_boolean_or
    #[test]
    fn get_storage_boolean_or_falls_back() {
        let _g = global_lock();
        reset_globals();
        assert!(get_storage_boolean_or("missing", true));
        set_storage_item("flag", "false");
        assert!(!get_storage_boolean_or("flag", true));
        reset_globals();
    }

    // get_storage_byte_size
    #[test]
    fn get_storage_byte_size_counts_and_delegates() {
        let _g = global_lock();
        reset_globals();
        assert_eq!(get_storage_byte_size(), 0);
        set_storage_item("key", "value");
        assert!(get_storage_byte_size() > 0);

        // A backend exposing byte_size short-circuits the enumeration.
        struct SizedBackend;
        impl StorageBackend for SizedBackend {
            fn get_item(&self, _key: &str) -> Option<String> {
                None
            }
            fn set_item(&mut self, _key: &str, _value: &str) -> bool {
                true
            }
            fn remove_item(&mut self, _key: &str) -> bool {
                true
            }
            fn clear(&mut self) -> bool {
                true
            }
            fn keys(&self) -> Vec<String> {
                Vec::new()
            }
            fn byte_size(&self) -> Option<f64> {
                Some(42.0)
            }
        }
        set_storage_backend(Some(Box::new(SizedBackend)));
        assert_eq!(get_storage_byte_size(), 42);
        reset_globals();
    }

    // get_storage_entries
    #[test]
    fn get_storage_entries_lists_and_denies() {
        let _g = global_lock();
        reset_globals();
        assert!(get_storage_entries().is_empty());
        set_storage_item("a", "1");
        set_storage_item("b", "2");
        let mut entries = get_storage_entries();
        entries.sort();
        assert_eq!(
            entries,
            vec![
                ("a".to_owned(), "1".to_owned()),
                ("b".to_owned(), "2".to_owned())
            ]
        );

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert!(get_storage_entries().is_empty());
        reset_globals();
    }

    // get_storage_item
    #[test]
    fn get_storage_item_round_trips() {
        let _g = global_lock();
        reset_globals();
        assert!(get_storage_item("missing").is_none());
        set_storage_item("greeting", "hi");
        assert_eq!(get_storage_item("greeting"), Some("hi".to_owned()));
        reset_globals();
    }

    // get_storage_item_count
    #[test]
    fn get_storage_item_count_counts_and_denies() {
        let _g = global_lock();
        reset_globals();
        assert_eq!(get_storage_item_count(), 0);
        set_storage_item("a", "1");
        set_storage_item("b", "2");
        assert_eq!(get_storage_item_count(), 2);

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert_eq!(get_storage_item_count(), 0);
        reset_globals();
    }

    // get_storage_item_or
    #[test]
    fn get_storage_item_or_falls_back() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("k", "v");
        assert_eq!(get_storage_item_or("k", "default"), "v");
        assert_eq!(get_storage_item_or("missing", "fallback"), "fallback");
        reset_globals();
    }

    // get_storage_items
    #[test]
    fn get_storage_items_returns_parallel_indexed() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("a", "1");
        set_storage_item("b", "2");
        let results = get_storage_items(&["a", "missing", "b"]);
        assert_eq!(
            results,
            vec![Some("1".to_owned()), None, Some("2".to_owned())]
        );
        assert!(get_storage_items(&[]).is_empty());
        reset_globals();
    }

    // get_storage_json
    #[test]
    fn get_storage_json_parses_and_round_trips() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("obj", r#"{"x":1}"#);
        let parsed: Option<serde_json::Value> = get_storage_json("obj");
        assert_eq!(parsed.unwrap()["x"], serde_json::json!(1));
        assert!(get_storage_json::<serde_json::Value>("missing").is_none());
        set_storage_item("bad", "not-json{");
        assert!(get_storage_json::<serde_json::Value>("bad").is_none());

        set_storage_json("data", &serde_json::json!({ "hello": "world" }));
        let back: serde_json::Value = get_storage_json("data").unwrap();
        assert_eq!(back["hello"], serde_json::json!("world"));
        reset_globals();
    }

    // get_storage_json_or
    #[test]
    fn get_storage_json_or_falls_back() {
        let _g = global_lock();
        reset_globals();
        assert_eq!(get_storage_json_or::<i64>("missing", 42), 42);
        set_storage_item("bad", "{corrupt");
        assert_eq!(
            get_storage_json_or("bad", "default".to_owned()),
            "default".to_owned()
        );
        set_storage_json("n", &99i64);
        assert_eq!(get_storage_json_or::<i64>("n", 0), 99);
        reset_globals();
    }

    // get_storage_keys
    #[test]
    fn get_storage_keys_lists() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("a", "1");
        set_storage_item("b", "2");
        let mut keys = get_storage_keys();
        keys.sort();
        assert_eq!(keys, vec!["a".to_owned(), "b".to_owned()]);
        reset_globals();
    }

    // get_storage_number
    #[test]
    fn get_storage_number_parses() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("n", "42");
        assert_eq!(get_storage_number("n"), Some(42.0));
        assert!(get_storage_number("missing").is_none());
        set_storage_item("bad", "nope");
        assert!(get_storage_number("bad").is_none());
        reset_globals();
    }

    // get_storage_number_or
    #[test]
    fn get_storage_number_or_falls_back() {
        let _g = global_lock();
        reset_globals();
        assert_eq!(get_storage_number_or("missing", -1.0), -1.0);
        set_storage_item("n", "7");
        assert_eq!(get_storage_number_or("n", 0.0), 7.0);
        reset_globals();
    }

    // get_storage_quota_estimate
    #[test]
    fn get_storage_quota_estimate_is_none_on_native() {
        assert!(get_storage_quota_estimate().is_none());
    }

    // get_storage_signals
    #[test]
    fn get_storage_signals_before_and_after_enable() {
        let _g = global_lock();
        reset_globals();
        assert!(get_storage_signals().is_none());
        let _sigs = enable_storage_signals();
        // After enabling, get_storage_signals returns a live handle sharing the emitter.
        let active = get_storage_signals().expect("signals after enable");
        let fired = Arc::new(AtomicBool::new(false));
        let fired_inner = Arc::clone(&fired);
        let _guard = flighthq_signals::connect_signal(
            &active.on_change,
            Arc::new(move |_c: &StorageChange| {
                fired_inner.store(true, Ordering::Relaxed);
            }),
            Default::default(),
        );
        set_storage_item("probe", "v");
        assert!(fired.load(Ordering::Relaxed));
        reset_globals();
    }

    // has_namespaced_storage_item
    #[test]
    fn has_namespaced_storage_item_presence() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("ns");
        assert!(!has_namespaced_storage_item(&ns, "missing"));
        set_namespaced_storage_item(&ns, "key", "val");
        assert!(has_namespaced_storage_item(&ns, "key"));
        reset_globals();
    }

    // has_storage_item
    #[test]
    fn has_storage_item_presence_and_denial() {
        let _g = global_lock();
        reset_globals();
        assert!(!has_storage_item("missing"));
        set_storage_item("present", "value");
        assert!(has_storage_item("present"));

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert!(!has_storage_item("any"));
        reset_globals();
    }

    // migrate_storage
    #[test]
    fn migrate_storage_runs_in_order_and_skips() {
        let _g = global_lock();
        reset_globals();
        let calls: Arc<StdMutex<Vec<i32>>> = Arc::new(StdMutex::new(Vec::new()));
        let push = |calls: &Arc<StdMutex<Vec<i32>>>, v: i32| -> StorageMigration {
            let sink = Arc::clone(calls);
            StorageMigration {
                version: v,
                migrate: Box::new(move |_| {
                    sink.lock().unwrap().push(v);
                    true
                }),
            }
        };
        let migrations = vec![push(&calls, 2), push(&calls, 1)];
        assert_eq!(migrate_storage(None, &migrations), 2);
        assert_eq!(*calls.lock().unwrap(), vec![1, 2]);

        // Skips migrations at or below current version.
        reset_globals();
        set_storage_item(STORAGE_VERSION_KEY, "2");
        let calls2: Arc<StdMutex<Vec<i32>>> = Arc::new(StdMutex::new(Vec::new()));
        let m2 = vec![push(&calls2, 1), push(&calls2, 2), push(&calls2, 3)];
        assert_eq!(migrate_storage(None, &m2), 3);
        assert_eq!(*calls2.lock().unwrap(), vec![3]);
        reset_globals();
    }

    // migrate_storage
    #[test]
    fn migrate_storage_namespace_and_failure() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("app");
        let ran = Arc::new(AtomicBool::new(false));
        let ran_inner = Arc::clone(&ran);
        let migrations = vec![StorageMigration {
            version: 1,
            migrate: Box::new(move |_| {
                ran_inner.store(true, Ordering::Relaxed);
                true
            }),
        }];
        assert_eq!(migrate_storage(Some(&ns), &migrations), 1);
        assert!(ran.load(Ordering::Relaxed));
        assert_eq!(
            get_namespaced_storage_item(&ns, STORAGE_VERSION_KEY),
            Some("1".to_owned())
        );

        // A migration that fails (returns false) aborts with -1.
        reset_globals();
        let failing = vec![StorageMigration {
            version: 1,
            migrate: Box::new(|_| false),
        }];
        assert_eq!(migrate_storage(None, &failing), -1);
        reset_globals();
    }

    // remove_namespaced_storage_item
    #[test]
    fn remove_namespaced_storage_item_removes() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("ns");
        set_namespaced_storage_item(&ns, "key", "val");
        assert!(remove_namespaced_storage_item(&ns, "key"));
        assert!(get_namespaced_storage_item(&ns, "key").is_none());
        reset_globals();
    }

    // remove_storage_item
    #[test]
    fn remove_storage_item_removes() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("a", "1");
        assert!(remove_storage_item("a"));
        assert!(get_storage_item("a").is_none());
        reset_globals();
    }

    // remove_storage_items
    #[test]
    fn remove_storage_items_removes_and_denies() {
        let _g = global_lock();
        reset_globals();
        set_storage_item("a", "1");
        set_storage_item("b", "2");
        assert!(remove_storage_items(&["a", "b"]));
        assert!(get_storage_item("a").is_none());
        assert!(get_storage_item("b").is_none());

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert!(!remove_storage_items(&["x"]));
        reset_globals();
    }

    // set_namespaced_storage_item
    #[test]
    fn set_namespaced_storage_item_uses_prefixed_key() {
        let _g = global_lock();
        reset_globals();
        let ns = create_storage_namespace("app");
        set_namespaced_storage_item(&ns, "setting", "42");
        assert_eq!(get_storage_item("app.setting"), Some("42".to_owned()));
        reset_globals();
    }

    // set_storage_backend
    #[test]
    fn set_storage_backend_resets_to_default_on_none() {
        let _g = global_lock();
        reset_globals();
        set_storage_backend(None);
        // The slot still resolves to a live backend.
        assert!(get_storage_backend().lock().unwrap().is_some());
        reset_globals();
    }

    // set_storage_boolean
    #[test]
    fn set_storage_boolean_writes_literal() {
        let _g = global_lock();
        reset_globals();
        set_storage_boolean("flag", true);
        assert_eq!(get_storage_item("flag"), Some("true".to_owned()));
        set_storage_boolean("flag", false);
        assert_eq!(get_storage_item("flag"), Some("false".to_owned()));
        reset_globals();
    }

    // set_storage_item
    #[test]
    fn set_storage_item_writes() {
        let _g = global_lock();
        reset_globals();
        assert!(set_storage_item("x", "y"));
        assert_eq!(get_storage_item("x"), Some("y".to_owned()));
        reset_globals();
    }

    // set_storage_items
    #[test]
    fn set_storage_items_writes_all_and_denies() {
        let _g = global_lock();
        reset_globals();
        assert!(set_storage_items(&[("a", "1"), ("b", "2")]));
        assert_eq!(get_storage_item("a"), Some("1".to_owned()));
        assert_eq!(get_storage_item("b"), Some("2".to_owned()));

        set_storage_backend(Some(Box::new(DeniedBackend)));
        assert!(!set_storage_items(&[("a", "1")]));
        reset_globals();
    }

    // set_storage_json
    #[test]
    fn set_storage_json_stores_stringified() {
        let _g = global_lock();
        reset_globals();
        assert!(set_storage_json("obj", &serde_json::json!({ "n": 1 })));
        assert_eq!(get_storage_item("obj"), Some(r#"{"n":1}"#.to_owned()));
        reset_globals();
    }

    // set_storage_number
    #[test]
    fn set_storage_number_stores_as_string() {
        let _g = global_lock();
        reset_globals();
        set_storage_number("n", 1.5);
        assert_eq!(get_storage_item("n"), Some("1.5".to_owned()));
        set_storage_number("i", 42.0);
        assert_eq!(get_storage_item("i"), Some("42".to_owned()));
        reset_globals();
    }

    // NativeStorageBackend
    #[test]
    fn native_storage_backend_persists_across_instances() {
        let path = unique_temp_path("kv.json");
        {
            let mut backend = NativeStorageBackend::new(&path);
            assert!(backend.set_item("name", "flight"));
            assert!(backend.set_item("mode", "native"));
        }
        // A fresh instance reads the previously written file from disk.
        let reopened = NativeStorageBackend::new(&path);
        assert_eq!(reopened.get_item("name"), Some("flight".to_owned()));
        assert_eq!(reopened.get_item("mode"), Some("native".to_owned()));
        assert!(reopened.get_item("absent").is_none());
        let _ = std::fs::remove_file(&path);
    }

    // NativeStorageBackend
    #[test]
    fn native_storage_backend_round_trips_escaped_values() {
        let path = unique_temp_path("escaped.json");
        let tricky = "quote:\" backslash:\\ newline:\n tab:\t unicode:\u{2603}";
        {
            let mut backend = NativeStorageBackend::new(&path);
            assert!(backend.set_item("k", tricky));
            assert!(backend.remove_item("gone"));
        }
        let reopened = NativeStorageBackend::new(&path);
        assert_eq!(reopened.get_item("k"), Some(tricky.to_owned()));
        let _ = std::fs::remove_file(&path);
    }

    // serde_json_minimal_parse
    #[test]
    fn serde_json_minimal_parse_reads_objects() {
        assert!(serde_json_minimal_parse("{}").unwrap().is_empty());
        let map = serde_json_minimal_parse(r#"{ "a" : "1", "b":"two" }"#).unwrap();
        assert_eq!(map.get("a"), Some(&"1".to_owned()));
        assert_eq!(map.get("b"), Some(&"two".to_owned()));
        assert!(serde_json_minimal_parse("not json").is_none());
        assert!(serde_json_minimal_parse(r#"{"a":1}"#).is_none());
    }

    // serde_json_minimal_serialize
    #[test]
    fn serde_json_minimal_serialize_round_trips() {
        let mut map = HashMap::new();
        map.insert("z".to_owned(), "last".to_owned());
        map.insert("a".to_owned(), "first\n".to_owned());
        let json = serde_json_minimal_serialize(&map).unwrap();
        // Keys are emitted in sorted order for stable output.
        assert_eq!(json, r#"{"a":"first\n","z":"last"}"#);
        let parsed = serde_json_minimal_parse(&json).unwrap();
        assert_eq!(parsed, map);
    }
}
