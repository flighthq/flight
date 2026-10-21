use std::cmp::Ordering;
use std::collections::HashMap;

use flight_entity::{Kind, NonEntityCreateResult};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_ordinal_table() {
        let vocabulary = vec!["Tag0".to_string(), "Tag1".to_string()];
        assert_eq!(
            OrdinalTable::<String>::new(&vocabulary),
            create_ordinal_table::<String>(&vocabulary)
        );
    }
}

/// The Rust IR carrier for a TS `Map<Kind, T>`. The lookup map is never iterated; `key_order`
/// preserves the insertion order that JavaScript exposes to callers.
#[derive(Clone, Debug, PartialEq)]
pub struct KindMap<T> {
    pub entries: HashMap<Kind, T>,
    pub key_order: Vec<Kind>,
}

/// A dense table indexed by an ordinal already present in the wire format.
#[derive(Clone, Debug, PartialEq)]
pub struct OrdinalTable<T> {
    pub entries: Vec<Option<T>>,
    pub vocabulary: Vec<Kind>,
}

/// Creates an empty dense table with one slot for each vocabulary entry.
pub fn create_ordinal_table<T>(vocabulary: &[Kind]) -> NonEntityCreateResult<OrdinalTable<T>> {
    return OrdinalTable {
        entries: (0..vocabulary.len()).map(|_| None).collect(),
        vocabulary: vocabulary.to_vec(),
    };
}

/// Clones a dense table (D23 value type: copy and clone).
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn clone_ordinal_table<T: Clone>(source: &OrdinalTable<T>) -> OrdinalTable<T> {
    let mut out = create_ordinal_table(&[]);
    copy_ordinal_table(&mut out, source);
    return out;
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

/// Copies the vocabulary and every slot of `source` into `out`, reusing `out`'s storage.
// flight-lint: allow(conform-extra) D23 sweep (Principal 21f7557f): value types carry copy and clone
pub fn copy_ordinal_table<T: Clone>(out: &mut OrdinalTable<T>, source: &OrdinalTable<T>) {
    out.entries.clone_from(&source.entries);
    out.vocabulary.clone_from(&source.vocabulary);
}

/// Writes all keys to `out`, sorted with JavaScript's default UTF-16 code-unit ordering.
pub fn get_kind_map_keys<T>(out: &mut Vec<Kind>, map: &KindMap<T>) {
    out.clear();
    out.extend(map.key_order.iter().cloned());
    out.sort_by(|a, b| compare_utf16(a, b));
}

/// Returns the value at `ordinal`, or `None` when the ordinal is outside the dense table.
pub fn get_ordinal_table_entry<T>(table: &OrdinalTable<T>, ordinal: usize) -> Option<&T> {
    return table.entries.get(ordinal).and_then(Option::as_ref);
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

impl<T> OrdinalTable<T> {
    pub fn new(vocabulary: &[Kind]) -> NonEntityCreateResult<Self> {
        return create_ordinal_table(vocabulary);
    }
}
