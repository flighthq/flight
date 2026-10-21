use super::*;
use crate::common::*;

fn assert_close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 1e-5,
        "actual={actual}, expected={expected}"
    );
}

fn bodies() -> (RigidBody3DRef, RigidBody3DRef) {
    (unit_body(), unit_body())
}

fn joint() -> flight_entity::Ref<Physics3DFixedJoint> {
    physics_3d_fixed_joint(&frame_options(0, 1))
}

fn new_state() -> Vec<f32> {
    vec![0.0; 32]
}

fn set_axis_angle(body: &RigidBody3DRef, x: f32, y: f32, z: f32, angle: f32) {
    let sine = (angle * 0.5).sin();
    let mut body = body.write().unwrap();
    body.orientation_x = x * sine;
    body.orientation_y = y * sine;
    body.orientation_z = z * sine;
    body.orientation_w = (angle * 0.5).cos();
    refresh_rigid_body_3d_world_inertia(&mut body);
}

fn unit_body() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    data.mass = 1.0;
    data.inertia_xx = 1.0;
    data.inertia_yy = 1.0;
    data.inertia_zz = 1.0;
    {
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &data);
        refresh_rigid_body_3d_world_inertia(&mut body);
    }
    body
}

mod apply_row {
    use super::*;

    #[test]
    fn does_nothing_for_a_zero_impulse() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

        apply_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &state,
            0,
            0.0,
        );

        assert_eq!(b.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn drives_a_row_toward_rest_when_scaled_by_the_row_mass() {
        let (a, b) = bodies();
        b.write().unwrap().velocity_x = 2.0;
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let velocity = get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        apply_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &state,
            0,
            -velocity * mass,
        );

        assert_close(
            get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            0.0,
        );
    }
}

mod begin_joint_solve {
    use super::*;

    #[test]
    fn sizes_and_reuses_the_scratch() {
        let joint = joint();
        let first = {
            let mut joint = joint.write().unwrap();
            let state = begin_joint_solve(&mut *joint, 5);
            state[0] = 9.0;
            state as *mut Vec<f32>
        };
        let mut joint = joint.write().unwrap();
        let second = begin_joint_solve(&mut *joint, 8);

        assert_eq!(second as *mut Vec<f32>, first);
        assert_eq!(second.len(), 8);
        assert_eq!(second[0], 9.0);
    }
}

mod clear_joint_solve {
    use super::*;

    #[test]
    fn leaves_a_solve_with_nothing_to_read() {
        let joint = joint();
        begin_joint_solve(&mut *joint.write().unwrap(), 4);

        clear_joint_solve(&mut *joint.write().unwrap());

        assert!(get_joint_solve_state(&*joint.read().unwrap()).is_none());
    }
}

mod get_joint_solve_state {
    use super::*;

    #[test]
    fn is_none_until_a_prepare_has_run() {
        let joint = joint();
        assert!(get_joint_solve_state(&*joint.read().unwrap()).is_none());
    }
}

mod get_row_mass {
    use super::*;

    #[test]
    fn reads_the_row_at_the_given_offset() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        write_row(
            &mut state, ROW_LENGTH, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
        );

        assert_eq!(
            get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            0.0
        );
        assert_close(
            get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, ROW_LENGTH),
            0.5,
        );
    }
}

mod get_row_velocity {
    use super::*;

    #[test]
    fn measures_b_relative_to_a_along_the_row() {
        let (a, b) = bodies();
        b.write().unwrap().velocity_y = 3.0;
        let mut state = new_state();
        write_row(&mut state, 0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);

        assert_close(
            get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            3.0,
        );
    }
}

mod point_bias {
    use super::*;

    #[test]
    fn follows_the_six_number_mass_block() {
        assert_eq!(POINT_BIAS, POINT_MASS + 6);
        assert_eq!(POINT_LENGTH, POINT_BIAS + 3);
    }
}

mod point_length {
    use super::*;

    #[test]
    fn covers_the_whole_point_block() {
        assert_eq!(POINT_LENGTH, 9);
    }
}

mod point_mass {
    use super::*;

    #[test]
    fn sits_at_the_head_of_the_per_step_state() {
        assert_eq!(POINT_MASS, 0);
    }
}

mod prepare_angular_block {
    use super::*;

