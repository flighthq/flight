use flight_collision::{
    CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionColliderShape3D,
    CollisionConvex3D, CollisionShape3D, CollisionSphere3D,
};

use super::*;
use crate::common::*;

fn assert_close(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "expected {actual} to be within {tolerance} of {expected}"
    );
}

fn box_points(half_x: f32, half_y: f32, half_z: f32, offset_x: f32) -> Vec<f32> {
    let mut points = Vec::new();
    for x in [-half_x, half_x] {
        for y in [-half_y, half_y] {
            for z in [-half_z, half_z] {
                points.extend_from_slice(&[x + offset_x, y, z]);
            }
        }
    }
    points
}

fn collider_of(shape: CollisionShape3D, density: f32) -> Physics3DColliderRef {
    let material = Physics3DMaterial {
        density,
        friction: 0.2,
        restitution: 0.0,
    };
    physics_3d_collider(
        &CollisionColliderShape3D::BuiltIn(shape),
        Some(&material),
        None,
        None,
    )
}

fn test_body(body_type: Physics3DBodyType) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    body.write().unwrap().index = 0;
    body
}

mod combine_physics_3d_mass_data {
    use super::*;

    #[test]
    fn starts_from_the_zero_identity_adopting_the_addend_outright() {
        let mut target = create_physics_3d_mass_data();
        let mut sphere = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut sphere);

        combine_physics_3d_mass_data(&mut target, &sphere);

        assert_close(target.mass, sphere.mass, 1.0e-6);
        assert_close(target.inertia_xx, sphere.inertia_xx, 1.0e-6);
    }

    #[test]
    fn puts_the_combined_center_between_two_equal_masses() {
        let mut target = create_physics_3d_mass_data();
        let mut left = create_physics_3d_mass_data();
        let mut right = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut left);
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut right);
        left.center_x = -2.0;
        right.center_x = 2.0;

        combine_physics_3d_mass_data(&mut target, &left);
        combine_physics_3d_mass_data(&mut target, &right);

        assert_close(target.center_x, 0.0, 1.0e-6);
        assert_close(target.mass, left.mass + right.mass, 1.0e-6);
    }

    #[test]
    fn shifts_the_already_accumulated_tensor_too_not_only_the_addend() {
        let mut target = create_physics_3d_mass_data();
        let mut left = create_physics_3d_mass_data();
        let mut right = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut left);
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut right);
        left.center_x = -2.0;
        right.center_x = 2.0;

        combine_physics_3d_mass_data(&mut target, &left);
        combine_physics_3d_mass_data(&mut target, &right);

        let each = left.mass;
        let expected_yy = 2.0 * (0.4 * each + each * 4.0);
        assert_close(target.inertia_yy, expected_yy, 1.0e-5);
        assert_close(target.inertia_xx, 2.0 * 0.4 * each, 1.0e-5);
    }

    #[test]
    fn is_order_independent_for_the_combined_mass_and_center() {
        let mut forward = create_physics_3d_mass_data();
        let mut backward = create_physics_3d_mass_data();
        let mut a = create_physics_3d_mass_data();
        let mut b = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut a);
        compute_physics_3d_box_mass_data(1.0, 2.0, 3.0, 2.0, &mut b);
        a.center_y = 1.0;
        b.center_y = -3.0;

        combine_physics_3d_mass_data(&mut forward, &a);
        combine_physics_3d_mass_data(&mut forward, &b);
        combine_physics_3d_mass_data(&mut backward, &b);
        combine_physics_3d_mass_data(&mut backward, &a);

        assert_close(backward.mass, forward.mass, 1.0e-5);
        assert_close(backward.center_y, forward.center_y, 1.0e-5);
        assert_close(backward.inertia_xx, forward.inertia_xx, 1.0e-4);
    }

    #[test]
    fn zeroes_the_result_when_both_sides_are_massless_rather_than_dividing_by_zero() {
        let mut target = create_physics_3d_mass_data();
        combine_physics_3d_mass_data(&mut target, &create_physics_3d_mass_data());
        assert_eq!(target.mass, 0.0);
        assert!(!target.center_x.is_nan());
    }
}

