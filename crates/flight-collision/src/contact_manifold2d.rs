use crate::types::*;

pub fn create_collision_contact_manifold2d() -> CollisionContactManifold2D {
    let mut out: CollisionContactManifold2D = flight_entity::allocate_entity();
    initialize_collision_contact_manifold2d(&mut out);
    return out;
}

pub fn initialize_collision_contact_manifold2d(out: &mut CollisionContactManifold2D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.depth = 0.0;
    out.point_count = 0;
    for i in 0..MAX_COLLISION_CONTACT_POINTS_2D {
        out.points[i].x = 0.0;
        out.points[i].y = 0.0;
        out.points[i].depth = 0.0;
        out.points[i].feature_id = 0;
    }
}

pub fn clear_collision_contact_manifold2d(out: &mut CollisionContactManifold2D) {
    out.overlapping = false;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.depth = 0.0;
    out.point_count = 0;
}
