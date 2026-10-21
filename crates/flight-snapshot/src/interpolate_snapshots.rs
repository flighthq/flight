use std::collections::BTreeMap;

use flight_entity::{Record, get_record_keys, get_record_value, set_record_value};
use flight_math::clamp;

use crate::snapshot_schema::{compile_snapshot_schema, get_snapshot_path};
use crate::types::*;

// With no schema the dotted path is never consulted, so it is only built when a schema exists.
fn get_child_path(interpolation: &SnapshotInterpolation, path: &str, key: &str) -> String {
    return match interpolation.paths {
        Some(_) => get_snapshot_path(path, key),
        None => String::new(),
    };
}

/// Interpolates one named field of a container (`key` joined onto the container's `path`): the
/// building block a user state type's `SnapshotInterpolate` implementation calls per field.
// flight-lint: allow(conform-extra) Rust-only helper for user SnapshotInterpolate implementations; the TS walk is generic over object keys
// flight-lint: allow(contract-vocabulary) Principal f1f482ec batch10 item7: typed interpolation through the SnapshotInterpolate trait
pub fn interpolate_snapshot_field<V: SnapshotInterpolate>(
    out: &mut V,
    a: &V,
    b: &V,
    interpolation: &SnapshotInterpolation,
    path: &str,
    key: &str,
) {
    V::interpolate_snapshot(
        out,
        a,
        b,
        interpolation,
        &get_child_path(interpolation, path, key),
    );
}

/// Interpolates between two snapshots into a live mutable `out`: the "tween over instances" for
/// netcode/replay rendering between two fixed frames. `t` is clamped to `[0, 1]`. Numeric leaves
/// lerp (only those whose dotted path the `schema` lists, when one is given; an empty schema lists
/// nothing); every other leaf snaps to a mutable copy of `b`. Containers walk `b`'s shape: vectors
/// are resized to `b`'s length and interpolated positionally, `Option` interpolates when both sides
/// hold a value, and a `Record` or string-keyed `BTreeMap` walks `b`'s keys (keys only in `a` are ignored, extra `out` keys are
/// kept). A top-level non-container is a no-op, as the source is for a top-level primitive.
// flight-lint: allow(contract-vocabulary) Principal f1f482ec batch10 item7: typed interpolation through the SnapshotInterpolate trait
pub fn interpolate_snapshots<T: SnapshotInterpolate>(
    a: &Snapshot<T>,
    b: &Snapshot<T>,
    t: f32,
    out: &mut T,
    schema: Option<&SnapshotSchema>,
) {
    if !T::is_snapshot_container() {
        return;
    }
    let interpolation = SnapshotInterpolation {
        paths: compile_snapshot_schema(schema),
        t: clamp(t, 0.0, 1.0),
    };
    T::interpolate_snapshot(out, a, b, &interpolation, "");
}

fn is_listed(interpolation: &SnapshotInterpolation, path: &str) -> bool {
    return interpolation
        .paths
        .as_ref()
        .is_none_or(|paths| paths.contains(path));
}

// flight-lint: allow(f64) D1: an f64 state leaf lerps in f64 with t widened exactly from f32
fn lerp_f64(a: f64, b: f64, t: f32) -> f64 {
    let t = t as f64;
    return a + (b - a) * t;
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for f32 {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        *out = if is_listed(interpolation, path) {
            flight_math::lerp(*a, *b, interpolation.t)
        } else {
            *b
        };
    }
}

