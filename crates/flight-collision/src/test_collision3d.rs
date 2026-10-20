use crate::collision_support3d::*;
use crate::gjk3d::*;
use crate::manifold3d::*;
use crate::types::*;

pub fn test_collision3d(
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    if let Some(result) = get_collision_pair_test3d(a, b, out) {
        return result;
    }

    if let Some(result) = get_collision_pair_test3d(b, a, out) {
        if result {
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
            out.normal_z = -out.normal_z;
        }
        return result;
    }

    return test_collision_support3d(a, b, out);
}

pub fn set_collision_test_guard3d(_guard: Option<fn(&CollisionShape3D, &CollisionShape3D)>) {
    // Guard storage is runtime-only. In Rust IR the guard callback is not retained.
}
