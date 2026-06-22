//! Storage free functions backed by the [`StorageBackend`] seam.
//!
//! The backend trait is defined in `flighthq-types`; this crate provides the default
//! native implementations: an in-memory store and a file-backed JSON store.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use flighthq_types::StorageBackend;

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
        if let Some(parent) = self.path.parent() {
            if std::fs::create_dir_all(parent).is_err() {
                return false;
            }
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
// Global backend slot
// ---------------------------------------------------------------------------

/// Thread-safe wrapper around the active `StorageBackend`.
struct BackendCell(Mutex<Box<dyn StorageBackend>>);

static BACKEND: OnceLock<BackendCell> = OnceLock::new();

fn get_backend_cell() -> &'static BackendCell {
    BACKEND.get_or_init(|| {
        // Default: in-memory backend (no disk I/O when no path is configured).
        BackendCell(Mutex::new(Box::new(InMemoryStorageBackend::default())))
    })
}

// ---------------------------------------------------------------------------
// In-memory fallback backend (used when no path is provided)
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
// Public free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Removes every key. Returns `false` when the host denies access.
pub fn clear_storage() -> bool {
    get_backend_cell()
        .0
        .lock()
        .expect("storage backend lock")
        .clear()
}

/// The active storage backend (behind a mutex; use the free functions for normal access).
pub fn get_storage_backend() -> &'static Mutex<Box<dyn StorageBackend>> {
    &get_backend_cell().0
}

/// Reads a stored value, or `None` when the key is absent or access is denied.
pub fn get_storage_item(key: &str) -> Option<String> {
    get_backend_cell()
        .0
        .lock()
        .expect("storage backend lock")
        .get_item(key)
}

/// Returns every stored key, or `[]` when access is denied.
pub fn get_storage_keys() -> Vec<String> {
    get_backend_cell()
        .0
        .lock()
        .expect("storage backend lock")
        .keys()
}

/// Removes one key. Returns `false` when the host denies access.
pub fn remove_storage_item(key: &str) -> bool {
    get_backend_cell()
        .0
        .lock()
        .expect("storage backend lock")
        .remove_item(key)
}

/// Installs a native host storage backend.
///
/// # Panics
///
/// Panics if called after the backend has already been initialized.
pub fn set_storage_backend(backend: Box<dyn StorageBackend>) {
    if BACKEND.set(BackendCell(Mutex::new(backend))).is_err() {
        panic!("storage backend already initialized");
    }
}

/// Writes a value. Returns `false` when the host denies access (private mode, quota exceeded).
pub fn set_storage_item(key: &str, value: &str) -> bool {
    get_backend_cell()
        .0
        .lock()
        .expect("storage backend lock")
        .set_item(key, value)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    // Builds a unique temp file path for a file-backed backend; not created on disk.
    fn unique_temp_path(suffix: &str) -> std::path::PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        std::env::temp_dir().join(format!("flighthq_storage_{pid}_{n}_{suffix}"))
    }

    // clear_storage
    #[test]
    fn clear_storage_removes_all_keys() {
        let mut backend = InMemoryStorageBackend::default();
        backend.set_item("a", "1");
        backend.set_item("b", "2");
        backend.clear();
        assert!(backend.keys().is_empty());
    }

    // get_storage_item
    #[test]
    fn get_storage_item_returns_none_when_absent() {
        let backend = InMemoryStorageBackend::default();
        assert!(backend.get_item("missing").is_none());
    }

    // get_storage_keys
    #[test]
    fn get_storage_keys_returns_inserted_keys() {
        let mut backend = InMemoryStorageBackend::default();
        backend.set_item("x", "1");
        let keys = backend.keys();
        assert!(keys.contains(&"x".to_owned()));
    }

    // remove_storage_item
    #[test]
    fn remove_storage_item_removes_key() {
        let mut backend = InMemoryStorageBackend::default();
        backend.set_item("k", "v");
        backend.remove_item("k");
        assert!(backend.get_item("k").is_none());
    }

    // set_storage_item
    #[test]
    fn set_storage_item_roundtrip() {
        let mut backend = InMemoryStorageBackend::default();
        assert!(backend.set_item("hello", "world"));
        assert_eq!(backend.get_item("hello"), Some("world".to_owned()));
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