mod compute_physics_3d_box_mass_data {
    use super::*;

    #[test]
    fn derives_mass_from_volume_and_density() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(1.0, 2.0, 3.0, 5.0, &mut out);
        assert_close(out.mass, 8.0 * 1.0 * 2.0 * 3.0 * 5.0, 1.0e-5);
    }

    #[test]
    fn gives_a_cube_one_moment_on_every_axis() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(2.0, 2.0, 2.0, 1.0, &mut out);
        assert_close(out.inertia_yy, out.inertia_xx, 1.0e-5);
        assert_close(out.inertia_zz, out.inertia_xx, 1.0e-5);
    }

    #[test]
    fn resists_rotation_least_about_its_longest_axis() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(4.0, 1.0, 1.0, 1.0, &mut out);
        assert!(out.inertia_xx < out.inertia_yy);
        assert_close(out.inertia_yy, out.inertia_zz, 1.0e-5);
    }

    #[test]
    fn leaves_the_off_diagonal_terms_zero_for_an_axis_aligned_box() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_box_mass_data(1.0, 2.0, 3.0, 1.0, &mut out);
        assert_eq!(out.inertia_xy, 0.0);
        assert_eq!(out.inertia_xz, 0.0);
        assert_eq!(out.inertia_yz, 0.0);
    }
}

mod compute_physics_3d_capsule_mass_data {
    use super::*;

    #[test]
    fn degenerates_exactly_to_a_sphere_at_zero_half_height() {
        let mut capsule = create_physics_3d_mass_data();
        let mut sphere = create_physics_3d_mass_data();
        compute_physics_3d_capsule_mass_data(2.0, 0.0, 3.0, &mut capsule);
        compute_physics_3d_sphere_mass_data(2.0, 3.0, &mut sphere);

        assert_close(capsule.mass, sphere.mass, 1.0e-5);
        assert_close(capsule.inertia_xx, sphere.inertia_xx, 1.0e-4);
        assert_close(capsule.inertia_yy, sphere.inertia_yy, 1.0e-4);
        assert_close(capsule.inertia_zz, sphere.inertia_zz, 1.0e-4);
    }

    #[test]
    fn derives_mass_as_cylinder_plus_two_hemispheres() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_capsule_mass_data(1.0, 2.0, 1.0, &mut out);
        let expected = std::f32::consts::PI * 4.0 + (4.0 / 3.0) * std::f32::consts::PI;
        assert_close(out.mass, expected, 1.0e-5);
    }

    #[test]
    fn resists_rotation_least_about_its_own_axis() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_capsule_mass_data(1.0, 4.0, 1.0, &mut out);
        assert!(out.inertia_yy < out.inertia_xx);
    }

    #[test]
    fn is_symmetric_across_the_two_axes_orthogonal_to_its_own() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_capsule_mass_data(1.5, 3.0, 2.0, &mut out);
        assert_close(out.inertia_zz, out.inertia_xx, 1.0e-5);
    }
}

mod compute_physics_3d_collider_mass_data {
    use super::*;

