use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{
    Record, Unknown, get_record_keys, get_record_value, set_record_value, throw_type_error,
};

use crate::types::*;

/// A fresh, mutable JS array holding `items`.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned construction of the dynamic plain-value graph
pub fn create_snapshot_array(items: Vec<SnapshotValue>) -> SnapshotValue {
    return SnapshotValue::Array(Arc::new(RwLock::new(SnapshotArray {
        frozen: false,
        items,
    })));
}

/// A non-plain built-in value of `kind`, keeping the original opaque `value`.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned construction of the dynamic plain-value graph
pub fn create_snapshot_non_plain(kind: SnapshotNonPlainKind, value: Unknown) -> SnapshotValue {
    return SnapshotValue::NonPlain(SnapshotNonPlain { kind, value });
}

/// A fresh, mutable plain JS object with `entries` assigned in order (later duplicates overwrite,
/// keeping the first position, as repeated assignment does).
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned construction of the dynamic plain-value graph
pub fn create_snapshot_object(entries: Vec<(String, SnapshotValue)>) -> SnapshotValue {
    let make: fn() -> Record<SnapshotValue> = Record::default;
    let mut record = make();
    for (key, value) in entries {
        set_record_value(&mut record, key, value);
    }
    return SnapshotValue::Object(Arc::new(RwLock::new(SnapshotObject {
        entries: record,
        frozen: false,
    })));
}

fn clone_snapshot_graph(
    value: &SnapshotValue,
    seen: &mut HashMap<usize, SnapshotValue>,
) -> SnapshotValue {
    match value {
        SnapshotValue::Array(array) => {
            let address = Arc::as_ptr(array) as usize;
            if let Some(existing) = seen.get(&address) {
                return existing.clone();
            }
            let out = Arc::new(RwLock::new(SnapshotArray {
                frozen: false,
                items: Vec::new(),
            }));
            seen.insert(address, SnapshotValue::Array(out.clone()));
            let items = array.read().unwrap().items.clone();
            let cloned: Vec<SnapshotValue> = items
                .iter()
                .map(|item| clone_snapshot_graph(item, seen))
                .collect();
            out.write().unwrap().items = cloned;
            return SnapshotValue::Array(out);
        }
        SnapshotValue::Object(object) => {
            let address = Arc::as_ptr(object) as usize;
            if let Some(existing) = seen.get(&address) {
                return existing.clone();
            }
            let make: fn() -> Record<SnapshotValue> = Record::default;
            let out = Arc::new(RwLock::new(SnapshotObject {
                entries: make(),
                frozen: false,
            }));
            seen.insert(address, SnapshotValue::Object(out.clone()));
            let entries: Vec<(String, SnapshotValue)> = {
                let object = object.read().unwrap();
                get_record_keys(&object.entries)
                    .into_iter()
                    .map(|key| {
                        let child = get_record_value(&object.entries, &key).unwrap().clone();
                        (key, child)
                    })
                    .collect()
            };
            for (key, child) in entries {
                let cloned = clone_snapshot_graph(&child, seen);
                set_record_value(&mut out.write().unwrap().entries, key, cloned);
            }
            return SnapshotValue::Object(out);
        }
        _ => return value.clone(),
    }
}

/// `structuredClone(value)`: an independent mutable graph. Each source container maps to exactly
/// one new container, so shared subtrees, aliases and cycles are preserved within the clone and the
/// clone never shares source storage. A non-plain built-in keeps its original opaque value, which
/// this model cannot copy.
pub(crate) fn clone_snapshot_value(value: &SnapshotValue) -> SnapshotValue {
    return clone_snapshot_graph(value, &mut HashMap::new());
}

/// Recursively freezes every array and object reachable from `value`. A container that is already
/// frozen has been seen, so the walk terminates on cycles and visits a shared subtree once.
pub(crate) fn freeze_snapshot_deep(value: &SnapshotValue) {
    let children: Vec<SnapshotValue> = match value {
        SnapshotValue::Array(array) => {
            let mut array = array.write().unwrap();
            if array.frozen {
                return;
            }
            array.frozen = true;
            array.items.clone()
        }
        SnapshotValue::Object(object) => {
            let mut object = object.write().unwrap();
            if object.frozen {
                return;
            }
            object.frozen = true;
            get_record_keys(&object.entries)
                .iter()
                .map(|key| get_record_value(&object.entries, key).unwrap().clone())
                .collect()
        }
        _ => return,
    };
    for child in &children {
        freeze_snapshot_deep(child);
    }
}

// The canonical JS array-index spelling: "0", or digits without a leading zero, below 2^32 - 1.
pub(crate) fn get_array_index(key: &str) -> Option<usize> {
    if key.is_empty()
        || (key.len() > 1 && key.starts_with('0'))
        || !key.bytes().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let index: u64 = key.parse().ok()?;
    return if index < 4_294_967_295 {
        Some(index as usize)
    } else {
        None
    };
}

