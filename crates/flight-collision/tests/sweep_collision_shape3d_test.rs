use flight_collision::contract::*;
use flight_collision::*;

fn sphere(x: f32, y: f32, z: f32, radius: f32) -> CollisionShape3D {
    CollisionShape3D::Sphere(CollisionSphere3D { x, y, z, radius })
}

fn aabb3(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
) -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
    })
}

fn d1_bound(expected: f32, ts_bound: f32) -> f32 {
    ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0))
}

mod create_collision_time_of_impact3d {
    use super::*;

    #[test]
    fn starts_zeroed() {
        let out = create_collision_time_of_impact3d();
        assert_eq!(out.fraction, 0.0);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 0.0);
    }
}

mod initialize_collision_time_of_impact3d {
    use super::*;

    #[test]
    fn resets_every_field_to_zero() {
        let mut hit = create_collision_time_of_impact3d();
        hit.fraction = 1.0;
        hit.x = 2.0;
        hit.y = 3.0;
        hit.z = 4.0;
        hit.normal_x = 5.0;
        hit.normal_y = 6.0;
        hit.normal_z = 7.0;
        initialize_collision_time_of_impact3d(&mut hit);
        assert_eq!(hit.fraction, 0.0);
        assert_eq!(hit.x, 0.0);
        assert_eq!(hit.y, 0.0);
        assert_eq!(hit.z, 0.0);
        assert_eq!(hit.normal_x, 0.0);
        assert_eq!(hit.normal_y, 0.0);
        assert_eq!(hit.normal_z, 0.0);
    }
}

mod sweep_collision_shape3d {
    use super::*;

    fn sweep_collision_shape3d(
        registry: &CollisionRegistry3D,
        shape_a: &CollisionShape3D,
        shape_b: &CollisionShape3D,
        translation_x: f32,
        translation_y: f32,
        translation_z: f32,
        out: &mut CollisionTimeOfImpact3D,
    ) -> bool {
        return flight_collision::sweep_collision_shape3d(
            out,
            registry,
            shape_a,
            translation_x,
            translation_y,
            translation_z,
            shape_b,
            0.0,
            0.0,
            0.0,
            None,
        );
    }

