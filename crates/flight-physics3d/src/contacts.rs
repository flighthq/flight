use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::{Physics3DContact, Physics3DContactPoint};

// flight-lint: allow(conform-params) D23: canonical Entity create is zero-argument; callers assign the contact pair after creation
pub fn create_physics_3d_contact() -> Ref<Physics3DContact> {
    let mut out = allocate_entity();
    initialize_physics_3d_contact(&mut out);
    return Arc::new(RwLock::new(out));
}

pub fn create_physics_3d_contact_point() -> Physics3DContactPoint {
    let mut out = allocate_entity();
    initialize_physics_3d_contact_point(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23: canonical Entity initialize mirrors zero-argument creation; callers assign the contact pair afterward
pub fn initialize_physics_3d_contact(out: &mut Physics3DContact) {
    set_physics_3d_contact_pair(out, 0, 0, 0, 0);
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
    out.point_count = 0;
    out.points.clear();
    out.friction = 0.0;
    out.restitution = 0.0;
    out.enabled = true;
    out.sensor = false;
    out.touching = false;
}

pub fn initialize_physics_3d_contact_point(out: &mut Physics3DContactPoint) {
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.depth = 0.0;
    out.feature_id = 0;
    out.r_ax = 0.0;
    out.r_ay = 0.0;
    out.r_az = 0.0;
    out.r_bx = 0.0;
    out.r_by = 0.0;
    out.r_bz = 0.0;
}

pub(crate) fn set_physics_3d_contact_pair(
    out: &mut Physics3DContact,
    body_a: i32,
    body_b: i32,
    collider_a: usize,
    collider_b: usize,
) {
    let ordered = body_a <= body_b;
    out.body_a = if ordered { body_a } else { body_b };
    out.body_b = if ordered { body_b } else { body_a };
    out.collider_a = if ordered { collider_a } else { collider_b };
    out.collider_b = if ordered { collider_b } else { collider_a };
}