    #[test]
    fn places_the_centroid_at_an_offset_collider_rather_than_at_the_body_origin() {
        let collider = collider_of(
            CollisionShape3D::Sphere(CollisionSphere3D {
                x: 3.0,
                y: -2.0,
                z: 1.0,
                radius: 1.0,
            }),
            1.0,
        );
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider.read().unwrap(), &mut out);
        assert_eq!((out.center_x, out.center_y, out.center_z), (3.0, -2.0, 1.0));
    }

    #[test]
    fn gives_an_aabb_the_same_tensor_as_the_equivalent_box() {
        let collider = collider_of(
            CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -1.0,
                min_y: -2.0,
                min_z: -3.0,
                max_x: 1.0,
                max_y: 2.0,
                max_z: 3.0,
            }),
            1.0,
        );
        let mut collider_data = create_physics_3d_mass_data();
        let mut box_data = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider.read().unwrap(), &mut collider_data);
        compute_physics_3d_box_mass_data(1.0, 2.0, 3.0, 1.0, &mut box_data);
        assert_close(collider_data.mass, box_data.mass, 1.0e-5);
        assert_close(collider_data.inertia_xx, box_data.inertia_xx, 1.0e-4);
    }

    #[test]
    fn makes_a_locally_rotated_box_non_diagonal_in_the_body_frame() {
        let collider = collider_of(
            CollisionShape3D::Box(CollisionBox3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                half_x: 3.0,
                half_y: 1.0,
                half_z: 1.0,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: (std::f32::consts::PI / 8.0).sin(),
                rotation_w: (std::f32::consts::PI / 8.0).cos(),
            }),
            1.0,
        );
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider.read().unwrap(), &mut out);
        assert!(out.inertia_xy.abs() > 0.0);
    }

    #[test]
    fn realigns_a_capsule_that_is_not_on_the_y_axis() {
        let collider = collider_of(
            CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: -2.0,
                y0: 0.0,
                z0: 0.0,
                x1: 2.0,
                y1: 0.0,
                z1: 0.0,
                radius: 0.5,
            }),
            1.0,
        );
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider.read().unwrap(), &mut out);
        assert!(out.inertia_xx < out.inertia_yy);
        assert_close(out.inertia_yy, out.inertia_zz, 1.0e-5);
    }

    #[test]
    fn integrates_a_convex_hull_rather_than_zeroing_it() {
        let collider = collider_of(
            CollisionShape3D::Convex(CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            }),
            1.0,
        );
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_collider_mass_data(&collider.read().unwrap(), &mut out);
        assert_close(out.mass, 1.0 / 6.0, 1.0e-6);
    }
}

mod compute_physics_3d_cone_mass_data {
    use super::*;

    #[test]
    fn has_exactly_one_third_the_mass_of_the_cylinder_that_circumscribes_it() {
        let mut cone = create_physics_3d_mass_data();
        let mut cylinder = create_physics_3d_mass_data();
        compute_physics_3d_cone_mass_data(1.7, 4.0, 2.5, &mut cone);
        compute_physics_3d_cylinder_mass_data(1.7, 2.0, 2.5, &mut cylinder);
        assert_close(cone.mass, cylinder.mass / 3.0, 1.0e-5);
    }

    #[test]
    fn matches_a_numerically_integrated_cone_about_its_own_centroid() {
        let radius = 1.2;
        let height = 3.0;
        let density = 2.0;
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_cone_mass_data(radius, height, density, &mut out);

        let apex_y = 0.75 * height;
        let base_y = -0.25 * height;
        let steps = 90;
        let step = (2.0 * radius) / steps as f32;
        let step_y = height / steps as f32;
        let mut mass = 0.0;
        let mut axial = 0.0;
        let mut transverse = 0.0;
        for iy in 0..steps {
            let y = base_y + (iy as f32 + 0.5) * step_y;
            let permitted = radius * ((apex_y - y) / height);
            for ix in 0..steps {
                let x = -radius + (ix as f32 + 0.5) * step;
                for iz in 0..steps {
                    let z = -radius + (iz as f32 + 0.5) * step;
                    if x * x + z * z > permitted * permitted {
                        continue;
                    }
                    let cell = step * step * step_y * density;
                    mass += cell;
                    axial += cell * (x * x + z * z);
                    transverse += cell * (x * x + y * y);
                }
            }
        }

        assert_close(out.mass, mass, 0.05);
        assert!((out.inertia_yy - axial).abs() / axial < 0.02);
        assert!((out.inertia_xx - transverse).abs() / transverse < 0.02);
    }

    #[test]
    fn is_symmetric_across_the_two_axes_orthogonal_to_its_own() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_cone_mass_data(1.5, 3.0, 2.0, &mut out);
        assert_close(out.inertia_zz, out.inertia_xx, 1.0e-5);
    }
}

