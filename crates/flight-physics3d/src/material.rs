//! flight-compiler: target-native

/// Combines Coulomb friction coefficients with the geometric mean.
pub fn mix_physics_3d_friction(first: f64, second: f64) -> f64 {
    return first.sqrt() * second.sqrt();
}

/// A contact uses the bouncier surface's restitution.
pub fn mix_physics_3d_restitution(first: f64, second: f64) -> f64 {
    return first.max(second);
}
