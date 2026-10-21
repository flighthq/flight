use crate::types::*;

pub fn create_collision_manifold2d() -> CollisionManifold2D {
    let mut out: CollisionManifold2D = flight_entity::allocate_entity();
    initialize_collision_manifold2d(&mut out);
    return out;
}

pub fn initialize_collision_manifold2d(out: &mut CollisionManifold2D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.depth = 0.0;
}

pub fn clear_collision_manifold2d(out: &mut CollisionManifold2D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.depth = 0.0;
}
