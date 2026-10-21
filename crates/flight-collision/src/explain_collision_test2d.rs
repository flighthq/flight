use crate::collision_support2d::*;
use crate::gjk2d::*;
use crate::manifold2d::*;
use crate::types::*;

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn explain_collision_test2d(
    registry: &CollisionRegistry2D,
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
    let kind_a = get_collision_shape2d_kind_key(a);
    let kind_b = get_collision_shape2d_kind_key(b);
    if let Some(test) = get_collision_pair_test2d(registry, kind_a, kind_b) {
        let result = test(a, b, &mut manifold);
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 0;
        return result;
    }

    // Try pair test (reverse)
    if let Some(test) = get_collision_pair_test2d(registry, kind_b, kind_a) {
        let result = test(b, a, &mut manifold);
        out.kind = CollisionTestExplanationKind::ShapePairTest;
        out.overlapping = result;
        out.shape_index = 1;
        return result;
    }

    // GJK/EPA fallback
    let result = test_collision_support2d(registry, a, b, &mut manifold);
    out.kind = CollisionTestExplanationKind::SupportTest;
    out.overlapping = result;
    out.shape_index = 0;
    return result;
}
