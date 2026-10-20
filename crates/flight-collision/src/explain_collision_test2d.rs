use crate::collision_support2d::*;
use crate::gjk2d::*;
use crate::manifold2d::*;
use crate::types::*;

pub fn explain_collision_test2d(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionTestExplanation2D,
) -> bool {
    *out = CollisionTestExplanation2D::default();

    // Check shape validation first
    let status_a = crate::collision_shape_validation2d::get_collision_shape_validation_status2d(a);
    if let Some(status) = status_a {
        out.kind = CollisionTestExplanationKind::NoTest;
        out.status = Some(status);
        return false;
    }
    let status_b = crate::collision_shape_validation2d::get_collision_shape_validation_status2d(b);
    if let Some(status) = status_b {
        out.kind = CollisionTestExplanationKind::NoTest;
        out.status = Some(status);
        return false;
    }

    // Try pair test (forward)
    let mut manifold = create_collision_manifold2d();
    if let Some(result) = get_collision_pair_test2d(a, b, &mut manifold) {
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 0;
        return result;
    }

    // Try pair test (reverse)
    if let Some(result) = get_collision_pair_test2d(b, a, &mut manifold) {
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 1;
        return result;
    }

    // GJK/EPA fallback
    let result = test_collision_support2d(a, b, &mut manifold);
    out.kind = CollisionTestExplanationKind::SupportTest;
    out.overlapping = result;
    out.shape_index = 0;
    return result;
}
