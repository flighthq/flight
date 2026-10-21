use flight_entity::allocate_entity;
use flight_entity::EntityRuntimeSlot;

use crate::{
    Spring, SpringConfig, add_spring_impulse, initialize_spring, is_spring_settled, reset_spring,
    update_spring,
};

/// A 2D spring as a pair of scalar springs.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Spring2D {
    pub x: Spring,
    pub y: Spring,
    runtime: EntityRuntimeSlot,
}

/// Allocate a 2D spring as a pair of scalar springs, each at its value and velocity.
pub fn create_spring2d(
    value_x: Option<f32>,
    value_y: Option<f32>,
    velocity_x: Option<f32>,
    velocity_y: Option<f32>,
) -> Spring2D {
    let mut out: Spring2D = allocate_entity();
    initialize_spring2d(&mut out, value_x, value_y, velocity_x, velocity_y);
    return out;
}

/// Writes per-axis value and velocity into a pre-allocated `Spring2D`.
pub fn initialize_spring2d(
    out: &mut Spring2D,
    value_x: Option<f32>,
    value_y: Option<f32>,
    velocity_x: Option<f32>,
    velocity_y: Option<f32>,
) {
    initialize_spring(&mut out.x, value_x, velocity_x);
    initialize_spring(&mut out.y, value_y, velocity_y);
}

/// Add independent velocity impulses to both axes without changing either value.
pub fn add_spring_impulse_2d(spring2d: &mut Spring2D, velocity_x: f32, velocity_y: f32) {
    add_spring_impulse(&mut spring2d.x, velocity_x);
    add_spring_impulse(&mut spring2d.y, velocity_y);
}

/// Report whether both axes of `spring2d` have settled at (`target_x`, `target_y`) — the
/// per-component `is_spring_settled` on each axis, combined with AND. Epsilons apply to each axis
/// independently.
pub fn is_spring2d_settled(
    spring2d: &Spring2D,
    target_x: f32,
    target_y: f32,
    position_epsilon: f32,
    velocity_epsilon: f32,
) -> bool {
    return is_spring_settled(&spring2d.x, target_x, position_epsilon, velocity_epsilon)
        && is_spring_settled(&spring2d.y, target_y, position_epsilon, velocity_epsilon);
}

/// Snap both axes to the supplied values and velocities, preserving the vector spring's existing
/// axis objects.
pub fn reset_spring2d(
    spring2d: &mut Spring2D,
    value_x: f32,
    value_y: f32,
    velocity_x: Option<f32>,
    velocity_y: Option<f32>,
) {
    reset_spring(&mut spring2d.x, value_x, velocity_x);
    reset_spring(&mut spring2d.y, value_y, velocity_y);
}

/// Advance both axes of `spring2d` one `delta_time` step toward (`target_x`, `target_y`) under the
/// same `config`, applying the scalar `update_spring` per component. The axes are independent;
/// sharing one config just gives them the same response.
pub fn update_spring2d(
    spring2d: &mut Spring2D,
    target_x: f32,
    target_y: f32,
    config: &SpringConfig,
    delta_time: f32,
) {
    update_spring(&mut spring2d.x, target_x, config, delta_time);
    update_spring(&mut spring2d.y, target_y, config, delta_time);
}

impl Spring2D {
    pub fn new(value_x: Option<f32>, value_y: Option<f32>, velocity_x: Option<f32>, velocity_y: Option<f32>) -> Self {
        return create_spring2d(value_x, value_y, velocity_x, velocity_y);
    }

    pub fn add_impulse(&mut self, velocity_x: f32, velocity_y: f32) {
        add_spring_impulse_2d(self, velocity_x, velocity_y);
    }

    pub fn is_settled(
        &self,
        target_x: f32,
        target_y: f32,
        position_epsilon: f32,
        velocity_epsilon: f32,
    ) -> bool {
        return is_spring2d_settled(self, target_x, target_y, position_epsilon, velocity_epsilon);
    }

    pub fn reset(&mut self, value_x: f32, value_y: f32, velocity_x: Option<f32>, velocity_y: Option<f32>) {
        reset_spring2d(self, value_x, value_y, velocity_x, velocity_y);
    }

    pub fn update(
        &mut self,
        target_x: f32,
        target_y: f32,
        config: &SpringConfig,
        delta_time: f32,
    ) {
        update_spring2d(self, target_x, target_y, config, delta_time);
    }
}

flight_entity::impl_entity!(Spring2D);
