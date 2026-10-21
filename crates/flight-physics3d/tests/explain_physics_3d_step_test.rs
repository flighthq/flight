use super::*;
use crate::common::*;

mod explain_physics_3d_step {
    use super::*;

    #[test]
    fn distinguishes_ready_and_invalid_timesteps() {
        let world = world();
        let mut explanation = Physics3DStepExplanation {
            body_state_valid: false,
            collider_state_valid: false,
            contact_state_valid: false,
            gravity_valid: false,
            joint_state_valid: false,
            solver_config_valid: false,
            substeps_valid: false,
            timestep_valid: false,
            velocity_iterations_valid: false,
            position_iterations_valid: false,
            status: Physics3DStepStatus::InvalidStep,
        };
        explain_physics_3d_step(&mut explanation, &world, 1.0);
        assert_eq!(explanation.status, Physics3DStepStatus::Ready);
        explain_physics_3d_step(&mut explanation, &world, 0.0);
        assert_eq!(explanation.status, Physics3DStepStatus::InvalidStep);
        assert!(!explanation.timestep_valid);
    }
}
