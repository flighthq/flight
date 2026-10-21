use std::sync::Arc;

use crate::snapshot_value::*;
use crate::types::*;

/// Deep structural equality between two snapshots: the same shape with every leaf strictly equal.
/// The same value is equal at once (`===` identity, even holding a `NaN`); otherwise objects must
/// have the same own keys and arrays the same length with element-wise equal entries. Leaves compare
/// with `===`, so `NaN` never equals itself and `-0` equals `+0`. An array never equals an object.
pub fn equals_snapshot(a: &Snapshot, b: &Snapshot) -> bool {
    return snapshot_values_equal(a, b);
}

// JS `a === b` over the snapshot graph: primitives by value (IEEE equality for numbers), objects by
// identity.
fn is_strictly_equal(a: &SnapshotValue, b: &SnapshotValue) -> bool {
    return match (a, b) {
        (SnapshotValue::Undefined, SnapshotValue::Undefined)
        | (SnapshotValue::Null, SnapshotValue::Null) => true,
        (SnapshotValue::Bool(a), SnapshotValue::Bool(b)) => a == b,
        (SnapshotValue::Number(a), SnapshotValue::Number(b)) => a == b,
        (SnapshotValue::String(a), SnapshotValue::String(b)) => a == b,
        (SnapshotValue::Array(a), SnapshotValue::Array(b)) => Arc::ptr_eq(a, b),
        (SnapshotValue::Object(a), SnapshotValue::Object(b)) => Arc::ptr_eq(a, b),
        (SnapshotValue::NonPlain(a), SnapshotValue::NonPlain(b)) => match (&a.value, &b.value) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            _ => false,
        },
        _ => false,
    };
}

fn snapshot_values_equal(a: &SnapshotValue, b: &SnapshotValue) -> bool {
    if is_strictly_equal(a, b) {
        return true;
    }
    if !is_snapshot_object(a) || !is_snapshot_object(b) {
        return false;
    }
    let a_is_array = is_snapshot_array(a);
    if a_is_array != is_snapshot_array(b) {
        return false;
    }
    if a_is_array {
        let length = get_snapshot_length(a);
        if length != get_snapshot_length(b) {
            return false;
        }
        for index in 0..length {
            let key = index.to_string();
            if !snapshot_values_equal(&get_snapshot_value(a, &key), &get_snapshot_value(b, &key)) {
                return false;
            }
        }
        return true;
    }
    let a_keys = get_snapshot_keys(a);
    let b_keys = get_snapshot_keys(b);
    if a_keys.len() != b_keys.len() {
        return false;
    }
    for key in &a_keys {
        if !b_keys.contains(key) {
            return false;
        }
        if !snapshot_values_equal(&get_snapshot_value(a, key), &get_snapshot_value(b, key)) {
            return false;
        }
    }
    return true;
}
