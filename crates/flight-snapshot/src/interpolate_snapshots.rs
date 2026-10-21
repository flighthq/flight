use std::collections::HashSet;

use crate::snapshot_schema::{compile_snapshot_schema, get_snapshot_path};
use crate::snapshot_value::*;
use crate::types::*;

// The source's `clamp(value, min, max)` from @flighthq/math, over JS numbers.
// flight-lint: allow(f64) Principal 6077f3c7: exact source arithmetic over JS numbers
fn clamp_number(value: f64, min: f64, max: f64) -> f64 {
    return if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    };
}

// Reuses `existing` when it is already a container of the needed kind, else allocates a fresh empty
// one, so the walk can recurse into `out` even when `out` did not mirror the snapshot's shape.
fn ensure_snapshot_container(existing: &SnapshotValue, is_array: bool) -> SnapshotValue {
    if is_snapshot_object(existing) && is_snapshot_array(existing) == is_array {
        return existing.clone();
    }
    return if is_array {
        create_snapshot_array(Vec::new())
    } else {
        create_snapshot_object(Vec::new())
    };
}

/// Interpolates between two snapshots into a live mutable `out`: the "tween over instances" for
/// netcode/replay rendering between two fixed frames. `t` is clamped to `[0, 1]`. Each numeric leaf
/// present as a number in both `a` and `b` receives `lerp(a, b, t)`; every other leaf (strings,
/// booleans, `null`/`undefined`, or a number in only one snapshot) snaps to a mutable clone of `b`'s
/// value. Nested objects and arrays are walked over `b`'s keys; arrays are resized to `b`'s length.
/// With a `schema`, only numeric leaves whose dotted path it lists interpolate; an empty schema lists
/// nothing, and no schema interpolates every numeric leaf. A non-object `a`, `b` or `out` is a no-op.
// flight-lint: allow(f64) Principal 6077f3c7: t is a JS number applied to f64 snapshot numbers
pub fn interpolate_snapshots(
    a: &Snapshot,
    b: &Snapshot,
    t: f64,
    out: &SnapshotValue,
    schema: Option<&SnapshotSchema>,
) {
    if !is_snapshot_object(a) || !is_snapshot_object(b) || !is_snapshot_object(out) {
        return;
    }
    // Compiled once per call. `None` (no schema) stays distinct from an empty set.
    let paths = compile_snapshot_schema(schema);
    interpolate_snapshots_into(out, a, b, clamp_number(t, 0.0, 1.0), paths.as_ref(), "");
}

// Walks `b` (the destination shape) key by key, writing each interpolated or snapped field into
// `out`, reading the matching value from `a`. `prefix` is the dotted path to the current container.
// flight-lint: allow(f64) Principal 6077f3c7: t is a JS number applied to f64 snapshot numbers
fn interpolate_snapshots_into(
    out: &SnapshotValue,
    a: &SnapshotValue,
    b: &SnapshotValue,
    t: f64,
    paths: Option<&HashSet<String>>,
    prefix: &str,
) {
    if is_snapshot_array(b) {
        set_snapshot_length(out, get_snapshot_length(b));
    }
    let mut keys = Vec::new();
    get_snapshot_keys(&mut keys, b);
    for key in keys {
        let a_value = get_snapshot_value(a, &key);
        let b_value = get_snapshot_value(b, &key);
        if let (SnapshotValue::Number(a_number), SnapshotValue::Number(b_number)) =
            (&a_value, &b_value)
        {
            // With no schema the dotted path is never consulted, so it is only built when one exists.
            let listed = paths.is_none_or(|paths| paths.contains(&get_snapshot_path(prefix, &key)));
            let value = if listed {
                lerp_number(*a_number, *b_number, t)
            } else {
                *b_number
            };
            set_snapshot_value(out, &key, SnapshotValue::Number(value));
            continue;
        }
        if is_snapshot_object(&a_value)
            && is_snapshot_object(&b_value)
            && is_snapshot_array(&a_value) == is_snapshot_array(&b_value)
        {
            let container = ensure_snapshot_container(
                &get_snapshot_value(out, &key),
                is_snapshot_array(&b_value),
            );
            set_snapshot_value(out, &key, container.clone());
            let child_prefix = match paths {
                Some(_) => get_snapshot_path(prefix, &key),
                None => String::new(),
            };
            interpolate_snapshots_into(&container, &a_value, &b_value, t, paths, &child_prefix);
            continue;
        }
        let snapped = if is_snapshot_object(&b_value) {
            clone_snapshot_value(&b_value)
        } else {
            b_value
        };
        set_snapshot_value(out, &key, snapped);
    }
}

// The source's `lerp(a, b, t)` from @flighthq/math: `a + (b - a) * t`, over JS numbers.
// flight-lint: allow(f64) Principal 6077f3c7: exact source arithmetic over JS numbers
fn lerp_number(a: f64, b: f64, t: f64) -> f64 {
    return a + (b - a) * t;
}
