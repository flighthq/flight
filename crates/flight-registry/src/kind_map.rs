//! flight-compiler: target-native
//!
//! `KindMap<T>` is the Rust IR carrier for the JavaScript built-in `Map<Kind, T>`: Rust tracks the
//! insertion order a JS Map keeps natively. The TypeScript twin (`kindMap.ts`) operates on the built-in
//! Map itself, so this module is target-native rather than generated.

use std::cmp::Ordering;
use std::collections::HashMap;

use flight_entity::Kind;

/// The Rust IR carrier for a TS `Map<Kind, T>`. The lookup map is never iterated; `key_order`
/// preserves the insertion order that JavaScript exposes to callers.
#[derive(Clone, Debug, PartialEq)]
pub struct KindMap<T> {
    pub entries: HashMap<Kind, T>,
    pub key_order: Vec<Kind>,
}

fn compare_utf16(a: &str, b: &str) -> Ordering {
    return a.encode_utf16().cmp(b.encode_utf16());
}

/// Copies both maps, preserving base insertion order and then applying the overlay in its own
/// insertion order. Overwriting a base key does not move it.
pub fn concat_kind_map<T: Clone>(base: &KindMap<T>, overlay: &KindMap<T>) -> KindMap<T> {
    let mut entries = base.entries.clone();
    let mut key_order = base.key_order.clone();
    for key in &overlay.key_order {
        let Some(value) = overlay.entries.get(key) else {
            continue;
        };
        if !entries.contains_key(key) {
            key_order.push(key.clone());
        }
        entries.insert(key.clone(), value.clone());
    }
    return KindMap { entries, key_order };
}

/// Writes all keys to `out`, sorted with JavaScript's default UTF-16 code-unit ordering.
pub fn get_kind_map_keys<T>(out: &mut Vec<Kind>, map: &KindMap<T>) {
    out.clear();
    out.extend(map.key_order.iter().cloned());
    out.sort_by(|a, b| compare_utf16(a, b));
}

/// Returns a copy with `key` inserted or replaced. Replacing a key retains its original position.
pub fn with_kind_map_entry<T: Clone>(map: &KindMap<T>, key: Kind, value: T) -> KindMap<T> {
    let mut entries = map.entries.clone();
    let mut key_order = map.key_order.clone();
    if !entries.contains_key(&key) {
        key_order.push(key.clone());
    }
    entries.insert(key, value);
    return KindMap { entries, key_order };
}

/// Returns a copy without `key`. Removing and later reinserting the key appends it at the end.
pub fn without_kind_map_entry<T: Clone>(map: &KindMap<T>, key: Kind) -> KindMap<T> {
    let mut entries = map.entries.clone();
    let mut key_order = map.key_order.clone();
    if entries.remove(&key).is_some() {
        key_order.retain(|candidate| candidate != &key);
    }
    return KindMap { entries, key_order };
}
