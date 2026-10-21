use std::sync::{Arc, RwLock};

use flight_physics2d::*;

fn flags(valid: bool) -> Physics2DStepExplanation {
    return Physics2DStepExplanation {
        body_state_valid: valid,
        contact_state_valid: valid,
        gravity_valid: valid,
        joint_state_valid: valid,
        position_iterations_valid: valid,
        previous_timestep_valid: valid,
        solver_config_valid: valid,
        status: if valid {
            Physics2DStepStatus::Ready
        } else {
            Physics2DStepStatus::InvalidStep
        },
        timestep_valid: valid,
        velocity_iterations_valid: valid,
    };
}

mod explain_physics2d_step {
    use super::*;

    // D15: the source authors Infinity and 1.5 iteration counts; an i32 count holds neither, so the
    // representable faults are the negative counts the same flags reject.
    #[test]
    fn keeps_simultaneous_timestep_and_iteration_faults_visible() {
        let mut world = create_physics2d_world(None, None, None);
        world.config.velocity_iterations = -1;
        world.config.position_iterations = -1;

        let mut expected = flags(true);
        expected.position_iterations_valid = false;
        expected.status = Physics2DStepStatus::InvalidStep;
        expected.timestep_valid = false;
        expected.velocity_iterations_valid = false;
        assert_eq!(explain_physics2d_step(&world, f32::NAN), expected);
    }

    #[test]
    fn reports_a_valid_step_as_ready() {
        assert_eq!(
            explain_physics2d_step(&create_physics2d_world(None, None, None), 1.0 / 60.0),
            flags(true)
        );
    }

    #[test]
    fn reports_simultaneous_world_configuration_body_contact_and_joint_state_faults() {
        let mut world = create_physics2d_world(None, None, None);
        world.gravity_x = f32::NAN;
        world.previous_timestep = -1.0;
        world.config.position_correction = f32::NAN;
        let made = create_rigid_body2d(Physics2DBodyType::Dynamic, f32::NAN, 0.0, None);
        made.write().unwrap().index = 0;
        world.bodies.push(made.clone());
        world.body_by_index.insert(0, made);
        world.contacts.push(Arc::new(RwLock::new(Physics2DContact {
            body_a: 0,
            body_b: 0,
            collider_a: 0,
            collider_b: 0,
            enabled: true,
            friction: 0.0,
            normal_x: f32::NAN,
            normal_y: 0.0,
            point_count: 0,
            points: Vec::new(),
            restitution: 0.0,
            sensor: false,
            touching: false,
        })));
        let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
        let joint: Physics2DJointRef = create_physics2d_distance_joint(&make());
        {
            let mut guard = joint.write().unwrap();
            let fields = guard.joint_fields_mut();
            fields.impulse0 = f32::NAN;
            fields.kind = "Test".to_string();
        }
        world.joints.push(joint);

        let explanation = explain_physics2d_step(&world, 1.0 / 60.0);
        assert!(!explanation.body_state_valid);
        assert!(!explanation.contact_state_valid);
        assert!(!explanation.gravity_valid);
        assert!(!explanation.joint_state_valid);
        assert!(!explanation.previous_timestep_valid);
        assert!(!explanation.solver_config_valid);
        assert_eq!(explanation.status, Physics2DStepStatus::InvalidStep);
    }
}
