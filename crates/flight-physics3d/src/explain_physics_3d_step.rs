use crate::*;

// flight-lint: allow(conform-params) D24 (Principal 21f7557f): the structured computation writes into a caller-owned out
pub fn explain_physics_3d_step(
    out: &mut Physics3DStepExplanation,
    world: &Physics3DWorld,
    dt: f32,
) {
    let config = &world.config;
    let body_state_valid = is_physics_3d_body_state_valid(world);
    let collider_state_valid = is_physics_3d_collider_state_valid(world);
    let contact_state_valid = is_physics_3d_contact_state_valid(world);
    let gravity_valid = is_physics_3d_gravity_valid(world);
    let joint_state_valid = is_physics_3d_joint_state_valid(world);
    let solver_config_valid = is_physics_3d_solver_config_valid(config);
    let substeps_valid = is_physics_3d_substeps_valid(config);
    let timestep_valid = is_physics_3d_timestep_valid(dt);
    let velocity_iterations_valid = is_physics_3d_velocity_iterations_valid(config);
    let position_iterations_valid = is_physics_3d_position_iterations_valid(config);
    let ready = body_state_valid
        && collider_state_valid
        && contact_state_valid
        && gravity_valid
        && joint_state_valid
        && solver_config_valid
        && substeps_valid
        && timestep_valid
        && velocity_iterations_valid
        && position_iterations_valid;
    *out = Physics3DStepExplanation {
        body_state_valid,
        collider_state_valid,
        contact_state_valid,
        gravity_valid,
        joint_state_valid,
        solver_config_valid,
        substeps_valid,
        timestep_valid,
        velocity_iterations_valid,
        position_iterations_valid,
        status: if ready {
            Physics3DStepStatus::Ready
        } else {
            Physics3DStepStatus::InvalidStep
        },
    };
}
