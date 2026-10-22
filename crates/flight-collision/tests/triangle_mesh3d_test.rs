use flight_collision::contract::*;

fn collision_registry3d_with_supports_and_faces() -> CollisionRegistry3D {
    let mut registry = crate::collision_registry3d_with_supports();
    register_built_in_collision_face_queries3d(&mut registry);
    return registry;
}

fn create_collision_heightfield3d(
    columns: usize,
    rows: usize,
    heights: Vec<f32>,
    cell_size_x: f32,
    cell_size_z: f32,
) -> CollisionHeightfield3D {
    let mut out = flight_collision::create_collision_heightfield3d();
    out.columns = columns;
    out.rows = rows;
    out.heights = heights;
    out.cell_size_x = cell_size_x;
    out.cell_size_z = cell_size_z;
    return out;
}

fn create_collision_triangle_mesh3d(
    points: Vec<f32>,
    indices: Vec<usize>,
) -> CollisionTriangleMesh3D {
    let mut out = flight_collision::create_collision_triangle_mesh3d();
    out.points = points;
    out.indices = indices;
    return out;
}

fn create_floor_mesh() -> CollisionTriangleMesh3D {
    create_collision_triangle_mesh3d(
        vec![
            -5.0, 0.0, -5.0, 5.0, 0.0, -5.0, 5.0, 0.0, 5.0, -5.0, 0.0, 5.0,
        ],
        vec![0, 2, 1, 0, 3, 2],
    )
}

mod collide_collision_heightfield3d {
    use super::*;

    fn collide_collision_heightfield3d(
        registry: &CollisionRegistry3D,
        heightfield: &CollisionHeightfield3D,
        convex: &CollisionShape3D,
        out: &mut CollisionContactManifold3D,
    ) -> bool {
        return flight_collision::collide_collision_heightfield3d(
            out,
            registry,
            convex,
            heightfield,
        );
    }

    #[test]
    fn collides_a_convex_body_with_a_sloped_height_grid() {
        let heightfield = create_collision_heightfield3d(2, 2, vec![0.0, 1.0, 0.0, 1.0], 1.0, 1.0);
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.5,
            y: 0.9,
            z: 0.5,
            radius: 0.5,
        });
        let mut manifold = create_collision_contact_manifold3d();

        assert!(collide_collision_heightfield3d(
            &collision_registry3d_with_supports_and_faces(),
            &heightfield,
            &sphere,
            &mut manifold
        ));
        assert!(manifold.overlapping);
        assert!(manifold.normal_y > 0.0);
        assert!(manifold.normal_x < 0.0);
    }

    #[test]
    fn observes_height_edits_after_invalidation() {
        let mut heightfield =
            create_collision_heightfield3d(2, 2, vec![0.0, 0.0, 0.0, 0.0], 1.0, 1.0);
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.5,
            y: 1.5,
            z: 0.5,
            radius: 0.25,
        });
        let mut manifold = create_collision_contact_manifold3d();
        assert!(!collide_collision_heightfield3d(
            &collision_registry3d_with_supports_and_faces(),
            &heightfield,
            &sphere,
            &mut manifold
        ));

        heightfield.heights.fill(1.4);
        invalidate_collision_heightfield3d(&mut heightfield);
        assert!(collide_collision_heightfield3d(
            &collision_registry3d_with_supports_and_faces(),
            &heightfield,
            &sphere,
            &mut manifold
        ));
    }
}

mod collide_collision_triangle_mesh3d {
    use super::*;

    fn collide_collision_triangle_mesh3d(
        registry: &CollisionRegistry3D,
        mesh: &CollisionTriangleMesh3D,
        convex: &CollisionShape3D,
        out: &mut CollisionContactManifold3D,
    ) -> bool {
        return flight_collision::collide_collision_triangle_mesh3d(out, registry, convex, mesh);
    }

