/// Combines Coulomb friction coefficients with the geometric mean.
pub fn mix_physics_3d_friction(first: f32, second: f32) -> f32 {
    return first.sqrt() * second.sqrt();
}

/// A contact uses the bouncier surface's restitution.
pub fn mix_physics_3d_restitution(first: f32, second: f32) -> f32 {
    return first.max(second);
}
