use std::sync::Arc;

use flight_snapshot::contract::*;

pub fn num(value: f64) -> SnapshotValue {
    return SnapshotValue::Number(value);
}

pub fn text(value: &str) -> SnapshotValue {
    return SnapshotValue::String(value.to_string());
}

pub fn obj(entries: Vec<(&str, SnapshotValue)>) -> SnapshotValue {
    return create_snapshot_object(
        entries
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect(),
    );
}

pub fn arr(items: Vec<SnapshotValue>) -> SnapshotValue {
    return create_snapshot_array(items);
}

pub fn nums(values: &[f64]) -> SnapshotValue {
    return arr(values.iter().map(|value| num(*value)).collect());
}

pub fn guards() -> SnapshotGuardState {
    return create_snapshot_guard_state();
}

pub fn capture(source: &SnapshotValue) -> Snapshot {
    return capture_snapshot(&guards(), source);
}

pub fn get(value: &SnapshotValue, path: &str) -> SnapshotValue {
    let mut current = value.clone();
    for key in path.split('.') {
        current = get_snapshot_value(&current, key);
    }
    return current;
}

/// `===` on containers: the same node.
pub fn same(a: &SnapshotValue, b: &SnapshotValue) -> bool {
    return match (a, b) {
        (SnapshotValue::Array(a), SnapshotValue::Array(b)) => Arc::ptr_eq(a, b),
        (SnapshotValue::Object(a), SnapshotValue::Object(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
}

/// vitest `toEqual`: recursive structural equality where an `undefined` property equals a missing
/// one and `NaN` equals `NaN`; non-plain values compare by identity.
pub fn to_equal(a: &SnapshotValue, b: &SnapshotValue) -> bool {
    return match (a, b) {
        (SnapshotValue::Undefined, SnapshotValue::Undefined)
        | (SnapshotValue::Null, SnapshotValue::Null) => true,
        (SnapshotValue::Bool(a), SnapshotValue::Bool(b)) => a == b,
        (SnapshotValue::Number(a), SnapshotValue::Number(b)) => {
            a == b || (a.is_nan() && b.is_nan())
        }
        (SnapshotValue::String(a), SnapshotValue::String(b)) => a == b,
        (SnapshotValue::Array(_), SnapshotValue::Array(_)) => {
            get_snapshot_length(a) == get_snapshot_length(b) && {
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, a);
                collected
            }
            .iter()
            .all(|key| to_equal(&get_snapshot_value(a, key), &get_snapshot_value(b, key)))
        }
        (SnapshotValue::Object(_), SnapshotValue::Object(_)) => {
            let defined = |value: &SnapshotValue| -> Vec<String> {
                let mut keys: Vec<String> = {
                    let mut collected = Vec::new();
                    get_snapshot_keys(&mut collected, value);
                    collected
                }
                .into_iter()
                .filter(|key| !matches!(get_snapshot_value(value, key), SnapshotValue::Undefined))
                .collect();
                keys.sort();
                return keys;
            };
            let keys = defined(a);
            keys == defined(b)
                && keys
                    .iter()
                    .all(|key| to_equal(&get_snapshot_value(a, key), &get_snapshot_value(b, key)))
        }
        (SnapshotValue::NonPlain(a), SnapshotValue::NonPlain(b)) => match (&a.value, &b.value) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            _ => false,
        },
        _ => false,
    };
}

pub fn push(array: &SnapshotValue, value: SnapshotValue) {
    set_snapshot_value(array, &get_snapshot_length(array).to_string(), value);
}
