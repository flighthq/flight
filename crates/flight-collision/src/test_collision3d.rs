use crate::collision_support3d::*;
use crate::gjk3d::*;
use crate::types::*;

pub fn set_collision_test_guard3d(_guard: Option<fn(&CollisionShape3D, &CollisionShape3D)>) {
    // Guard storage is runtime-only. In Rust IR the guard callback is not retained.
}

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn test_collision3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    let kind_a = get_collision_shape3d_kind_key(a);
    let kind_b = get_collision_shape3d_kind_key(b);
    if let Some(test) = get_collision_pair_test3d(registry, kind_a, kind_b) {
        return test(a, b, out);
    }

    if let Some(test) = get_collision_pair_test3d(registry, kind_b, kind_a) {
        if test(b, a, out) {
            out.normal_x = -out.normal_x;
            out.normal_y = -out.normal_y;
            out.normal_z = -out.normal_z;
            return true;
        }
        return false;
    }

    return test_collision_support3d(registry, a, b, out);
}
