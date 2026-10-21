use flight_collision::*;
use flight_collision::contract::*;

mod get_collision_shape2d_kind {
    use super::*;

    #[test]
    fn returns_the_variant_kind_for_every_2d_shape() {
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 })),
            CollisionShapeKind2D::Circle
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Aabb(CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 })),
            CollisionShapeKind2D::Aabb
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Obb(CollisionObb2D { x: 0.0, y: 0.0, half_w: 1.0, half_h: 1.0, rotation: 0.0 })),
            CollisionShapeKind2D::Obb
        );
        assert_eq!(
            get_collision_shape2d_kind(&CollisionShape2D::Segment(CollisionSegment2D { x0: 0.0, y0: 0.0, x1: 1.0, y1: 1.0 })),
            CollisionShapeKind2D::Segment
        );
    }
}

mod get_collision_shape3d_kind {
    use super::*;

    #[test]
    fn returns_the_variant_kind_for_every_3d_shape() {
        assert_eq!(
            get_collision_shape3d_kind(&CollisionShape3D::Sphere(CollisionSphere3D { x: 0.0, y: 0.0, z: 0.0, radius: 1.0 })),
            CollisionShapeKind3D::Sphere
        );
        assert_eq!(
            get_collision_shape3d_kind(&CollisionShape3D::Aabb(CollisionAabb3D { min_x: 0.0, min_y: 0.0, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 })),
            CollisionShapeKind3D::Aabb
        );
    }
}