mod compute_physics_3d_convex_hull_mass_data {
    use super::*;

    #[test]
    fn reproduces_the_closed_form_box_tensor_exactly_for_a_box_shaped_hull() {
        let mut hull = create_physics_3d_mass_data();
        let mut box_data = create_physics_3d_mass_data();
        compute_physics_3d_convex_hull_mass_data(&box_points(1.5, 0.75, 2.25, 0.0), 3.0, &mut hull);
        compute_physics_3d_box_mass_data(1.5, 0.75, 2.25, 3.0, &mut box_data);

        assert_close(hull.mass, box_data.mass, 1.0e-4);
        assert_close(hull.inertia_xx, box_data.inertia_xx, 1.0e-4);
        assert_close(hull.inertia_yy, box_data.inertia_yy, 1.0e-4);
        assert_close(hull.inertia_zz, box_data.inertia_zz, 1.0e-4);
        assert_close(hull.inertia_xy, 0.0, 1.0e-5);
        assert_close(hull.inertia_xz, 0.0, 1.0e-5);
        assert_close(hull.inertia_yz, 0.0, 1.0e-5);
    }

    #[test]
    fn reports_the_tensor_about_the_center_of_mass_for_an_offset_hull() {
        let mut hull = create_physics_3d_mass_data();
        let mut reference = create_physics_3d_mass_data();
        compute_physics_3d_convex_hull_mass_data(&box_points(1.0, 1.0, 1.0, 5.0), 1.0, &mut hull);
        compute_physics_3d_box_mass_data(1.0, 1.0, 1.0, 1.0, &mut reference);

        assert_close(hull.center_x, 5.0, 1.0e-5);
        assert_close(hull.center_y, 0.0, 1.0e-5);
        assert_close(hull.inertia_xx, reference.inertia_xx, 1.0e-4);
        assert_close(hull.inertia_yy, reference.inertia_yy, 1.0e-4);
        assert_close(hull.inertia_zz, reference.inertia_zz, 1.0e-4);
    }

    #[test]
    fn approaches_the_closed_form_sphere_from_below_as_the_sample_gets_denser() {
        let mut hull = create_physics_3d_mass_data();
        let mut sphere = create_physics_3d_mass_data();
        let mut points = Vec::new();
        for i in 0..400 {
            let z = 1.0 - (2.0 * i as f32) / 399.0;
            let radius = (1.0 - z * z).max(0.0).sqrt();
            let theta = i as f32 * 2.399963;
            points.extend_from_slice(&[radius * theta.cos(), radius * theta.sin(), z]);
        }
        compute_physics_3d_convex_hull_mass_data(&points, 1.0, &mut hull);
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut sphere);

        assert!(hull.mass < sphere.mass);
        assert!(hull.mass > sphere.mass * 0.98);
        assert!(hull.inertia_xx < sphere.inertia_xx);
        assert!(hull.inertia_xx > sphere.inertia_xx * 0.96);
    }

    #[test]
    fn scales_linearly_with_density() {
        let mut single = create_physics_3d_mass_data();
        let mut triple = create_physics_3d_mass_data();
        let points = box_points(1.0, 1.0, 1.0, 0.0);
        compute_physics_3d_convex_hull_mass_data(&points, 1.0, &mut single);
        compute_physics_3d_convex_hull_mass_data(&points, 3.0, &mut triple);

        assert_close(triple.mass, single.mass * 3.0, 1.0e-5);
        assert_close(triple.inertia_xx, single.inertia_xx * 3.0, 1.0e-5);
    }

    #[test]
    fn gives_a_degenerate_hull_no_mass_rather_than_a_plausible_wrong_one() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_convex_hull_mass_data(
            &vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0],
            1.0,
            &mut out,
        );
        assert_eq!(out.mass, 0.0);
        compute_physics_3d_convex_hull_mass_data(&Vec::new(), 1.0, &mut out);
        assert_eq!(out.mass, 0.0);
    }
}

