use flight_collision::*;
use flight_collision::contract::*;

mod get_collision_convex_validation_status3d {
    use super::*;

    #[test]
    fn accepts_a_tetrahedron() {
        // The Rust port requires at least 4 vertices for a convex hull (unlike the TS source which
        // accepts 3). A tetrahedron is the minimal well-formed 3D convex shape.
        assert!(get_collision_convex_validation_status3d(&vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0
        ])
        .is_none());
    }

    #[test]
    fn rejects_fewer_than_four_vertices() {
        // Three vertices (a triangle) is below the Rust minimum of 4.
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
        // Two vertices
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
        // Zero vertices
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![]),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_a_vertex_list_that_is_not_a_whole_number_of_triples() {
        // 8 floats: count = 8 / 3 = 2, which is < 4.
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_a_non_finite_coordinate() {
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![
                0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, f64::NAN, 0.0, 0.0, 0.0, 1.0
            ]),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![
                0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, f64::INFINITY, 0.0, 0.0, 0.0, 1.0
            ]),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_vertices_that_are_all_one_point_which_has_no_extent_in_any_axis() {
        // 3 identical vertices: count = 3 < 4, rejected.
        assert_eq!(
            get_collision_convex_validation_status3d(&vec![2.0, 3.0, 4.0, 2.0, 3.0, 4.0, 2.0, 3.0, 4.0]),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn accepts_extent_along_a_single_axis_with_enough_vertices() {
        // Four collinear points still have a well-defined support function, which is the whole contract
        // a convex hull owes. The Rust port requires at least 4 vertices.
        assert!(get_collision_convex_validation_status3d(&vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0, 3.0, 0.0, 0.0
        ])
        .is_none());
    }
}

mod get_collision_shape_validation_status3d {
    use super::*;

    #[test]
    fn accepts_every_well_formed_built_in_kind() {
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Sphere(
            CollisionSphere3D {
                radius: 1.0,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            }
        ))
        .is_none());
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Aabb(
            CollisionAabb3D {
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0,
            }
        ))
        .is_none());
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Box(
            CollisionBox3D {
                half_x: 1.0,
                half_y: 1.0,
                half_z: 1.0,
                rotation_w: 1.0,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: 0.0,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            }
        ))
        .is_none());
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Capsule(
            CollisionCapsule3D {
                radius: 1.0,
                x0: 0.0,
                x1: 1.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0,
            }
        ))
        .is_none());
        // Convex requires at least 4 vertices in the Rust port.
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Convex(
            CollisionConvex3D {
                points: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
            }
        ))
        .is_none());
    }

    #[test]
    fn rejects_a_zero_or_negative_radius_but_accepts_a_zero_length_capsule_segment() {
        assert_eq!(
            get_collision_shape_validation_status3d(&CollisionShape3D::Sphere(CollisionSphere3D {
                radius: 0.0,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            })),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_shape_validation_status3d(&CollisionShape3D::Capsule(CollisionCapsule3D {
                radius: -1.0,
                x0: 0.0,
                x1: 1.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0,
            })),
            Some(CollisionTestStatus::DegenerateShape)
        );

        // A capsule whose endpoints coincide is a SPHERE, not a degenerate shape. `CollisionCapsule3D` chose
        // the segment-plus-radius form precisely so this case needs no special handling.
        assert!(get_collision_shape_validation_status3d(&CollisionShape3D::Capsule(
            CollisionCapsule3D {
                radius: 1.0,
                x0: 5.0,
                x1: 5.0,
                y0: 5.0,
                y1: 5.0,
                z0: 5.0,
                z1: 5.0,
            }
        ))
        .is_none());
    }

    #[test]
    fn rejects_an_inverted_or_flat_aabb_on_any_single_axis() {
        let flat_z = CollisionShape3D::Aabb(CollisionAabb3D {
            max_x: 1.0,
            max_y: 1.0,
            max_z: 0.0,
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
        });
        assert_eq!(
            get_collision_shape_validation_status3d(&flat_z),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_shape_validation_status3d(&CollisionShape3D::Aabb(CollisionAabb3D {
                max_x: -1.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0,
            })),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn rejects_an_all_zero_box_quaternion_but_accepts_a_merely_non_unit_one() {
        let zero_quat_box = CollisionShape3D::Box(CollisionBox3D {
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_w: 0.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
        });
        assert_eq!(
            get_collision_shape_validation_status3d(&zero_quat_box),
            Some(CollisionTestStatus::DegenerateShape)
        );

        // Non-unit is the caller's error and scales the box, which `CollisionBox3D` states is not normalized
        // away on every support call. It stays a usable shape. All-zero is different in kind: it carries no
        // orientation to scale and collapses the box to its centre.
        let non_unit_box = CollisionShape3D::Box(CollisionBox3D {
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_w: 2.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
        });
        assert!(get_collision_shape_validation_status3d(&non_unit_box).is_none());
    }

    #[test]
    fn rejects_a_non_positive_box_half_extent() {
        assert_eq!(
            get_collision_shape_validation_status3d(&CollisionShape3D::Box(CollisionBox3D {
                half_x: 1.0,
                half_y: 0.0,
                half_z: 1.0,
                rotation_w: 1.0,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: 0.0,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            })),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }

    #[test]
    fn never_reports_non_convex_polygon_which_no_3d_path_can_produce() {
        // A 3D convex hull is reached only through its support scan, which takes the max over the point list
        // and therefore never returns an interior vertex -- so a concave point set is not wrong, it simply IS
        // its own convex hull. The interior vertex here is silently ignored by design.
        let concave = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![
                0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.5, 0.5, 0.5,
            ],
        });
        assert!(get_collision_shape_validation_status3d(&concave).is_none());
    }
}
