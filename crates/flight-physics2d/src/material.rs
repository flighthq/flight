//! Contact surface mixing (TS `material.ts`).

/// JS `Math.max` over two numbers: NaN when either is NaN.
pub(crate) fn js_max(a: f32, b: f32) -> f32 {
    if a.is_nan() || b.is_nan() {
        return f32::NAN;
    }
    return if a > b { a } else { b };
}

/// JS `Math.min` over two numbers: NaN when either is NaN.
pub(crate) fn js_min(a: f32, b: f32) -> f32 {
    if a.is_nan() || b.is_nan() {
        return f32::NAN;
    }
    return if a < b { a } else { b };
}

/// The pair friction: the geometric mean of both surfaces (TS `mixPhysics2DFriction`).
pub fn mix_physics2d_friction(first: f32, second: f32) -> f32 {
    return first.sqrt() * second.sqrt();
}

/// The pair restitution: the bouncier surface wins (TS `mixPhysics2DRestitution`).
pub fn mix_physics2d_restitution(first: f32, second: f32) -> f32 {
    return js_max(first, second);
}