mod compute_physics_3d_cylinder_mass_data {
    use super::*;

    #[test]
    fn is_the_capsule_less_its_two_hemispheres() {
        let mut cylinder = create_physics_3d_mass_data();
        let mut capsule = create_physics_3d_mass_data();
        compute_physics_3d_cylinder_mass_data(2.0, 3.0, 1.5, &mut cylinder);
        compute_physics_3d_capsule_mass_data(2.0, 3.0, 1.5, &mut capsule);
        let hemispheres = (4.0 / 3.0) * std::f32::consts::PI * 8.0 * 1.5;
        assert_close(cylinder.mass, capsule.mass - hemispheres, 1.0e-5);
    }

    #[test]
    fn resists_rotation_least_about_its_own_axis() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_cylinder_mass_data(1.0, 4.0, 1.0, &mut out);
        assert!(out.inertia_yy < out.inertia_xx);
    }

    #[test]
    fn matches_the_closed_form_for_a_solid_cylinder() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_cylinder_mass_data(2.0, 1.5, 1.0, &mut out);
        let mass = std::f32::consts::PI * 4.0 * 3.0;
        assert_close(out.mass, mass, 1.0e-5);
        assert_close(out.inertia_yy, 0.5 * mass * 4.0, 1.0e-5);
        assert_close(out.inertia_xx, mass * (9.0 / 12.0 + 1.0), 1.0e-5);
    }
}

mod compute_physics_3d_sphere_mass_data {
    use super::*;

    #[test]
    fn derives_mass_from_volume_and_density() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(2.0, 3.0, &mut out);
        assert_close(
            out.mass,
            (4.0 / 3.0) * std::f32::consts::PI * 8.0 * 3.0,
            1.0e-5,
        );
    }

    #[test]
    fn uses_the_two_fifths_moment_on_every_axis() {
        let mut out = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(2.0, 3.0, &mut out);
        assert_close(out.inertia_xx, 0.4 * out.mass * 4.0, 1.0e-5);
        assert_close(out.inertia_yy, out.inertia_xx, 1.0e-5);
        assert_close(out.inertia_zz, out.inertia_xx, 1.0e-5);
    }
}

mod create_physics_3d_mass_data {
    use super::*;

    #[test]
    fn is_the_additive_identity_all_zero() {
        let out = create_physics_3d_mass_data();
        assert_eq!(out.mass, 0.0);
        assert_eq!(out.inertia_xx, 0.0);
        assert_eq!(out.center_z, 0.0);
    }
}

mod initialize_physics_3d_mass_data {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_mass_data() {
        let mut out = create_physics_3d_mass_data();
        out.mass = 4.0;
        initialize_physics_3d_mass_data(&mut out);
        assert_eq!(out.mass, 0.0);
    }
}

mod set_rigid_body_3d_mass_data {
    use super::*;

    #[test]
    fn derives_the_inverse_mass_and_a_non_zero_inverse_tensor_for_a_dynamic_body() {
        let body = test_body(Physics3DBodyType::Dynamic);
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);

