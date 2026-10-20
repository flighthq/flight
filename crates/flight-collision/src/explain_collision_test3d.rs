use crate::collision_support3d::*;
use crate::gjk3d::*;
use crate::manifold3d::*;
use crate::types::*;

pub fn explain_collision_test3d(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionTestExplanation3D,
) -> bool {
    *out = CollisionTestExplanation3D::default();

    // Check shape validation first
    let status_a = crate::collision_shape_validation3d::get_collision_shape_validation_status3d(a);
    if let Some(status) = status_a {
        out.kind = CollisionTestExplanationKind::NoTest;
        out.status = Some(status);
        return false;
    }
    let status_b = crate::collision_shape_validation3d::get_collision_shape_validation_status3d(b);
    if let Some(status) = status_b {
        out.kind = CollisionTestExplanationKind::NoTest;
        out.status = Some(status);
        return false;
    }

    // Try pair test (forward)
    let mut manifold = create_collision_manifold3d();
    if let Some(result) = get_collision_pair_test3d(a, b, &mut manifold) {
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 0;
        return result;
    }

    // Try pair test (reverse)
    if let Some(result) = get_collision_pair_test3d(b, a, &mut manifold) {
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 1;
        return result;
    }

    // GJK/EPA fallback
    let result = test_collision_support3d(a, b, &mut manifold);
    out.kind = CollisionTestExplanationKind::SupportTest;
    out.overlapping = result;
    out.shape_index = 0;
    return result;
}
