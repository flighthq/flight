use crate::snapshot_value::*;
use crate::types::*;

/// Restores `snapshot` into the live mutable `target`, deep-assigning every field in place. `target`
/// keeps its identity; a compatible nested object or array in `target` is reused and mutated in
/// place, and anything else receives a fresh mutable clone of the snapshot's subtree, so the
/// restored state never aliases the frozen snapshot. Target keys absent from the snapshot are kept.
/// A target array is resized to the snapshot array's length, then restored positionally. A
/// top-level primitive snapshot (or a primitive target) is a no-op.
pub fn restore_snapshot(snapshot: &Snapshot, target: &SnapshotValue) {
    if !is_snapshot_object(snapshot) || !is_snapshot_object(target) {
        return;
    }
    restore_snapshot_into(target, snapshot);
}

// Deep-assigns every own key of `source` into `target` (both objects), recursing through compatible
// containers and resizing arrays to match.
fn restore_snapshot_into(target: &SnapshotValue, source: &SnapshotValue) {
    if is_snapshot_array(source) {
        let length = get_snapshot_length(source);
        set_snapshot_length(target, length);
        for index in 0..length {
            let key = index.to_string();
            let value = restore_snapshot_value(
                &get_snapshot_value(target, &key),
                &get_snapshot_value(source, &key),
            );
            set_snapshot_value(target, &key, value);
        }
        return;
    }
    for key in get_snapshot_keys(source) {
        let value = restore_snapshot_value(
            &get_snapshot_value(target, &key),
            &get_snapshot_value(source, &key),
        );
        set_snapshot_value(target, &key, value);
    }
}

// The value to store for one field: primitives pass through; an object reuses a compatible container
// in `target_value` (mutated in place) or is cloned fresh and mutable.
fn restore_snapshot_value(
    target_value: &SnapshotValue,
    source_value: &SnapshotValue,
) -> SnapshotValue {
    if !is_snapshot_object(source_value) {
        return source_value.clone();
    }
    if is_snapshot_object(target_value)
        && is_snapshot_array(target_value) == is_snapshot_array(source_value)
    {
        restore_snapshot_into(target_value, source_value);
        return target_value.clone();
    }
    return clone_snapshot_value(source_value);
}
