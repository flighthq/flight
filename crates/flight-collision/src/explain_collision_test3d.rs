use crate::collision_support3d::*;
use crate::manifold3d::*;
use crate::test_collision3d::*;
use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn explain_collision_test3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
) -> CollisionTestExplanation3D {
    if let Some(status) =
        crate::collision_shape_validation3d::get_collision_shape_validation_status3d(a)
    {
        return CollisionTestExplanation3D {
            kind: Some(get_collision_shape3d_kind(a)),
            overlapping: false,
            shape_index: Some(0),
            status,
        };
    }
    if let Some(status) =
        crate::collision_shape_validation3d::get_collision_shape_validation_status3d(b)
    {
        return CollisionTestExplanation3D {
            kind: Some(get_collision_shape3d_kind(b)),
            overlapping: false,
            shape_index: Some(1),
            status,
        };
    }

    let kind_a = get_collision_shape3d_kind_key(a);
    let kind_b = get_collision_shape3d_kind_key(b);
    if get_collision_pair_test3d(registry, kind_a, kind_b).is_none()
        && get_collision_pair_test3d(registry, kind_b, kind_a).is_none()
    {
        if get_collision_support3d(registry, kind_a).is_none() {
            return CollisionTestExplanation3D {
                kind: Some(get_collision_shape3d_kind(a)),
                overlapping: false,
                shape_index: Some(0),
                status: CollisionTestStatus::UnsupportedShapeKind,
            };
        }
        if get_collision_support3d(registry, kind_b).is_none() {
            return CollisionTestExplanation3D {
                kind: Some(get_collision_shape3d_kind(b)),
                overlapping: false,
                shape_index: Some(1),
                status: CollisionTestStatus::UnsupportedShapeKind,
            };
        }
    }

    let mut manifold = create_collision_manifold3d();
    let overlapping = test_collision3d(registry, a, b, &mut manifold);
    return CollisionTestExplanation3D {
        kind: None,
        overlapping,
        shape_index: None,
        status: if overlapping {
            CollisionTestStatus::Overlapping
        } else {
            CollisionTestStatus::Separated
        },
    };
}
