//! The contact velocity solver (TS `solver.ts`): warm starting and one projected Gauss-Seidel pass
//! over contact points.

use std::sync::{Arc, RwLockWriteGuard};

use flight_entity::Ref;

use crate::material::{js_max, js_min};
use crate::types::*;
use crate::world::find_physics2d_body;

/// Two bodies locked for one constraint. When both ends are the same body the one lock serves both,
/// so writes alias exactly as the source's shared object does.
pub(crate) struct Physics2DBodyPair<'a> {
    a: RwLockWriteGuard<'a, RigidBody2D>,
    b: Option<RwLockWriteGuard<'a, RigidBody2D>>,
}

impl Physics2DBodyPair<'_> {
    pub(crate) fn a(&mut self) -> &mut RigidBody2D {
        return &mut self.a;
    }

    pub(crate) fn b(&mut self) -> &mut RigidBody2D {
        return match &mut self.b {
            Some(b) => b,
            None => &mut self.a,
        };
    }
}

/// Applies an equal and opposite impulse at the two lever arms (TS `applyPhysics2DImpulse`).
pub fn apply_physics2d_impulse(
    body_a: &mut RigidBody2D,
    body_b: &mut RigidBody2D,
    r_ax: f32,
    r_ay: f32,
    r_bx: f32,
    r_by: f32,
    impulse_x: f32,
    impulse_y: f32,
) {
    apply_impulse_a(body_a, r_ax, r_ay, impulse_x, impulse_y);
    apply_impulse_b(body_b, r_bx, r_by, impulse_x, impulse_y);
}

/// The pair's relative velocity at a contact point along the normal (TS `relativeNormalVelocity`).
pub fn relative_normal_velocity(
    body_a: &RigidBody2D,
    body_b: &RigidBody2D,
    point: &Physics2DContactPoint,
    normal_x: f32,
    normal_y: f32,
) -> f32 {
    return relative_axis_velocity(body_a, body_b, point.r_ax, point.r_ay, point.r_bx, point.r_by, normal_x, normal_y);
}

/// One solve pass over the indexed contacts `start..start + count` (TS
/// `solvePhysics2DContactIndicesOnce`).
pub fn solve_physics2d_contact_indices_once(world: &Physics2DWorld, indices: &[usize], start: usize, count: usize) {
    for i in start..start + count {
        solve_physics2d_contact_at(world, indices[i]);
    }
}

/// Every contact, `velocity_iterations` passes (TS `solvePhysics2DContacts`).
pub fn solve_physics2d_contacts(world: &Physics2DWorld) {
    for _ in 0..world.config.velocity_iterations.max(0) {
        solve_physics2d_contacts_once(world);
    }
}

/// One solve pass over every contact (TS `solvePhysics2DContactsOnce`).
pub fn solve_physics2d_contacts_once(world: &Physics2DWorld) {
    for i in 0..world.contacts.len() {
        solve_physics2d_contact_at(world, i);
    }
}

/// Reapplies the cached impulses of the indexed contacts (TS `warmStartPhysics2DContactIndices`).
pub fn warm_start_physics2d_contact_indices(world: &Physics2DWorld, indices: &[usize], start: usize, count: usize) {
    for i in start..start + count {
        warm_start_physics2d_contact_at(world, indices[i]);
    }
}

/// Reapplies every contact's cached impulses (TS `warmStartPhysics2DContacts`).
pub fn warm_start_physics2d_contacts(world: &Physics2DWorld) {
    for i in 0..world.contacts.len() {
        warm_start_physics2d_contact_at(world, i);
    }
}

pub(crate) fn apply_physics2d_pair_impulse(
    pair: &mut Physics2DBodyPair<'_>,
    r_ax: f32,
    r_ay: f32,
    r_bx: f32,
    r_by: f32,
    impulse_x: f32,
    impulse_y: f32,
) {
    apply_impulse_a(pair.a(), r_ax, r_ay, impulse_x, impulse_y);
    apply_impulse_b(pair.b(), r_bx, r_by, impulse_x, impulse_y);
}

fn apply_impulse_a(body: &mut RigidBody2D, r_x: f32, r_y: f32, impulse_x: f32, impulse_y: f32) {
    body.velocity_x += impulse_x * body.inverse_mass;
    body.velocity_y += impulse_y * body.inverse_mass;
    body.angular_velocity += body.inverse_inertia * (r_x * impulse_y - r_y * impulse_x);
}

fn apply_impulse_b(body: &mut RigidBody2D, r_x: f32, r_y: f32, impulse_x: f32, impulse_y: f32) {
    body.velocity_x -= impulse_x * body.inverse_mass;
    body.velocity_y -= impulse_y * body.inverse_mass;
    body.angular_velocity -= body.inverse_inertia * (r_x * impulse_y - r_y * impulse_x);
}

pub(crate) fn lock_physics2d_body_pair<'a>(a: &'a Ref<RigidBody2D>, b: &'a Ref<RigidBody2D>) -> Physics2DBodyPair<'a> {
    if Arc::ptr_eq(a, b) {
        return Physics2DBodyPair {
            a: a.write().unwrap(),
            b: None,
        };
    }
    return Physics2DBodyPair {
        a: a.write().unwrap(),
        b: Some(b.write().unwrap()),
    };
}

