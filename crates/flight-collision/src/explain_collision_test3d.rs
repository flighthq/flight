use crate::collision_support3d::*;
use crate::gjk3d::*;
use crate::manifold3d::*;
use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn explain_collision_test3d(
    registry: &CollisionRegistry3D,
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
    let kind_a = get_collision_shape3d_kind_key(a);
    let kind_b = get_collision_shape3d_kind_key(b);
    if let Some(test) = get_collision_pair_test3d(registry, kind_a, kind_b) {
        let result = test(a, b, &mut manifold);
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 0;
        return result;
    }

    // Try pair test (reverse)
    if let Some(test) = get_collision_pair_test3d(registry, kind_b, kind_a) {
        let result = test(b, a, &mut manifold);
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 1;
        return result;
    }

    // GJK/EPA fallback
    let result = test_collision_support3d(registry, a, b, &mut manifold);
    out.kind = CollisionTestExplanationKind::SupportTest;
    out.overlapping = result;
    out.shape_index = 0;
    return result;
}
