use flight_collision::contract::*;
use flight_collision::*;

mod get_collision_shape_contains_point3d {
    use super::*;

    #[test]
    fn contains_a_point_inside_a_sphere_and_excludes_one_outside() {
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 1.0,
            y: 2.0,
            z: 3.0,
            radius: 2.0,
        });
        assert!(get_collision_shape_contains_point3d(&sphere, 1.0, 2.0, 3.0));
        assert!(get_collision_shape_contains_point3d(&sphere, 1.0, 2.0, 4.9));
        assert!(!get_collision_shape_contains_point3d(
            &sphere, 1.0, 2.0, 5.1
        ));
    }

    #[test]
    fn includes_a_sphere_surface_point() {
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 2.0,
        });
        assert!(get_collision_shape_contains_point3d(&sphere, 2.0, 0.0, 0.0));
    }

    #[test]
    fn separates_on_z_not_only_on_x_and_y() {
        // The axis a 2D predicate cannot see. A point far out of plane must not read as contained.
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 1.0,
        });
        assert!(!get_collision_shape_contains_point3d(
            &sphere, 0.0, 0.0, 50.0
        ));
    }

    #[test]
    fn contains_a_point_inside_an_aabb_including_on_its_face() {
        let aabb = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        });
        assert!(get_collision_shape_contains_point3d(&aabb, 0.0, 0.0, 0.0));
        assert!(get_collision_shape_contains_point3d(&aabb, 1.0, 2.0, 3.0));
        assert!(!get_collision_shape_contains_point3d(
            &aabb, 1.001, 0.0, 0.0
        ));
        assert!(!get_collision_shape_contains_point3d(
            &aabb, 0.0, 0.0, -3.001
        ));
    }

    #[test]
    fn rotates_the_query_into_an_oriented_box_rather_than_testing_its_bounding_extent() {
        // A quarter turn about +Y. A unit cube spun this way still occupies the same volume,
        // so the corner of its BOUNDING box at (0.9, 0, 0.9) is inside both -- pick a case
        // that distinguishes them instead.
        let pi_over_4 = std::f32::consts::PI / 4.0;
        let spun = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 2.0,
            half_y: 0.5,
            half_z: 0.5,
            rotation_x: 0.0,
            rotation_y: pi_over_4.sin(),
            rotation_z: 0.0,
            rotation_w: pi_over_4.cos(),
        });
        // The long axis has turned from +x onto -z, so a point far along z is inside and one
        // far along x is not. Testing the bounding box would report both inside.
        assert!(get_collision_shape_contains_point3d(&spun, 0.0, 0.0, 1.8));
        assert!(!get_collision_shape_contains_point3d(&spun, 1.8, 0.0, 0.0));
    }

    #[test]
    fn matches_the_aabb_answer_for_an_identity_rotated_box() {
        let b = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        assert!(get_collision_shape_contains_point3d(&b, 0.9, 0.9, 0.9));
        assert!(!get_collision_shape_contains_point3d(&b, 1.1, 0.0, 0.0));
    }

    #[test]
    fn contains_points_within_the_radius_of_a_capsule_segment_at_both_the_middle_and_the_caps() {
        let capsule = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        assert!(get_collision_shape_contains_point3d(
            &capsule, 0.0, 0.4, 0.0
        ));
        assert!(!get_collision_shape_contains_point3d(
            &capsule, 0.0, 0.6, 0.0
        ));
        // Inside the rounded cap, which is past the segment end.
        assert!(get_collision_shape_contains_point3d(
            &capsule, 2.4, 0.0, 0.0
        ));
        assert!(!get_collision_shape_contains_point3d(
            &capsule, 2.6, 0.0, 0.0
        ));
    }

    #[test]
    fn treats_a_zero_length_capsule_as_a_sphere() {
        let degenerate = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 1.0,
            y0: 1.0,
            z0: 1.0,
            x1: 1.0,
            y1: 1.0,
            z1: 1.0,
            radius: 1.0,
        });
        assert!(get_collision_shape_contains_point3d(
            &degenerate,
            1.0,
            1.9,
            1.0
        ));
        assert!(!get_collision_shape_contains_point3d(
            &degenerate,
            1.0,
            2.1,
            1.0
        ));
    }

    #[test]
    fn contains_a_point_inside_a_convex_hull_and_excludes_one_outside() {
        // A unit cube as a bare vertex list -- no faces anywhere.
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, -1.0,
                1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        });
        assert!(get_collision_shape_contains_point3d(&cube, 0.0, 0.0, 0.0));
        assert!(get_collision_shape_contains_point3d(&cube, 0.9, 0.9, 0.9));
        assert!(!get_collision_shape_contains_point3d(&cube, 1.1, 0.0, 0.0));
        assert!(!get_collision_shape_contains_point3d(&cube, 0.0, 0.0, -1.1));
    }

    #[test]
    fn excludes_a_point_just_past_a_hull_corner_that_its_bounding_box_would_contain() {
        let tetra = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        });
        assert!(get_collision_shape_contains_point3d(&tetra, 0.1, 0.1, 0.1));
        assert!(!get_collision_shape_contains_point3d(&tetra, 0.9, 0.9, 0.9));
    }

    #[test]
    fn returns_false_for_an_empty_hull() {
        let empty = CollisionShape3D::Convex(CollisionConvex3D { points: vec![] });
        assert!(!get_collision_shape_contains_point3d(&empty, 0.0, 0.0, 0.0));
    }

    #[test]
    fn does_not_retain_the_caller_hull_array_between_calls() {
        // A second query against a different hull must not see the first one's points.
        let first = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 10.0,
            ],
        });
        let second = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        });
        assert!(get_collision_shape_contains_point3d(&first, 2.0, 2.0, 2.0));
        // The second hull is much smaller; a point far outside should be excluded
        assert!(!get_collision_shape_contains_point3d(
            &second, 10.0, 10.0, 10.0
        ));
    }
}
