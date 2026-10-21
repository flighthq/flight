use crate::collision_support2d::*;
use crate::manifold2d::*;
use crate::test_collision2d::*;
use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn explain_collision_test2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
) -> CollisionTestExplanation2D {
    if let Some(status) = crate::collision_shape_validation2d::get_collision_shape_validation_status2d(a) {
        return CollisionTestExplanation2D {
            kind: Some(get_collision_shape2d_kind(a)),
            overlapping: false,
            shape_index: Some(0),
            status,
        };
    }
    if let Some(status) = crate::collision_shape_validation2d::get_collision_shape_validation_status2d(b) {
        return CollisionTestExplanation2D {
            kind: Some(get_collision_shape2d_kind(b)),
            overlapping: false,
            shape_index: Some(1),
            status,
        };
    }

    let kind_a = get_collision_shape2d_kind_key(a);
    let kind_b = get_collision_shape2d_kind_key(b);
    if get_collision_pair_test2d(registry, kind_a, kind_b).is_none()
        && get_collision_pair_test2d(registry, kind_b, kind_a).is_none()
    {
        if get_collision_support2d(registry, kind_a).is_none() {
            return CollisionTestExplanation2D {
                kind: Some(get_collision_shape2d_kind(a)),
                overlapping: false,
                shape_index: Some(0),
                status: CollisionTestStatus::UnsupportedShapeKind,
            };
        }
        if get_collision_support2d(registry, kind_b).is_none() {
            return CollisionTestExplanation2D {
                kind: Some(get_collision_shape2d_kind(b)),
                overlapping: false,
                shape_index: Some(1),
                status: CollisionTestStatus::UnsupportedShapeKind,
            };
        }
    }

    let mut manifold = create_collision_manifold2d();
    let overlapping = test_collision2d(registry, a, b, &mut manifold);
    return CollisionTestExplanation2D {
        kind: None,
        overlapping,
        shape_index: None,
        status: if overlapping { CollisionTestStatus::Overlapping } else { CollisionTestStatus::Separated },
    };
}
