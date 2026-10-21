//! The step's precondition flags as data (TS `explainPhysics2DStep.ts`).

use crate::step_validation::*;
use crate::types::*;

/// Every precondition the step checks, and whether it would run (TS `explainPhysics2DStep`).
pub fn explain_physics2d_step(world: &Physics2DWorld, dt: f32) -> Physics2DStepExplanation {
    let body_state_valid = is_physics2d_body_state_valid(world);
    let contact_state_valid = is_physics2d_contact_state_valid(world);
    let gravity_valid = is_physics2d_gravity_valid(world);
    let joint_state_valid = is_physics2d_joint_state_valid(world);
    let previous_timestep_valid = is_physics2d_previous_timestep_valid(world);
    let solver_config_valid = is_physics2d_solver_config_valid(&world.config);
    let timestep_valid = is_physics2d_timestep_valid(dt);
    let velocity_iterations_valid = world.config.velocity_iterations >= 0;
    let position_iterations_valid = world.config.position_iterations >= 0;
    let ready = body_state_valid
        && contact_state_valid
        && gravity_valid
        && joint_state_valid
        && previous_timestep_valid
        && solver_config_valid
        && timestep_valid
        && velocity_iterations_valid
        && position_iterations_valid;
    return Physics2DStepExplanation {
        body_state_valid,
        contact_state_valid,
        gravity_valid,
        joint_state_valid,
        timestep_valid,
        velocity_iterations_valid,
        position_iterations_valid,
        previous_timestep_valid,
        solver_config_valid,
        status: if ready {
            Physics2DStepStatus::Ready
        } else {
            Physics2DStepStatus::InvalidStep
        },
    };
}
