use crate::collision_support2d::*;
use crate::gjk2d::*;
use crate::types::*;

pub fn set_collision_test_guard2d(_guard: Option<fn(&CollisionShape2D, &CollisionShape2D)>) {
    // Guard storage is runtime-only. In Rust IR the guard callback is not retained.
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision2d(
    registry: &CollisionRegistry2D,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionManifold2D,
) -> bool {
    let kind_a = get_collision_shape2d_kind_key(a);
    let kind_b = get_collision_shape2d_kind_key(b);
    if let Some(test) = get_collision_pair_test2d(registry, kind_a, kind_b) {
        return test(a, b, out);
    }

    if let Some(test) = get_collision_pair_test2d(registry, kind_b, kind_a) {
        if test(b, a, out) {
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
            return true;
        }
        return false;
    }

    return test_collision_support2d(registry, a, b, out);
}
