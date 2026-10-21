use super::*;
use crate::common::rigid_body;

fn assert_close(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {actual} to be within {tolerance} of {expected}"
    );
}

fn dynamic_sphere() -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    let mut data = create_physics_3d_mass_data();
    compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
    {
        let mut body_write = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body_write, &data);
        refresh_rigid_body_3d_world_inertia(&mut body_write);
    }
    body
}

fn world_center(body: &RigidBody3D) -> [f32; 3] {
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    let (cx, cy, cz) = (body.center_x, body.center_y, body.center_z);
    let tx = 2.0 * (qy * cz - qz * cy);
    let ty = 2.0 * (qz * cx - qx * cz);
    let tz = 2.0 * (qx * cy - qy * cx);
    [
        body.x + cx + qw * tx + qy * tz - qz * ty,
        body.y + cy + qw * ty + qz * tx - qx * tz,
        body.z + cz + qw * tz + qx * ty - qy * tx,
    ]
}

mod clear_rigid_body_3d_forces {
    use super::*;

    #[test]
    fn zeroes_both_accumulators() {
        let body = create_rigid_body_3d();
        let mut body = body.write().unwrap();
        body.force_x = 1.0;
        body.force_y = -3.0;
        body.force_z = 5.0;
        body.torque_x = -7.0;
        body.torque_y = 11.0;
        body.torque_z = 2.0;

        clear_rigid_body_3d_forces(&mut body);

        assert_eq!((body.force_x, body.force_y, body.force_z), (0.0, 0.0, 0.0));
        assert_eq!(
            (body.torque_x, body.torque_y, body.torque_z),
            (0.0, 0.0, 0.0)
        );
    }
}

mod integrate_rigid_body_3d_pose {
    use super::*;

    #[test]
    fn advances_position_by_the_current_velocity() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.velocity_x = 3.0;

        integrate_rigid_body_3d_pose(&mut body, 0.5);

        assert_close(body.x, 1.5, 1.0e-6);
    }

    #[test]
    fn holds_the_previous_orientation_for_a_diverged_angular_velocity() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.angular_velocity_x = f32::INFINITY;

        integrate_rigid_body_3d_pose(&mut body, 1.0 / 60.0);

        assert!(!body.orientation_w.is_nan());
        assert_eq!(body.orientation_w, 1.0);
    }

    #[test]
    fn keeps_an_offset_center_of_mass_stationary_during_pure_rotation() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.center_x = 2.0;
        body.center_y = -1.0;
        body.center_z = 0.5;
        body.angular_velocity_x = 1.0;
        body.angular_velocity_y = -2.0;
        body.angular_velocity_z = 3.0;
        let before = world_center(&body);

        integrate_rigid_body_3d_pose(&mut body, 0.25);

        let after = world_center(&body);
        assert_close(after[0], before[0], 1.0e-6);
        assert_close(after[1], before[1], 1.0e-6);
        assert_close(after[2], before[2], 1.0e-6);
    }

    #[test]
    fn keeps_the_quaternion_normalized_across_many_steps() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.angular_velocity_x = 5.0;
        body.angular_velocity_y = -3.0;
        body.angular_velocity_z = 2.0;

        for _ in 0..2000 {
            integrate_rigid_body_3d_pose(&mut body, 1.0 / 60.0);
        }

        let length = (body.orientation_x * body.orientation_x
            + body.orientation_y * body.orientation_y
            + body.orientation_z * body.orientation_z
            + body.orientation_w * body.orientation_w)
            .sqrt();
        assert_close(length, 1.0, 1.0e-6);
    }

    #[test]
    fn leaves_a_sleeping_body_alone() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.sleeping = true;
        body.velocity_x = 3.0;

        integrate_rigid_body_3d_pose(&mut body, 0.5);

        assert_eq!(body.x, 0.0);
    }

    #[test]
    fn leaves_a_static_body_alone() {
        let body = rigid_body(Physics3DBodyType::Static);
        let mut body = body.write().unwrap();
        body.velocity_x = 3.0;

        integrate_rigid_body_3d_pose(&mut body, 0.5);

        assert_eq!(body.x, 0.0);
    }

    #[test]
    fn leaves_the_orientation_untouched_at_zero_angular_velocity() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.velocity_y = 1.0;

        integrate_rigid_body_3d_pose(&mut body, 0.5);

        assert_eq!(body.orientation_w, 1.0);
        assert_eq!(body.orientation_x, 0.0);
    }

    #[test]
    fn rotates_about_the_angular_velocity_axis_by_magnitude_times_dt() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.angular_velocity_z = std::f32::consts::PI;

        for _ in 0..200 {
            integrate_rigid_body_3d_pose(&mut body, 0.005);
        }

        assert_close(
            body.orientation_z,
            (std::f32::consts::PI / 2.0).sin(),
            1.0e-3,
        );
        assert_close(
            body.orientation_w,
            (std::f32::consts::PI / 2.0).cos(),
            1.0e-3,
        );
    }
}

mod integrate_rigid_body_3d_velocity {
    use super::*;

    #[test]
    fn accelerates_under_gravity() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();

        integrate_rigid_body_3d_velocity(&mut body, 0.0, -10.0, 0.0, 0.5);