    #[test]
    fn reduces_adjacent_floor_triangles_to_one_distributed_four_point_patch() {
        let mesh = create_floor_mesh();
        let box_shape = CollisionShape3D::Box(CollisionBox3D {
            x: 0.0,
            y: 0.4,
            z: 0.0,
            half_x: 0.5,
            half_y: 0.5,
            half_z: 0.5,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        });
        let mut manifold = create_collision_contact_manifold3d();

        assert!(collide_collision_triangle_mesh3d(
            &collision_registry3d_with_supports_and_faces(),
            &mesh,
            &box_shape,
            &mut manifold
        ));
        assert_eq!(manifold.normal_y, 1.0);
        assert_eq!(manifold.point_count, 4);
        let distinct_xz = manifold.points[..4]
            .iter()
            .map(|point| (point.x.to_bits(), point.z.to_bits()))
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(distinct_xz.len(), 4);
    }

    #[test]
    fn keeps_the_acceleration_local_while_the_mesh_pose_rotates() {
        let mut mesh = create_floor_mesh();
        mesh.rotation_z = std::f32::consts::FRAC_1_SQRT_2;
        mesh.rotation_w = std::f32::consts::FRAC_1_SQRT_2;
        mesh.x = 2.0;

        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 1.6,
            y: 0.0,
            z: 0.0,
            radius: 0.5,
        });
        let mut manifold = create_collision_contact_manifold3d();

        assert!(collide_collision_triangle_mesh3d(
            &collision_registry3d_with_supports_and_faces(),
            &mesh,
            &sphere,
            &mut manifold
        ));
        assert!(manifold.normal_x < -0.99);
    }

    #[test]
    fn rebuilds_the_acceleration_when_point_payload_changes() {
        let mut mesh = create_floor_mesh();
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 1.5,
            z: 0.0,
            radius: 0.25,
        });
        let mut manifold = create_collision_contact_manifold3d();
        assert!(!collide_collision_triangle_mesh3d(
            &collision_registry3d_with_supports_and_faces(),
            &mesh,
            &sphere,
            &mut manifold
        ));

        // Raise all Y coordinates to 1.4
        for i in (1..mesh.points.len()).step_by(3) {
            mesh.points[i] = 1.4;
        }
        invalidate_collision_triangle_mesh3d(&mut mesh);
        assert!(collide_collision_triangle_mesh3d(
            &collision_registry3d_with_supports_and_faces(),
            &mesh,
            &sphere,
            &mut manifold
        ));
    }
}

mod create_collision_heightfield3d {
    #[test]
    fn creates_the_canonical_zero_field_entity() {
        let heightfield = flight_collision::create_collision_heightfield3d();
        assert_eq!(heightfield.columns, 0);
        assert_eq!(heightfield.rows, 0);
        assert!(heightfield.heights.is_empty());
        assert_eq!(heightfield.cell_size_x, 1.0);
        assert_eq!(heightfield.cell_size_z, 1.0);
        assert_eq!(heightfield.version, 0);
        assert_eq!(heightfield.rotation_w, 1.0);
    }
}

mod create_collision_triangle_mesh3d {
    #[test]
    fn creates_the_canonical_zero_field_entity() {
        let mesh = flight_collision::create_collision_triangle_mesh3d();
        assert!(mesh.points.is_empty());
        assert!(mesh.indices.is_empty());
        assert_eq!(mesh.version, 0);
        assert_eq!(mesh.rotation_w, 1.0);
    }
}

mod get_collision_heightfield_validation_status3d {
    use super::*;