    #[test]
    fn finds_the_exact_impact_fraction_for_two_approaching_spheres() {
        // A at x=0 r=1 moving +10x; B at x=10 r=1 stationary.
        // Gap between surfaces = 10 - 1 - 1 = 8. Fraction = 8/10 = 0.8.
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            10.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit, "sweep should detect the impact");
        // D1 f32 bound (TS: 5e-6)
        assert!((out.fraction - 0.8).abs() <= d1_bound(0.8, 5e-6));
    }

    #[test]
    fn catches_a_bullet_that_passes_clean_through_a_thin_wall() {
        let bullet = sphere(-50.0, 0.0, 0.0, 0.1);
        let wall = aabb3(-0.05, -20.0, -20.0, 0.05, 20.0, 20.0);

        // Verify no discrete overlap at the start.
        let mut manifold = create_collision_manifold3d();
        assert!(!test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &bullet,
            &wall,
            &mut manifold
        ));

        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &bullet,
            &wall,
            100.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit, "conservative advancement must catch the bullet");
        // Bullet surface at -49.9, wall starts at -0.05. Gap = 49.85. fraction = 49.85/100 ~ 0.4985.
        // D1 f32 bound (TS: 5e-5)
        assert!(
            (out.fraction - 0.4985).abs()
                <= 5e-5_f32.max(4.0 * f32::EPSILON * 0.4985_f32.abs().max(1.0)),
            "fraction {} should be near 0.4985",
            out.fraction
        );
    }

    #[test]
    fn reports_no_impact_when_the_shapes_move_apart() {
        let mut out = create_collision_time_of_impact3d();
        assert!(!sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            -10.0,
            0.0,
            0.0,
            &mut out,
        ));
    }

    #[test]
    fn reports_no_impact_when_the_motion_falls_short() {
        // Gap = 8, but velocity only 5 -> fraction would be 8/5 = 1.6 > 1.
        let mut out = create_collision_time_of_impact3d();
        assert!(!sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            5.0,
            0.0,
            0.0,
            &mut out,
        ));
    }

    #[test]
    fn reports_no_impact_for_a_pair_sliding_parallel() {
        let mut out = create_collision_time_of_impact3d();
        assert!(!sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            0.0,
            100.0,
            0.0,
            &mut out,
        ));
    }

    #[test]
    fn accounts_for_both_shapes_moving() {
        let mut out = create_collision_time_of_impact3d();
        let hit = flight_collision::sweep_collision_shape3d(
            &mut out,
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            5.0,
            0.0,
            0.0,
            &sphere(10.0, 0.0, 0.0, 1.0),
            -5.0,
            0.0,
            0.0,
            None,
        );
        assert!(hit);
        // D1 f32 bound (TS: 5e-6)
        assert!((out.fraction - 0.8).abs() <= d1_bound(0.8, 5e-6));
    }

    #[test]
    fn reports_fraction_zero_for_a_pair_that_already_overlaps() {
        let mut out = create_collision_time_of_impact3d();
        assert!(sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 2.0),
            &sphere(1.0, 0.0, 0.0, 2.0),
            10.0,
            0.0,
            0.0,
            &mut out,
        ));
        assert_eq!(out.fraction, 0.0);
    }

    #[test]
    fn orients_the_normal_from_b_toward_a() {
        // A at x=0 moving right toward B at x=10. The separation direction
        // points from B toward A (negative x). The sweep stores it from the
        // last separated measurement.
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            10.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit);
        // D1 f32 bound (TS: 5e-6)
        assert!((out.normal_x - -1.0).abs() <= d1_bound(-1.0, 5e-6));
        let normal_length = (out.normal_x * out.normal_x
            + out.normal_y * out.normal_y
            + out.normal_z * out.normal_z)
            .sqrt();
        // D1 f32 bound (TS: 5e-7)
        assert!((normal_length - 1.0).abs() <= d1_bound(1.0, 5e-7));
    }

    #[test]
    fn reports_witness_point_at_moment_of_impact() {
        // A sphere(0,0,0,1) moving at (10,0,0) toward B sphere(10,0,0,1).
        // At fraction 0.8, A center is at (8,0,0). A's leading surface is at x=9.
        // B's closest surface is also at x=9. The witness midpoint is (9, 0, 0).
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            10.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit);
        // D1 f32 bound (TS: 5e-5)
        assert!((out.x - 9.0).abs() <= d1_bound(9.0, 5e-5));
        // D1 f32 bound (TS: 5e-5)
        assert!(out.y.abs() <= d1_bound(0.0, 5e-5));
        // D1 f32 bound (TS: 5e-5)
        assert!(out.z.abs() <= d1_bound(0.0, 5e-5));
        assert!((out.x - 1.0).abs() > 0.05);
        assert!((out.x - 5.0).abs() > 0.05);
    }

    #[test]
    fn puts_the_contact_point_between_the_two_surfaces_when_b_is_the_one_moving() {
        let mut out = create_collision_time_of_impact3d();
        assert!(flight_collision::sweep_collision_shape3d(
            &mut out,
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            0.0,
            0.0,
            0.0,
            &sphere(10.0, 0.0, 0.0, 1.0),
            -10.0,
            0.0,
            0.0,
            None,
        ));
        // D1 f32 bound (TS: 5e-6)
        assert!((out.fraction - 0.8).abs() <= d1_bound(0.8, 5e-6));
        // D1 f32 bound (TS: 5e-5)
        assert!((out.x - 1.0).abs() <= d1_bound(1.0, 5e-5));
    }

    #[test]
    fn finds_the_mid_segment_contact_of_two_crossing_capsules() {
        let along_x = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let above_along_y = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: -2.0,
            z0: 5.0,
            x1: 0.0,
            y1: 2.0,
            z1: 5.0,
            radius: 0.5,
        });

        // Gap on z-axis between capsule surfaces: 5 - 0.5 - 0.5 = 4.
        // Velocity = (0,0,10), fraction = 4/10 = 0.4.
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &along_x,
            &above_along_y,
            0.0,
            0.0,
            10.0,
            &mut out,
        );
        assert!(hit, "capsule sweep should find the impact");
        // D1 f32 bound (TS: 5e-5)
        assert!((out.fraction - 0.4).abs() <= d1_bound(0.4, 5e-5));
        // D1 f32 bound (TS: 5e-4)
        assert!(out.x.abs() <= d1_bound(0.0, 5e-4));
        // D1 f32 bound (TS: 5e-4)
        assert!(out.y.abs() <= d1_bound(0.0, 5e-4));
        // D1 f32 bound (TS: 5e-4)
        assert!((out.z - 4.5).abs() <= d1_bound(4.5, 5e-4));
    }

    #[test]
    fn leaves_the_pair_touching_not_overlapping_when_advanced_to_the_reported_fraction() {
        let a = sphere(0.0, 0.0, 0.0, 1.0);
        let b = sphere(10.0, 0.0, 0.0, 1.0);
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &a,
            &b,
            10.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit);

        let advanced = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 10.0 * out.fraction,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        let mut manifold = create_collision_manifold3d();
        assert!(!test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &advanced,
            &b,
            &mut manifold,
        ));
        let a_past = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 10.0 * out.fraction + 0.01,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &a_past,
            &b,
            &mut manifold,
        ));
    }

    #[test]
    fn sweeps_a_box_against_a_box() {
        // Box [-1,1]^3 moving right toward box [9,11]^3. Gap = 9-1 = 8.
        // Velocity 10, fraction = 8/10 = 0.8.
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &aabb3(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            &aabb3(9.0, -1.0, -1.0, 11.0, 1.0, 1.0),
            10.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit, "box-box sweep should find the impact");
        // D1 f32 bound (TS: 5e-5)
        assert!((out.fraction - 0.8).abs() <= d1_bound(0.8, 5e-5));
    }

    #[test]
    fn sweeps_along_z_as_readily_as_along_x() {
        // Same as sphere-sphere but along z. Gap = 8, fraction = 0.8.
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(0.0, 0.0, 10.0, 1.0),
            0.0,
            0.0,
            10.0,
            &mut out,
        );
        assert!(hit);
        // D1 f32 bound (TS: 5e-6)
        assert!((out.fraction - 0.8).abs() <= d1_bound(0.8, 5e-6));
        // D1 f32 bound (TS: 5e-6)
        assert!((out.normal_z - -1.0).abs() <= d1_bound(-1.0, 5e-6));
    }

    #[test]
    fn declines_a_non_finite_translation() {
        let mut out = create_collision_time_of_impact3d();
        assert!(!sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &sphere(0.0, 0.0, 0.0, 1.0),
            &sphere(10.0, 0.0, 0.0, 1.0),
            f32::NAN,
            0.0,
            0.0,
            &mut out,
        ));
        assert_eq!(out.fraction, 0.0);
    }

    #[test]
    fn agrees_with_the_discrete_test_at_the_endpoints_of_an_ordinary_approach() {
        // The discrete test detects overlap at the endpoint position.
        let b = sphere(10.0, 0.0, 0.0, 1.0);
        let endpoint = sphere(9.0, 0.0, 0.0, 1.0);
        let mut manifold = create_collision_manifold3d();
        assert!(test_collision3d(
            &crate::collision_registry3d_with_built_ins(),
            &endpoint,
            &b,
            &mut manifold
        ));

        // The sweep should find contact before reaching the full displacement.
        let a = sphere(0.0, 0.0, 0.0, 1.0);
        let mut out = create_collision_time_of_impact3d();
        let hit = sweep_collision_shape3d(
            &crate::collision_registry3d_with_supports(),
            &a,
            &b,
            9.0,
            0.0,
            0.0,
            &mut out,
        );
        assert!(hit, "sweep should find impact within the displacement");
        // fraction should be less than 1 since a displacement of 9 with gap 8 overshoots.
        assert!(
            out.fraction < 1.0 && out.fraction > 0.7,
            "fraction {} should be between 0.7 and 1.0",
            out.fraction
        );
    }
}