    #[test]
    fn reads_the_frames_left_by_read_frame_rotations() {
        let (a, b) = bodies();
        set_axis_angle(&b, 0.0, 0.0, 1.0, 0.4);
        let joint = joint();
        let mut state = new_state();
        let mut frame_a = [0.0; 4];
        let mut frame_b = [0.0; 4];
        read_frame_rotations(
            &mut frame_a,
            &mut frame_b,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &joint.read().unwrap().frames,
        );

        prepare_angular_block(
            &mut state,
            0,
            6,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &frame_a,
            &frame_b,
            1.0 / 60.0,
        );

        assert_close(state[8], 0.4 * 0.2 * 60.0);
    }
}

mod prepare_point_block {
    use super::*;

    #[test]
    fn writes_the_lever_arms_and_inverted_mass_block() {
        let (a, b) = bodies();
        b.write().unwrap().x = 3.0;
        let joint = joint();
        joint.write().unwrap().local_anchor_ax = 1.0;
        let mut state = new_state();

        prepare_point_block(
            &a.read().unwrap(),
            &b.read().unwrap(),
            &mut *joint.write().unwrap(),
            &mut state,
            1.0 / 60.0,
        );

        assert_close(joint.read().unwrap().r_ax, 1.0);
        assert_close(state[POINT_MASS], 0.5);
        assert_close(state[POINT_BIAS], 2.0 * 0.2 * 60.0);
    }
}

mod read_frame_bases {
    use super::*;

    #[test]
    fn expands_both_frames_into_world_axes() {
        let (a, b) = bodies();
        set_axis_angle(&a, 0.0, 0.0, 1.0, std::f32::consts::FRAC_PI_2);
        let joint = joint();
        let mut out_a = [0.0; 9];
        let mut out_b = [0.0; 9];

        read_frame_bases(
            &mut out_a,
            &mut out_b,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &joint.read().unwrap().frames,
        );

        assert_close(out_a[0], 0.0);
        assert_close(out_a[1], 1.0);
        assert_close(out_b[0], 1.0);
    }
}

mod read_frame_rotations {
    use super::*;

    #[test]
    fn expands_identity_frames_into_world_rotations() {
        let (a, b) = bodies();
        let joint = joint();
        let mut out_a = [0.0; 4];
        let mut out_b = [0.0; 4];

        read_frame_rotations(
            &mut out_a,
            &mut out_b,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &joint.read().unwrap().frames,
        );

        assert_eq!(out_a, [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(out_b, [0.0, 0.0, 0.0, 1.0]);
    }
}

mod read_joint_impulse {
    use super::*;

    #[test]
    fn reads_each_of_the_six_slots() {
        let joint = joint();
        {
            let mut joint = joint.write().unwrap();
            joint.impulse0 = 10.0;
            joint.impulse1 = 11.0;
            joint.impulse2 = 12.0;
            joint.impulse3 = 13.0;
            joint.impulse4 = 14.0;
            joint.impulse5 = 15.0;
        }
        let joint = joint.read().unwrap();

        for slot in 0..6 {
            assert_eq!(read_joint_impulse(&*joint, slot), 10.0 + slot as f32);
        }
    }
}

mod row_length {
    use super::*;

    #[test]
    fn is_a_direction_plus_two_angular_arms() {
        assert_eq!(ROW_LENGTH, 9);
    }
}

mod solve_angular_block {
    use super::*;

    #[test]
    fn cancels_relative_rotation_and_accumulates_the_upper_slots() {
        let (a, b) = bodies();
        b.write().unwrap().angular_velocity_y = 2.0;
        let joint = joint();
        let mut state = new_state();
        let mut frame_a = [0.0; 4];
        let mut frame_b = [0.0; 4];
        read_frame_rotations(
            &mut frame_a,
            &mut frame_b,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &joint.read().unwrap().frames,
        );
        prepare_angular_block(
            &mut state,
            0,
            6,
            &a.read().unwrap(),
            &b.read().unwrap(),
            &frame_a,
            &frame_b,
            1.0 / 60.0,
        );

        solve_angular_block(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut *joint.write().unwrap(),
            &state,
            0,
            6,
        );

        assert_close(
            b.read().unwrap().angular_velocity_y - a.read().unwrap().angular_velocity_y,
            0.0,
        );
        assert_ne!(joint.read().unwrap().impulse4, 0.0);
    }
}

mod solve_equality_row {
    use super::*;

    #[test]
    fn drives_the_row_to_bias_velocity_and_accumulates_its_slot() {
        let (a, b) = bodies();
        b.write().unwrap().velocity_x = 2.0;
        let joint = joint();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_equality_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut *joint.write().unwrap(),
            2,
            &state,
            0,
            mass,
            0.0,
            0.0,
        );

        assert_close(
            get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            0.0,
        );
        assert_close(joint.read().unwrap().impulse2, -1.0);
    }
}

mod solve_lower_limit_row {
    use super::*;