// flight-lint: allow(f64) D1: f64 state leaves (TS numbers that need double precision) interpolate as numbers
// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for f64 {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        *out = if is_listed(interpolation, path) {
            lerp_f64(*a, *b, interpolation.t)
        } else {
            *b
        };
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for bool {
    fn interpolate_snapshot(
        out: &mut Self,
        _a: &Self,
        b: &Self,
        _interpolation: &SnapshotInterpolation,
        _path: &str,
    ) {
        *out = *b;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for i32 {
    fn interpolate_snapshot(
        out: &mut Self,
        _a: &Self,
        b: &Self,
        _interpolation: &SnapshotInterpolation,
        _path: &str,
    ) {
        *out = *b;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for u32 {
    fn interpolate_snapshot(
        out: &mut Self,
        _a: &Self,
        b: &Self,
        _interpolation: &SnapshotInterpolation,
        _path: &str,
    ) {
        *out = *b;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl SnapshotInterpolate for String {
    fn interpolate_snapshot(
        out: &mut Self,
        _a: &Self,
        b: &Self,
        _interpolation: &SnapshotInterpolation,
        _path: &str,
    ) {
        out.clone_from(b);
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V: SnapshotInterpolate> SnapshotInterpolate for Option<V> {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        match (a, b) {
            (Some(a), Some(b)) => {
                let out = out.get_or_insert_with(|| b.clone());
                V::interpolate_snapshot(out, a, b, interpolation, path);
            }
            _ => out.clone_from(b),
        }
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V: SnapshotInterpolate> SnapshotInterpolate for Vec<V> {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        out.truncate(b.len());
        for index in 0..b.len() {
            if index >= out.len() {
                out.push(b[index].clone());
            }
            match a.get(index) {
                Some(a_value) => {
                    let key = index.to_string();
                    interpolate_snapshot_field(
                        &mut out[index],
                        a_value,
                        &b[index],
                        interpolation,
                        path,
                        &key,
                    );
                }
                None => out[index].clone_from(&b[index]),
            }
        }
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V: SnapshotInterpolate, const N: usize> SnapshotInterpolate for [V; N] {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        for index in 0..N {
            let key = index.to_string();
            interpolate_snapshot_field(
                &mut out[index],
                &a[index],
                &b[index],
                interpolation,
                path,
                &key,
            );
        }
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V0: SnapshotInterpolate, V1: SnapshotInterpolate> SnapshotInterpolate for (V0, V1) {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(&mut out.0, &a.0, &b.0, interpolation, path, "0");
        interpolate_snapshot_field(&mut out.1, &a.1, &b.1, interpolation, path, "1");
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V0: SnapshotInterpolate, V1: SnapshotInterpolate, V2: SnapshotInterpolate> SnapshotInterpolate
    for (V0, V1, V2)
{
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        interpolate_snapshot_field(&mut out.0, &a.0, &b.0, interpolation, path, "0");
        interpolate_snapshot_field(&mut out.1, &a.1, &b.1, interpolation, path, "1");
        interpolate_snapshot_field(&mut out.2, &a.2, &b.2, interpolation, path, "2");
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V: SnapshotInterpolate> SnapshotInterpolate for Record<V> {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        for key in get_record_keys(b) {
            let b_value = get_record_value(b, &key).unwrap();
            let value = match get_record_value(a, &key) {
                Some(a_value) => {
                    let mut current = get_record_value(out, &key)
                        .cloned()
                        .unwrap_or_else(|| b_value.clone());
                    interpolate_snapshot_field(
                        &mut current,
                        a_value,
                        b_value,
                        interpolation,
                        path,
                        &key,
                    );
                    current
                }
                None => b_value.clone(),
            };
            set_record_value(out, key, value);
        }
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}

// flight-lint: allow(sugar-delegates) Principal f1f482ec batch10 item7: a SnapshotInterpolate impl is the typed per-type step of the interpolation walk, not method sugar
impl<V: SnapshotInterpolate> SnapshotInterpolate for BTreeMap<String, V> {
    fn interpolate_snapshot(
        out: &mut Self,
        a: &Self,
        b: &Self,
        interpolation: &SnapshotInterpolation,
        path: &str,
    ) {
        for (key, b_value) in b {
            match a.get(key) {
                Some(a_value) => {
                    let current = out.entry(key.clone()).or_insert_with(|| b_value.clone());
                    interpolate_snapshot_field(current, a_value, b_value, interpolation, path, key);
                }
                None => {
                    out.insert(key.clone(), b_value.clone());
                }
            }
        }
    }

    fn is_snapshot_container() -> bool {
        return true;
    }
}