        assert_close(body.velocity_y, -5.0, 1.0e-6);
    }

    #[test]
    fn applies_torque_about_the_given_axis_for_an_isotropic_body() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        refresh_rigid_body_3d_world_inertia(&mut body);
        body.torque_z = body.inertia_zz * 4.0;

        integrate_rigid_body_3d_velocity(&mut body, 0.0, 0.0, 0.0, 0.5);

        assert_close(body.angular_velocity_z, 2.0, 1.0e-6);
        assert_close(body.angular_velocity_x, 0.0, 1.0e-6);
    }

    #[test]
    fn converts_force_to_velocity_through_inverse_mass() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.force_x = body.mass * 4.0;

        integrate_rigid_body_3d_velocity(&mut body, 0.0, 0.0, 0.0, 0.5);

        assert_close(body.velocity_x, 2.0, 1.0e-6);
    }

    #[test]
    fn damps_linear_velocity_without_crossing_zero_at_a_large_step() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.velocity_x = 10.0;
        body.linear_damping = 50.0;

        integrate_rigid_body_3d_velocity(&mut body, 0.0, 0.0, 0.0, 10.0);

        assert!(body.velocity_x > 0.0);
        assert!(body.velocity_x < 10.0);
    }

    #[test]
    fn leaves_a_kinematic_body_alone() {
        let body = rigid_body(Physics3DBodyType::Kinematic);
        let mut body = body.write().unwrap();
        body.velocity_y = 7.0;

        integrate_rigid_body_3d_velocity(&mut body, 0.0, -10.0, 0.0, 0.5);

        assert_eq!(body.velocity_y, 7.0);
    }

    #[test]
    fn leaves_a_sphere_spinning_about_a_fixed_axis() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.angular_velocity_x = 2.0;
        body.angular_velocity_y = 3.0;

        for _ in 0..100 {
            refresh_rigid_body_3d_world_inertia(&mut body);
            integrate_rigid_body_3d_velocity(&mut body, 0.0, 0.0, 0.0, 1.0 / 60.0);
            integrate_rigid_body_3d_pose(&mut body, 1.0 / 60.0);
        }

        assert_close(body.angular_velocity_x, 2.0, 1.0e-5);
        assert_close(body.angular_velocity_y, 3.0, 1.0e-5);
        assert_close(body.angular_velocity_z, 0.0, 1.0e-5);
    }

    #[test]
    fn scales_gravity_per_body() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();
        body.gravity_scale = 0.0;

        integrate_rigid_body_3d_velocity(&mut body, 0.0, -10.0, 0.0, 0.5);

        assert_eq!(body.velocity_y, 0.0);
    }

    #[test]
    fn tumbles_an_asymmetric_body_spun_off_axis() {
        let body = create_rigid_body_3d();
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(4.0, 1.0, 0.5, 1.0, &mut data);
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &data);
        refresh_rigid_body_3d_world_inertia(&mut body);
        body.angular_velocity_x = 5.0;
        body.angular_velocity_y = 0.2;

        for _ in 0..200 {
            refresh_rigid_body_3d_world_inertia(&mut body);
            integrate_rigid_body_3d_velocity(&mut body, 0.0, 0.0, 0.0, 1.0 / 240.0);
            integrate_rigid_body_3d_pose(&mut body, 1.0 / 240.0);
        }

        assert!(body.angular_velocity_z.abs() > 1.0e-4);
    }
}

mod refresh_rigid_body_3d_world_inertia {
    use super::*;

    #[test]
    fn leaves_an_immovable_body_world_tensor_at_zero() {
        let body = rigid_body(Physics3DBodyType::Static);
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &data);
        body.orientation_z = std::f32::consts::FRAC_1_SQRT_2;
        body.orientation_w = std::f32::consts::FRAC_1_SQRT_2;

        refresh_rigid_body_3d_world_inertia(&mut body);

        assert_eq!(body.inverse_inertia_world_xx, 0.0);
        assert_eq!(body.inverse_inertia_world_yy, 0.0);
    }

    #[test]
    fn matches_the_local_tensor_at_identity_orientation() {
        let body = dynamic_sphere();
        let mut body = body.write().unwrap();

        refresh_rigid_body_3d_world_inertia(&mut body);

        assert_close(
            body.inverse_inertia_world_xx,
            body.inverse_inertia_xx,
            1.0e-6,
        );
    }

    #[test]
    fn swaps_x_and_y_world_moments_after_a_quarter_turn_about_z() {
        let body = create_rigid_body_3d();
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(4.0, 1.0, 1.0, 1.0, &mut data);
        let mut body = body.write().unwrap();
        set_rigid_body_3d_mass_data(&mut body, &data);
        body.orientation_z = std::f32::consts::FRAC_1_SQRT_2;
        body.orientation_w = std::f32::consts::FRAC_1_SQRT_2;

        refresh_rigid_body_3d_world_inertia(&mut body);

        assert_close(
            body.inverse_inertia_world_xx,
            body.inverse_inertia_yy,
            1.0e-6,
        );
        assert_close(
            body.inverse_inertia_world_yy,
            body.inverse_inertia_xx,
            1.0e-6,
        );
    }
}