    #[test]
    fn never_pulls_a_coordinate_down_through_its_bound() {
        let (a, b) = bodies();
        b.write().unwrap().velocity_x = 5.0;
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_lower_limit_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut state,
            0,
            mass,
            3.0,
            60.0,
            ROW_LENGTH,
            None,
        );

        assert_eq!(b.read().unwrap().velocity_x, 5.0);
    }

    #[test]
    fn pushes_a_crossed_bound_back_up() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_lower_limit_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut state,
            0,
            mass,
            -1.0,
            60.0,
            ROW_LENGTH,
            None,
        );

        assert!(get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0) > 0.0);
    }
}

mod solve_motor_row {
    use super::*;

    #[test]
    fn reaches_its_target_speed_when_the_budget_allows() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_motor_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &state,
            0,
            mass,
            4.0,
            1000.0,
            0.0,
        );

        assert_close(
            get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            4.0,
        );
    }

    #[test]
    fn returns_the_accumulated_impulse_clamped_to_its_budget() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        let total = solve_motor_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &state,
            0,
            mass,
            100.0,
            0.25,
            0.0,
        );

        assert_close(total, 0.25);
    }
}

mod solve_point_block {
    use super::*;

    #[test]
    fn cancels_the_velocity_separating_the_anchors() {
        let (a, b) = bodies();
        {
            let mut b = b.write().unwrap();
            b.velocity_x = 2.0;
            b.velocity_z = -1.0;
        }
        let joint = joint();
        let mut state = new_state();
        prepare_point_block(
            &a.read().unwrap(),
            &b.read().unwrap(),
            &mut *joint.write().unwrap(),
            &mut state,
            1.0 / 60.0,
        );

        solve_point_block(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut *joint.write().unwrap(),
            &state,
        );

        assert_close(
            b.read().unwrap().velocity_x - a.read().unwrap().velocity_x,
            0.0,
        );
        assert_close(
            b.read().unwrap().velocity_z - a.read().unwrap().velocity_z,
            0.0,
        );
    }
}

mod solve_upper_limit_row {
    use super::*;

    #[test]
    fn never_pushes_a_coordinate_up_through_its_bound() {
        let (a, b) = bodies();
        b.write().unwrap().velocity_x = -5.0;
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_upper_limit_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut state,
            0,
            mass,
            3.0,
            60.0,
            ROW_LENGTH,
            None,
        );

        assert_eq!(b.read().unwrap().velocity_x, -5.0);
    }

    #[test]
    fn pushes_a_crossed_bound_back_down() {
        let (a, b) = bodies();
        let mut state = new_state();
        write_row(&mut state, 0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mass = get_row_mass(&a.read().unwrap(), &b.read().unwrap(), &state, 0);

        solve_upper_limit_row(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &mut state,
            0,
            mass,
            -1.0,
            60.0,
            ROW_LENGTH,
            None,
        );

        assert!(get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0) < 0.0);
    }
}

mod warm_start_angular_block {
    use super::*;

    #[test]
    fn reapplies_the_angular_accumulators() {
        let (a, b) = bodies();
        let joint = joint();
        joint.write().unwrap().impulse4 = 2.0;

        warm_start_angular_block(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_close(b.read().unwrap().angular_velocity_y, 2.0);
        assert_close(a.read().unwrap().angular_velocity_y, -2.0);
    }
}

mod warm_start_point_block {
    use super::*;

    #[test]
    fn reapplies_the_point_accumulators() {
        let (a, b) = bodies();
        let joint = joint();
        joint.write().unwrap().impulse0 = 3.0;

        warm_start_point_block(
            &mut a.write().unwrap(),
            &mut b.write().unwrap(),
            &*joint.read().unwrap(),
        );

        assert_close(b.read().unwrap().velocity_x, 3.0);
        assert_close(a.read().unwrap().velocity_x, -3.0);
    }
}

mod write_angular_row {
    use super::*;

