use crate::types::*;

pub fn create_collision_manifold3d() -> CollisionManifold3D {
    let mut out = CollisionManifold3D::default();
    initialize_collision_manifold3d(&mut out);
    return out;
}

pub fn initialize_collision_manifold3d(out: &mut CollisionManifold3D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.depth = 0.0;
}

pub fn clear_collision_manifold3d(out: &mut CollisionManifold3D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.depth = 0.0;
}