pub(crate) fn pair_relative_axis_velocity(
    pair: &mut Physics2DBodyPair<'_>,
    r_ax: f32,
    r_ay: f32,
    r_bx: f32,
    r_by: f32,
    axis_x: f32,
    axis_y: f32,
) -> f32 {
    let (vax, vay) = {
        let a = pair.a();
        (a.velocity_x - a.angular_velocity * r_ay, a.velocity_y + a.angular_velocity * r_ax)
    };
    let (vbx, vby) = {
        let b = pair.b();
        (b.velocity_x - b.angular_velocity * r_by, b.velocity_y + b.angular_velocity * r_bx)
    };
    return (vax - vbx) * axis_x + (vay - vby) * axis_y;
}

fn relative_axis_velocity(
    body_a: &RigidBody2D,
    body_b: &RigidBody2D,
    r_ax: f32,
    r_ay: f32,
    r_bx: f32,
    r_by: f32,
    axis_x: f32,
    axis_y: f32,
) -> f32 {
    let vax = body_a.velocity_x - body_a.angular_velocity * r_ay;
    let vay = body_a.velocity_y + body_a.angular_velocity * r_ax;
    let vbx = body_b.velocity_x - body_b.angular_velocity * r_by;
    let vby = body_b.velocity_y + body_b.angular_velocity * r_bx;
    return (vax - vbx) * axis_x + (vay - vby) * axis_y;
}

fn solve_physics2d_contact(contact: &mut Physics2DContact, pair: &mut Physics2DBodyPair<'_>) {
    let normal_x = contact.normal_x;
    let normal_y = contact.normal_y;
    let tangent_x = -normal_y;
    let tangent_y = normal_x;
    let friction = contact.friction;

    for i in 0..contact.point_count {
        let point = &mut contact.points[i];
        let tangent_velocity =
            pair_relative_axis_velocity(pair, point.r_ax, point.r_ay, point.r_bx, point.r_by, tangent_x, tangent_y);
        let mut tangent_impulse = -point.tangent_mass * tangent_velocity;
        let limit = friction * point.normal_impulse;
        let clamped_tangent = js_max(-limit, js_min(limit, point.tangent_impulse + tangent_impulse));
        tangent_impulse = clamped_tangent - point.tangent_impulse;
        point.tangent_impulse = clamped_tangent;
        apply_physics2d_pair_impulse(
            pair,
            point.r_ax,
            point.r_ay,
            point.r_bx,
            point.r_by,
            tangent_impulse * tangent_x,
            tangent_impulse * tangent_y,
        );

        let normal_velocity =
            pair_relative_axis_velocity(pair, point.r_ax, point.r_ay, point.r_bx, point.r_by, normal_x, normal_y);
        let mut normal_impulse = -point.normal_mass * (normal_velocity + point.bias);
        let clamped_normal = js_max(0.0, point.normal_impulse + normal_impulse);
        normal_impulse = clamped_normal - point.normal_impulse;
        point.normal_impulse = clamped_normal;
        apply_physics2d_pair_impulse(
            pair,
            point.r_ax,
            point.r_ay,
            point.r_bx,
            point.r_by,
            normal_impulse * normal_x,
            normal_impulse * normal_y,
        );
    }
}

fn solve_physics2d_contact_at(world: &Physics2DWorld, contact_index: usize) {
    let Some(contact) = world.contacts.get(contact_index) else {
        return;
    };
    let mut contact = contact.write().unwrap();
    if !contact.enabled || contact.sensor {
        return;
    }
    let (Some(body_a), Some(body_b)) = (
        find_physics2d_body(world, contact.body_a),
        find_physics2d_body(world, contact.body_b),
    ) else {
        return;
    };
    let mut pair = lock_physics2d_body_pair(&body_a, &body_b);
    if !is_pair_awake(&mut pair) {
        return;
    }
    solve_physics2d_contact(&mut contact, &mut pair);
}

pub(crate) fn is_pair_awake(pair: &mut Physics2DBodyPair<'_>) -> bool {
    let a_live = {
        let a = pair.a();
        a.body_type != Physics2DBodyType::Static && !a.sleeping
    };
    let b_live = {
        let b = pair.b();
        b.body_type != Physics2DBodyType::Static && !b.sleeping
    };
    return a_live || b_live;
}

fn warm_start_physics2d_contact_at(world: &Physics2DWorld, contact_index: usize) {
    let Some(contact) = world.contacts.get(contact_index) else {
        return;
    };
    let contact = contact.read().unwrap();
    if !contact.enabled || contact.sensor {
        return;
    }
    let (Some(body_a), Some(body_b)) = (
        find_physics2d_body(world, contact.body_a),
        find_physics2d_body(world, contact.body_b),
    ) else {
        return;
    };
    let mut pair = lock_physics2d_body_pair(&body_a, &body_b);
    if !is_pair_awake(&mut pair) {
        return;
    }
    let normal_x = contact.normal_x;
    let normal_y = contact.normal_y;
    let tangent_x = -normal_y;
    let tangent_y = normal_x;
    for i in 0..contact.point_count {
        let point = contact.points[i];
        let impulse_x = point.normal_impulse * normal_x + point.tangent_impulse * tangent_x;
        let impulse_y = point.normal_impulse * normal_y + point.tangent_impulse * tangent_y;
        apply_physics2d_pair_impulse(&mut pair, point.r_ax, point.r_ay, point.r_bx, point.r_by, impulse_x, impulse_y);
    }
}
