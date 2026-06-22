//! Internal helpers — not part of the public API.

use flighthq_types::Tween;

/// Snapshot current target property values into each `TweenPropertyDetail` and
/// compute `change = end - start`. After this call `tween.initialized` is `true`.
///
/// Each property already carries its `change` field pre-seeded with the desired
/// end value at creation time. `current_values` maps property keys to the
/// target's current numeric values; the caller is responsible for reading the
/// target's actual fields and passing them here, since Rust cannot do generic
/// property lookup by string key. Missing keys default to `0`.
pub(crate) fn initialize_tween(tween: &mut Tween, current_values: &[(String, f32)]) {
    let smart_rotation = tween.smart_rotation;
    for detail in &mut tween.properties {
        let start = current_values
            .iter()
            .find(|(k, _)| *k == detail.key)
            .map(|(_, v)| *v)
            .unwrap_or(0.0);
        // `change` holds the end value pre-seeded at creation; convert it to a delta.
        let end = detail.change;
        detail.start = start;
        detail.change = end - start;
        if smart_rotation {
            let mut change = detail.change.rem_euclid(360.0);
            if change > 180.0 {
                change -= 360.0;
            }
            detail.change = change;
        }
    }
    tween.initialized = true;
}