/// `Object.keys(value)`: an array's element indices, an object's own keys in JS order, and no keys
/// for a non-plain built-in or a primitive.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned access to the dynamic plain-value graph
pub fn get_snapshot_keys(value: &SnapshotValue) -> Vec<String> {
    return match value {
        SnapshotValue::Array(array) => (0..array.read().unwrap().items.len())
            .map(|index| index.to_string())
            .collect(),
        SnapshotValue::Object(object) => get_record_keys(&object.read().unwrap().entries),
        _ => Vec::new(),
    };
}

/// An array's `length` (0 for any other value).
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned access to the dynamic plain-value graph
pub fn get_snapshot_length(value: &SnapshotValue) -> usize {
    return match value {
        SnapshotValue::Array(array) => array.read().unwrap().items.len(),
        _ => 0,
    };
}

/// The property `value[key]`: an array element by index, an object's own property, or `Undefined`
/// when absent (and for primitives and non-plain built-ins, which carry no plain properties).
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned access to the dynamic plain-value graph
pub fn get_snapshot_value(value: &SnapshotValue, key: &str) -> SnapshotValue {
    return match value {
        SnapshotValue::Array(array) => get_array_index(key)
            .and_then(|index| array.read().unwrap().items.get(index).cloned())
            .unwrap_or(SnapshotValue::Undefined),
        SnapshotValue::Object(object) => get_record_value(&object.read().unwrap().entries, key)
            .cloned()
            .unwrap_or(SnapshotValue::Undefined),
        _ => SnapshotValue::Undefined,
    };
}

/// `Array.isArray(value)`.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned access to the dynamic plain-value graph
pub fn is_snapshot_array(value: &SnapshotValue) -> bool {
    return matches!(value, SnapshotValue::Array(_));
}

/// `Object.isFrozen(value)`: true for every primitive (which is immutable) and for a frozen
/// container. A non-plain built-in is never frozen here: freezing one leaves its contents writable.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned access to the dynamic plain-value graph
pub fn is_snapshot_frozen(value: &SnapshotValue) -> bool {
    return match value {
        SnapshotValue::Array(array) => array.read().unwrap().frozen,
        SnapshotValue::Object(object) => object.read().unwrap().frozen,
        SnapshotValue::NonPlain(_) => false,
        _ => true,
    };
}

/// `typeof value === 'object' && value !== null`: arrays, plain objects and non-plain built-ins.
pub(crate) fn is_snapshot_object(value: &SnapshotValue) -> bool {
    return matches!(
        value,
        SnapshotValue::Array(_) | SnapshotValue::Object(_) | SnapshotValue::NonPlain(_)
    );
}

/// Assigns `target.length = length` on an array: truncates, or extends with absent (`Undefined`)
/// elements. A frozen array throws a `TypeError`, as a strict-mode write to a frozen array does.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned mutation of the dynamic plain-value graph
pub fn set_snapshot_length(target: &SnapshotValue, length: usize) {
    if let SnapshotValue::Array(array) = target {
        let mut array = array.write().unwrap();
        if array.frozen {
            drop(array);
            throw_type_error(
                "Cannot assign to read only property 'length' of object '[object Array]'",
            );
        }
        array.items.resize(length, SnapshotValue::Undefined);
    }
}

/// Assigns `target[key] = value`: an array element by index (extending the array with absent
/// elements as needed), or an object's own property. A frozen container throws a `TypeError`, as a
/// strict-mode write to a frozen object does. Arrays carry no named properties in this model, so a
/// non-index key on an array, and any write to a primitive or non-plain built-in, stores nothing.
// flight-lint: allow(conform-extra) Principal 6077f3c7: snapshot-owned mutation of the dynamic plain-value graph
pub fn set_snapshot_value(target: &SnapshotValue, key: &str, value: SnapshotValue) {
    match target {
        SnapshotValue::Array(array) => {
            let mut array = array.write().unwrap();
            if array.frozen {
                drop(array);
                throw_type_error(&format!(
                    "Cannot assign to read only property '{}' of object '[object Array]'",
                    key
                ));
            }
            let Some(index) = get_array_index(key) else {
                return;
            };
            if index >= array.items.len() {
                array.items.resize(index + 1, SnapshotValue::Undefined);
            }
            array.items[index] = value;
        }
        SnapshotValue::Object(object) => {
            let mut object = object.write().unwrap();
            if object.frozen {
                drop(object);
                throw_type_error(&format!(
                    "Cannot assign to read only property '{}' of object '#<Object>'",
                    key
                ));
            }
            set_record_value(&mut object.entries, key.to_string(), value);
        }
        _ => {}
    }
}
