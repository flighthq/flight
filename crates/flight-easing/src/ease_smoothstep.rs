use std::sync::Arc;

use crate::ScalarRemap;

/// Perlin's smootherstep: a higher-order variant with zero first- and
/// second-derivatives at both endpoints.
pub fn ease_smootherstep(t: f32) -> f32 {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/// Hermite smoothstep: a sigmoid-like ease with zero first-derivative at both endpoints.
pub fn ease_smoothstep(t: f32) -> f32 {
    return t * t * (3.0 - 2.0 * t);
}

/// Returns a smoothstep remap over an arbitrary domain [edge0, edge1].
/// The returned function clamps its input to [edge0, edge1], maps to [0, 1],
/// and applies the Hermite smoothstep.
pub fn ease_smoothstep_range(edge0: f32, edge1: f32) -> ScalarRemap {
    return Arc::new(move |x: f32| -> f32 {
        let raw = (x - edge0) / (edge1 - edge0);
        let t = if raw < 0.0 {
            0.0
        } else if raw > 1.0 {
            1.0
        } else {
            raw
        };
        return t * t * (3.0 - 2.0 * t);
    });
}
