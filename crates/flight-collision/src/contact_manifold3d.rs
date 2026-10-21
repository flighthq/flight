use crate::types::*;

pub fn create_collision_contact_manifold3d() -> CollisionContactManifold3D {
    let mut out: CollisionContactManifold3D = flight_entity::allocate_entity();
    initialize_collision_contact_manifold3d(&mut out);
    return out;
}

pub fn initialize_collision_contact_manifold3d(out: &mut CollisionContactManifold3D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.point_count = 0;
    for i in 0..MAX_COLLISION_CONTACT_POINTS_3D {
        out.points[i].x = 0.0;
        out.points[i].y = 0.0;
        out.points[i].z = 0.0;
        out.points[i].depth = 0.0;
        out.points[i].feature_id = 0;
    }
}

pub fn clear_collision_contact_manifold3d(out: &mut CollisionContactManifold3D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.point_count = 0;
}