    #[test]
    fn measures_relative_spin_about_its_axis() {
        let (a, b) = bodies();
        b.write().unwrap().angular_velocity_z = 1.5;
        let mut state = new_state();

        write_angular_row(&mut state, 0, 0.0, 0.0, 1.0);

        assert_close(
            get_row_velocity(&a.read().unwrap(), &b.read().unwrap(), &state, 0),
            1.5,
        );
    }

    #[test]
    fn writes_no_linear_direction_and_the_axis_as_both_arms() {
        let mut state = new_state();

        write_angular_row(&mut state, 0, 0.0, 1.0, 0.0);

        assert_eq!(&state[0..9], &[0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0]);
    }
}

mod write_joint_impulse {
    use super::*;

    #[test]
    fn writes_each_of_the_six_slots() {
        let joint = joint();
        {
            let mut joint = joint.write().unwrap();
            for slot in 0..6 {
                write_joint_impulse(&mut *joint, slot, slot as f32 + 1.0);
            }
        }
        let joint = joint.read().unwrap();

        assert_eq!(
            [
                joint.impulse0,
                joint.impulse1,
                joint.impulse2,
                joint.impulse3,
                joint.impulse4,
                joint.impulse5,
            ],
            [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        );
    }
}

mod write_physics_3d_soft_row_parameters {
    use super::*;

    #[test]
    fn produces_a_bias_factor_independent_of_mass() {
        let mut light = [0.0; 3];
        let mut heavy = [0.0; 3];
        write_physics_3d_soft_row_parameters(&mut light, 0.25, 4.0, 0.7, 1.0 / 60.0, 60.0);
        write_physics_3d_soft_row_parameters(&mut heavy, 400.0, 4.0, 0.7, 1.0 / 60.0, 60.0);

        assert_close(heavy[1], light[1]);
        assert!(heavy[2] < light[2]);
    }

    #[test]
    fn returns_hard_parameters_for_a_non_positive_frequency() {
        let mut out = [0.0; 3];
        write_physics_3d_soft_row_parameters(&mut out, 4.0, 0.0, 0.7, 1.0 / 60.0, 60.0);
        assert_eq!(out, [4.0, 60.0, 0.0]);
        write_physics_3d_soft_row_parameters(&mut out, 4.0, -1.0, 0.7, 1.0 / 60.0, 60.0);
        assert_eq!(out, [4.0, 60.0, 0.0]);
    }

    #[test]
    fn softens_mass_on_the_reciprocal_side() {
        let mut out = [0.0; 3];
        let mass = 5.0;
        write_physics_3d_soft_row_parameters(&mut out, mass, 4.0, 0.7, 1.0 / 60.0, 60.0);

        assert!(out[0] > 0.0);
        assert!(out[0] < mass);
        assert_close(out[0], 1.0 / (1.0 / mass + out[2]));
    }

    #[test]
    fn stays_finite_for_zero_mass() {
        let mut out = [0.0; 3];
        write_physics_3d_soft_row_parameters(&mut out, 0.0, 4.0, 0.7, 1.0 / 60.0, 60.0);

        assert!(out.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn stiffens_toward_the_rigid_mass_as_frequency_rises() {
        let mut slack = [0.0; 3];
        let mut stiff = [0.0; 3];
        write_physics_3d_soft_row_parameters(&mut slack, 2.0, 1.0, 0.7, 1.0 / 60.0, 60.0);
        write_physics_3d_soft_row_parameters(&mut stiff, 2.0, 200.0, 0.7, 1.0 / 60.0, 60.0);

        assert!(stiff[0] > slack[0]);
        assert!(stiff[0] <= 2.0);
    }

    #[test]
    fn uses_the_callers_hard_bias_factor() {
        let mut out = [0.0; 3];
        write_physics_3d_soft_row_parameters(&mut out, 1.0, 0.0, 0.0, 1.0 / 60.0, 12.0);
        assert_eq!(out[1], 12.0);
        write_physics_3d_soft_row_parameters(&mut out, 1.0, 0.0, 0.0, 1.0 / 60.0, 60.0);
        assert_eq!(out[1], 60.0);
    }
}

mod write_row {
    use super::*;

    #[test]
    fn lays_the_direction_and_two_arms_out_in_one_block() {
        let mut state = new_state();

        write_row(
            &mut state, ROW_LENGTH, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0,
        );

        assert_eq!(
            &state[ROW_LENGTH..ROW_LENGTH * 2],
            &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0]
        );
    }
}
