use crate::collision_support2d::*;
use crate::gjk2d::*;
use crate::manifold2d::*;
use crate::types::*;

pub fn set_collision_test_guard2d(_guard: Option<fn(&CollisionShape2D, &CollisionShape2D)>) {
    // Guard storage is runtime-only. In Rust IR the guard callback is not retained.
}

pub fn test_collision2d(
    a: &CollisionShape2D,
    b: &CollisionShape2D,
    out: &mut CollisionManifold2D,
) -> bool {
    if let Some(result) = get_collision_pair_test2d(a, b, out) {
        return result;
    }

    if let Some(result) = get_collision_pair_test2d(b, a, out) {
        if result {
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
        }
        return result;
    }

    return test_collision_support2d(a, b, out);
}