    #[test]
    fn rejects_malformed_grids_samples_spacing_and_poses() {
        assert_eq!(
            get_collision_heightfield_validation_status3d(&create_collision_heightfield3d(
                1,
                2,
                vec![0.0, 0.0],
                1.0,
                1.0
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_heightfield_validation_status3d(&create_collision_heightfield3d(
                2,
                2,
                vec![0.0, 0.0, 0.0],
                1.0,
                1.0
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_heightfield_validation_status3d(&create_collision_heightfield3d(
                2,
                2,
                vec![0.0, f32::NAN, 0.0, 0.0],
                1.0,
                1.0
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_heightfield_validation_status3d(&create_collision_heightfield3d(
                2,
                2,
                vec![0.0, 0.0, 0.0, 0.0],
                0.0,
                1.0
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        let mut invalid_pose =
            create_collision_heightfield3d(2, 2, vec![0.0, 0.0, 0.0, 0.0], 1.0, 1.0);
        invalid_pose.rotation_w = 2.0;
        assert_eq!(
            get_collision_heightfield_validation_status3d(&invalid_pose),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }
}

mod get_collision_triangle_mesh_validation_status3d {
    use super::*;

    #[test]
    fn rejects_malformed_out_of_range_and_degenerate_triangles() {
        assert_eq!(
            get_collision_triangle_mesh_validation_status3d(&create_collision_triangle_mesh3d(
                vec![],
                vec![]
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_triangle_mesh_validation_status3d(&create_collision_triangle_mesh3d(
                vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
                vec![0, 1, 3]
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
        assert_eq!(
            get_collision_triangle_mesh_validation_status3d(&create_collision_triangle_mesh3d(
                vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 2.0, 0.0, 0.0],
                vec![0, 1, 2]
            )),
            Some(CollisionTestStatus::DegenerateShape)
        );
    }
}

mod initialize_collision_heightfield3d {
    use super::*;

    #[test]
    fn initializes_the_canonical_fields_without_replacing_entity_identity() {
        let mut heightfield: CollisionHeightfield3D = flight_entity::allocate_entity();
        let entity_id = flight_entity::get_entity_id(&heightfield);
        initialize_collision_heightfield3d(&mut heightfield);
        assert_eq!(flight_entity::get_entity_id(&heightfield), entity_id);
        assert_eq!(heightfield.columns, 0);
        assert_eq!(heightfield.rows, 0);
        assert!(heightfield.heights.is_empty());
        assert_eq!(heightfield.cell_size_x, 1.0);
        assert_eq!(heightfield.cell_size_z, 1.0);
        assert_eq!(heightfield.version, 0);
        assert_eq!(heightfield.x, 0.0);
        assert_eq!(heightfield.rotation_w, 1.0);
    }
}

mod initialize_collision_triangle_mesh3d {
    use super::*;

    #[test]
    fn initializes_the_canonical_fields_without_replacing_entity_identity() {
        let mut mesh: CollisionTriangleMesh3D = flight_entity::allocate_entity();
        let entity_id = flight_entity::get_entity_id(&mesh);
        initialize_collision_triangle_mesh3d(&mut mesh);
        assert_eq!(flight_entity::get_entity_id(&mesh), entity_id);
        assert!(mesh.points.is_empty());
        assert!(mesh.indices.is_empty());
        assert_eq!(mesh.version, 0);
        assert_eq!(mesh.y, 0.0);
        assert_eq!(mesh.rotation_w, 1.0);
    }
}

mod invalidate_collision_heightfield3d {
    use super::*;

    #[test]
    fn increments_the_payload_version() {
        let mut heightfield =
            create_collision_heightfield3d(2, 2, vec![0.0, 0.0, 0.0, 0.0], 1.0, 1.0);
        invalidate_collision_heightfield3d(&mut heightfield);
        assert_eq!(heightfield.version, 1);
    }
}

mod invalidate_collision_triangle_mesh3d {
    use super::*;

    #[test]
    fn increments_the_payload_version() {
        let mut mesh = create_floor_mesh();
        invalidate_collision_triangle_mesh3d(&mut mesh);
        assert_eq!(mesh.version, 1);
    }
}

mod raycast_collision_heightfield3d {
    use super::*;

    #[test]
    fn reports_the_nearest_terrain_surface_with_a_ray_facing_normal() {
        let heightfield = create_collision_heightfield3d(2, 2, vec![0.0, 0.0, 0.0, 0.0], 1.0, 1.0);
        let mut hit = create_collision_raycast_hit3d();

        assert!(raycast_collision_heightfield3d(
            &mut hit,
            &heightfield,
            0.5,
            2.0,
            0.5,
            0.0,
            -4.0,
            0.0,
            None
        ));
        assert!((hit.fraction - 0.5).abs() < 1e-6);
        assert_eq!(hit.normal_y, 1.0);
    }
}

mod raycast_collision_triangle_mesh3d {
    use super::*;

    #[test]
    fn returns_the_closest_triangle_through_the_local_bvh() {
        let mesh = create_collision_triangle_mesh3d(
            vec![
                -1.0, 0.0, -1.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0, -1.0, -2.0, -1.0, 1.0, -2.0, -1.0,
                0.0, -2.0, 1.0,
            ],
            vec![0, 1, 2, 3, 4, 5],
        );
        let mut hit = create_collision_raycast_hit3d();

        assert!(raycast_collision_triangle_mesh3d(
            &mut hit, &mesh, 0.0, 2.0, 0.0, 0.0, -1.0, 0.0, None
        ));
        assert!((hit.fraction - 2.0).abs() < 1e-6);
        assert_eq!(hit.normal_y, 1.0);
    }
}

mod sweep_collision_heightfield3d {
    use super::*;

    #[test]
    fn finds_a_fast_convex_bodys_first_terrain_impact() {
        let heightfield = create_collision_heightfield3d(2, 2, vec![0.0, 0.0, 0.0, 0.0], 1.0, 1.0);
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.5,
            y: 5.0,
            z: 0.5,
            radius: 0.25,
        });
        let mut hit = create_collision_time_of_impact3d();

        assert!(sweep_collision_heightfield3d(
            &mut hit,
            &collision_registry3d_with_supports_and_faces(),
            &sphere,
            0.0,
            -10.0,
            0.0,
            &heightfield,
            None,
        ));
        // D1 f32 bound (TS: 5e-6)
        assert!(
            (hit.fraction - 0.475).abs()
                <= 5e-6_f32.max(4.0 * f32::EPSILON * 0.475_f32.abs().max(1.0)),
            "fraction: {}",
            hit.fraction
        );
        assert!(hit.normal_y > 0.99, "normal_y: {}", hit.normal_y);
    }
}

mod sweep_collision_triangle_mesh3d {
    use super::*;

    #[test]
    fn finds_a_fast_convex_bodys_first_mesh_impact() {
        let mesh = create_floor_mesh();
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 5.0,
            z: 0.0,
            radius: 0.25,
        });
        let mut hit = create_collision_time_of_impact3d();

        assert!(sweep_collision_triangle_mesh3d(
            &mut hit,
            &collision_registry3d_with_supports_and_faces(),
            &sphere,
            0.0,
            -10.0,
            0.0,
            &mesh,
            None,
        ));
        // D1 f32 bound (TS: 5e-6)
        assert!(
            (hit.fraction - 0.475).abs()
                <= 5e-6_f32.max(4.0 * f32::EPSILON * 0.475_f32.abs().max(1.0)),
            "fraction: {}",
            hit.fraction
        );
    }
}

mod write_collision_heightfield_bounds3d {
    use super::*;

    #[test]
    fn includes_the_height_samples_and_pose() {
        let mut heightfield =
            create_collision_heightfield3d(2, 2, vec![0.0, 1.0, -1.0, 0.0], 2.0, 3.0);
        heightfield.x = 4.0;
        let mut bounds = CollisionAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 0.0,
            max_y: 0.0,
            max_z: 0.0,
        };
        write_collision_heightfield_bounds3d(&heightfield, &mut bounds);
        assert!((bounds.min_x - 4.0).abs() < 1e-6);
        assert!((bounds.min_y - (-1.0)).abs() < 1e-6);
        assert!((bounds.min_z - 0.0).abs() < 1e-6);
        assert!((bounds.max_x - 6.0).abs() < 1e-6);
        assert!((bounds.max_y - 1.0).abs() < 1e-6);
        assert!((bounds.max_z - 3.0).abs() < 1e-6);
    }
}

mod write_collision_triangle_mesh_bounds3d {
    use super::*;

    #[test]
    fn transforms_local_acceleration_bounds_into_world_space() {
        let mut mesh = create_floor_mesh();
        mesh.rotation_z = std::f32::consts::FRAC_1_SQRT_2;
        mesh.rotation_w = std::f32::consts::FRAC_1_SQRT_2;
        mesh.x = 2.0;

        let mut bounds = CollisionAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 0.0,
            max_y: 0.0,
            max_z: 0.0,
        };
        write_collision_triangle_mesh_bounds3d(&mesh, &mut bounds);

        assert!((bounds.min_x - 2.0).abs() < 1e-6);
        assert!((bounds.max_x - 2.0).abs() < 1e-6);
        assert!((bounds.min_y - (-5.0)).abs() < 1e-6);
        assert!((bounds.max_y - 5.0).abs() < 1e-6);
    }
}
