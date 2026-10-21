use flight_entity::EntityRuntimeSlot;
use flight_entity::allocate_entity;

use crate::{
    Spring, SpringConfig, add_spring_impulse, initialize_spring, is_spring_settled, reset_spring,
    update_spring,
};

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn spring3d_new_matches_create_spring3d() {
        assert_eq!(Spring3D::new(), create_spring3d());
    }
}

/// A 3D spring as three scalar springs.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Spring3D {
    pub x: Spring,
    pub y: Spring,
    pub z: Spring,
    runtime: EntityRuntimeSlot,
}

/// Allocate a 3D spring as three scalar springs at value and velocity zero. Assign a requested
/// initial state after construction.
// flight-lint: allow(conform-params) D23 (B) zero-field create (foreman-c374f347): assign axis values and velocities after create
pub fn create_spring3d() -> Spring3D {
    let mut out: Spring3D = allocate_entity();
    initialize_spring3d(&mut out);
    return out;
}

/// Writes the canonical zero state into all existing axes of a pre-allocated `Spring3D`.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (foreman-c374f347)
pub fn initialize_spring3d(out: &mut Spring3D) {
    initialize_spring(&mut out.x);
    initialize_spring(&mut out.y);
    initialize_spring(&mut out.z);
}

/// Add independent velocity impulses to all three axes without changing their values.
pub fn add_spring_impulse_3d(
    spring3d: &mut Spring3D,
    velocity_x: f32,
    velocity_y: f32,
    velocity_z: f32,
) {
    add_spring_impulse(&mut spring3d.x, velocity_x);
    add_spring_impulse(&mut spring3d.y, velocity_y);
    add_spring_impulse(&mut spring3d.z, velocity_z);
}

/// Report whether all three axes of `spring3d` have settled at (`target_x`, `target_y`, `target_z`)
/// — the per-component `is_spring_settled` on each axis, combined with AND.
pub fn is_spring3d_settled(
    spring3d: &Spring3D,
    target_x: f32,
    target_y: f32,
    target_z: f32,
    position_epsilon: Option<f32>,
    velocity_epsilon: Option<f32>,
) -> bool {
    return is_spring_settled(&spring3d.x, target_x, position_epsilon, velocity_epsilon)
        && is_spring_settled(&spring3d.y, target_y, position_epsilon, velocity_epsilon)
        && is_spring_settled(&spring3d.z, target_z, position_epsilon, velocity_epsilon);
}

/// Snap all three axes to the supplied values and velocities, preserving the vector spring's
/// existing axis objects.
pub fn reset_spring3d(
    spring3d: &mut Spring3D,
    value_x: f32,
    value_y: f32,
    value_z: f32,
    velocity_x: Option<f32>,
    velocity_y: Option<f32>,
    velocity_z: Option<f32>,
) {
    reset_spring(&mut spring3d.x, value_x, velocity_x);
    reset_spring(&mut spring3d.y, value_y, velocity_y);
    reset_spring(&mut spring3d.z, value_z, velocity_z);
}

/// Advance all three axes of `spring3d` one `delta_time` step toward (`target_x`, `target_y`,
/// `target_z`) under the same `config`, applying the scalar `update_spring` per component.
pub fn update_spring3d(
    spring3d: &mut Spring3D,
    target_x: f32,
    target_y: f32,
    target_z: f32,
    config: &SpringConfig,
    delta_time: f32,
) {
    update_spring(&mut spring3d.x, target_x, config, delta_time);
    update_spring(&mut spring3d.y, target_y, config, delta_time);
    update_spring(&mut spring3d.z, target_z, config, delta_time);
}

impl Spring3D {
    pub fn new() -> Self {
        return create_spring3d();
    }

    pub fn add_impulse(&mut self, velocity_x: f32, velocity_y: f32, velocity_z: f32) {
        add_spring_impulse_3d(self, velocity_x, velocity_y, velocity_z);
    }

    pub fn is_settled(
        &self,
        target_x: f32,
        target_y: f32,
        target_z: f32,
        position_epsilon: Option<f32>,
        velocity_epsilon: Option<f32>,
    ) -> bool {
        return is_spring3d_settled(
            self,
            target_x,
            target_y,
            target_z,
            position_epsilon,
            velocity_epsilon,
        );
    }

    pub fn reset(
        &mut self,
        value_x: f32,
        value_y: f32,
        value_z: f32,
        velocity_x: Option<f32>,
        velocity_y: Option<f32>,
        velocity_z: Option<f32>,
    ) {
        reset_spring3d(
            self, value_x, value_y, value_z, velocity_x, velocity_y, velocity_z,
        );
    }

    pub fn update(
        &mut self,
        target_x: f32,
        target_y: f32,
        target_z: f32,
        config: &SpringConfig,
        delta_time: f32,
    ) {
        update_spring3d(self, target_x, target_y, target_z, config, delta_time);
    }
}

flight_entity::impl_entity!(Spring3D);