        let body = body.read().unwrap();
        assert_close(body.mass, data.mass, 1.0e-6);
        assert_close(body.inverse_mass, 1.0 / data.mass, 1.0e-6);
        assert_close(body.inverse_inertia_xx, 1.0 / data.inertia_xx, 1.0e-5);
    }

    #[test]
    fn gives_a_static_body_zero_inverse_mass_and_inertia_while_keeping_forward_values() {
        let body = test_body(Physics3DBodyType::Static);
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);

        let body = body.read().unwrap();
        assert_close(body.mass, data.mass, 1.0e-6);
        assert_eq!(body.inverse_mass, 0.0);
        assert_eq!(body.inverse_inertia_xx, 0.0);
    }

    #[test]
    fn gives_a_kinematic_body_the_same_zero_inverses_as_a_static_one() {
        let body = test_body(Physics3DBodyType::Kinematic);
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);

        let body = body.read().unwrap();
        assert_eq!(body.inverse_mass, 0.0);
        assert_eq!(body.inverse_inertia_zz, 0.0);
    }

    #[test]
    fn zeroes_only_inverse_inertia_for_fixed_rotation_while_keeping_inverse_mass() {
        let body = test_body(Physics3DBodyType::Dynamic);
        body.write().unwrap().fixed_rotation = true;
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);

        let body = body.read().unwrap();
        assert!(body.inverse_mass > 0.0);
        assert_eq!(body.inverse_inertia_xx, 0.0);
        assert_eq!(body.inverse_inertia_yy, 0.0);
    }

    #[test]
    fn treats_a_zero_mass_dynamic_body_as_immovable_rather_than_dividing_by_zero() {
        let body = test_body(Physics3DBodyType::Dynamic);
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &create_physics_3d_mass_data());

        let body = body.read().unwrap();
        assert_eq!(body.inverse_mass, 0.0);
        assert_eq!(body.inverse_inertia_xx, 0.0);
    }

    #[test]
    fn copies_the_center_of_mass_onto_the_body() {
        let body = test_body(Physics3DBodyType::Dynamic);
        let mut data = create_physics_3d_mass_data();
        compute_physics_3d_sphere_mass_data(1.0, 1.0, &mut data);
        data.center_y = 4.0;
        set_rigid_body_3d_mass_data(&mut body.write().unwrap(), &data);

        assert_eq!(body.read().unwrap().center_y, 4.0);
    }
}

mod update_rigid_body_3d_mass_data {
    use super::*;

    #[test]
    fn derives_a_body_mass_from_its_colliders() {
        let mut world = world();
        let body = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &body);
        let collider = collider_of(
            CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -0.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 0.5,
                max_y: 0.5,
                max_z: 0.5,
            }),
            1.0,
        );
        body.write().unwrap().colliders.push(collider);
        update_rigid_body_3d_mass_data(&mut body.write().unwrap());

        let body = body.read().unwrap();
        assert_close(body.mass, 1.0, 1.0e-6);
        assert_close(body.inverse_mass, 1.0, 1.0e-6);
    }

    #[test]
    fn balances_a_body_between_two_colliders() {
        let mut world = world();
        let body = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &body);
        for offset in [-2.0, 2.0] {
            let collider = collider_of(
                CollisionShape3D::Aabb(CollisionAabb3D {
                    min_x: offset - 0.5,
                    min_y: -0.5,
                    min_z: -0.5,
                    max_x: offset + 0.5,
                    max_y: 0.5,
                    max_z: 0.5,
                }),
                1.0,
            );
            body.write().unwrap().colliders.push(collider);
        }
        update_rigid_body_3d_mass_data(&mut body.write().unwrap());

        let body = body.read().unwrap();
        assert_close(body.mass, 2.0, 1.0e-6);
        assert_close(body.center_x, 0.0, 1.0e-6);
        assert!(body.inertia_yy > body.inertia_xx);
    }

    #[test]
    fn leaves_a_body_with_no_colliders_massless() {
        let body = create_rigid_body_3d();
        update_rigid_body_3d_mass_data(&mut body.write().unwrap());

        let body = body.read().unwrap();
        assert_eq!(body.mass, 0.0);
        assert_eq!(body.inverse_mass, 0.0);
    }

    #[test]
    fn gives_a_static_body_zero_inverse_mass_while_keeping_its_forward_mass() {
        let body = rigid_body(Physics3DBodyType::Static);
        let collider = collider_of(
            CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: -0.5,
                min_y: -0.5,
                min_z: -0.5,
                max_x: 0.5,
                max_y: 0.5,
                max_z: 0.5,
            }),
            1.0,
        );
        body.write().unwrap().colliders.push(collider);
        update_rigid_body_3d_mass_data(&mut body.write().unwrap());

        let body = body.read().unwrap();
        assert_close(body.mass, 1.0, 1.0e-6);
        assert_eq!(body.inverse_mass, 0.0);
    }
}
