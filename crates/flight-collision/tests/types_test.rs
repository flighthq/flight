mod collision_collider_shape3d {
    use std::sync::{Arc, RwLock};

    use super::*;

    fn collision_heightfield3d(
        columns: usize,
        rows: usize,
        heights: Vec<f32>,
        cell_size_x: f32,
        cell_size_z: f32,
    ) -> CollisionHeightfield3D {
        let mut out = create_collision_heightfield3d();
        out.columns = columns;
        out.rows = rows;
        out.heights = heights;
        out.cell_size_x = cell_size_x;
        out.cell_size_z = cell_size_z;
        return out;
    }

    fn collision_triangle_mesh3d(points: Vec<f32>, indices: Vec<usize>) -> CollisionTriangleMesh3D {
        let mut out = create_collision_triangle_mesh3d();
        out.points = points;
        out.indices = indices;
        return out;
    }

    #[test]
    fn carries_the_existing_builtin_enum_by_value() {
        let collider =
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(CollisionSphere3D {
                x: 1.0,
                y: 2.0,
                z: 3.0,
                radius: 4.0,
            }));
        let CollisionColliderShape3D::BuiltIn(shape) = collider else {
            panic!("built-in payload");
        };
        assert_eq!(
            shape,
            CollisionShape3D::Sphere(CollisionSphere3D {
                x: 1.0,
                y: 2.0,
                z: 3.0,
                radius: 4.0,
            })
        );
    }

    #[test]
    fn static_descriptors_keep_their_shared_entity_identity() {
        let mesh = Arc::new(RwLock::new(collision_triangle_mesh3d(
            vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            vec![0, 1, 2],
        )));
        let heightfield = Arc::new(RwLock::new(collision_heightfield3d(
            2,
            2,
            vec![0.0; 4],
            1.0,
            1.0,
        )));
        let triangle = CollisionColliderShape3D::TriangleMesh(mesh.clone());
        let height = CollisionColliderShape3D::Heightfield(heightfield.clone());
        let triangle_clone = triangle.clone();
        let height_clone = height.clone();
        let CollisionColliderShape3D::TriangleMesh(triangle_handle) = triangle_clone else {
            panic!("triangle payload");
        };
        let CollisionColliderShape3D::Heightfield(height_handle) = height_clone else {
            panic!("heightfield payload");
        };
        assert!(Arc::ptr_eq(&triangle_handle, &mesh));
        assert!(Arc::ptr_eq(&height_handle, &heightfield));
    }
}

use flight_collision::contract::*;
use flight_collision::*;

mod get_collision_shape2d_kind {
    use super::*;

    #[test]
    fn returns_the_variant_kind_for_every_2d_shape() {
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Circle(CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0
            })),
            CollisionShapeKind2D::Circle
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 1.0,
                max_y: 1.0
            })),
            CollisionShapeKind2D::Aabb
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Obb(CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 1.0,
                half_h: 1.0,
                rotation: 0.0
            })),
            CollisionShapeKind2D::Obb
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Segment(CollisionSegment2D {
                x0: 0.0,
                y0: 0.0,
                x1: 1.0,
                y1: 1.0
            })),
            CollisionShapeKind2D::Segment
        );
    }
}

mod get_collision_shape3d_kind {
    use super::*;

    #[test]
    fn returns_the_variant_kind_for_every_3d_shape() {
        assert_eq!(
            get_collision_shape3d_kind(&CollisionShape3D::Sphere(CollisionSphere3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                radius: 1.0
            })),
            CollisionShapeKind3D::Sphere
        );
        assert_eq!(
            get_collision_shape3d_kind(&CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0,
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0
            })),
            CollisionShapeKind3D::Aabb
        );
    }
}
