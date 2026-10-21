// flight-lint: allow-file(conform-params) D5: collision registry and diagnostics state are explicit caller-owned inputs
use flight_collision::{
    CollisionContactManifold3D, CollisionRegistry3D, create_collision_contact_manifold3d,
};
use flight_spatial::SpatialPair;

use crate::collider_collision::collide_physics_3d_collider_shapes;
use crate::contacts::{
    create_physics_3d_contact, create_physics_3d_contact_point, set_physics_3d_contact_pair,
};
use crate::joint_collision_suppression::is_physics_3d_pair_joint_suppressed;
use crate::material::{mix_physics_3d_friction, mix_physics_3d_restitution};
use crate::world::write_rigid_body_3d_world_center;
use crate::{Physics3DCollider, Physics3DWorld};

pub fn build_physics_3d_contacts(world: &mut Physics3DWorld, registry: &CollisionRegistry3D) {
    rebuild_physics_3d_contacts(world, registry, true, false);
}

fn collider_pair_enabled(a: &Physics3DCollider, b: &Physics3DCollider) -> bool {
    let fa = a.filter;
    let fb = b.filter;
    if fa.group_index != 0 && fa.group_index == fb.group_index {
        return fa.group_index > 0;
    }
    return (fa.mask_bits & fb.category_bits) != 0 && (fb.mask_bits & fa.category_bits) != 0;
}

fn has_sensor(body: &crate::RigidBody3D) -> bool {
    return body
        .colliders
        .iter()
        .any(|collider| collider.read().unwrap().sensor);
}

#[allow(clippy::too_many_arguments)]
fn merge_contact(
    world: &mut Physics3DWorld,
    body_a: i32,
    body_b: i32,
    collider_a: usize,
    collider_b: usize,
    manifold: &CollisionContactManifold3D,
    sensor: bool,
    friction: f32,
    restitution: f32,
    preserve_overrides: bool,
) {
    let existing = world
        .contacts
        .iter()
        .find(|contact| {
            let c = contact.read().unwrap();
            c.body_a == body_a
                && c.body_b == body_b
                && c.collider_a == collider_a
                && c.collider_b == collider_b
        })
        .cloned();
    let is_existing = existing.is_some();
    let contact = existing.unwrap_or_else(|| {
        let c = create_physics_3d_contact();
        set_physics_3d_contact_pair(
            &mut c.write().unwrap(),
            body_a,
            body_b,
            collider_a,
            collider_b,
        );
        world.contacts.push(c.clone());
        world.events.began.push(c.clone());
        c
    });
    let center_a = world
        .body_by_index
        .get(&body_a)
        .map(|body| {
            let body = body.read().unwrap();
            let mut center = [0.0; 3];
            write_rigid_body_3d_world_center(&body, &mut center);
            center
        })
        .unwrap_or([0.0; 3]);
    let center_b = world
        .body_by_index
        .get(&body_b)
        .map(|body| {
            let body = body.read().unwrap();
            let mut center = [0.0; 3];
            write_rigid_body_3d_world_center(&body, &mut center);
            center
        })
        .unwrap_or([0.0; 3]);
    let mut contact = contact.write().unwrap();
    contact.normal_x = manifold.normal_x;
    contact.normal_y = manifold.normal_y;
    contact.normal_z = manifold.normal_z;
    if !is_existing || !preserve_overrides {
        contact.friction = friction;
        contact.restitution = restitution;
        contact.enabled = true;
        contact.sensor = sensor;
    }
    contact.touching = true;
    while contact.points.len() < manifold.point_count {
        contact.points.push(create_physics_3d_contact_point());
    }
    for (i, source) in manifold
        .points
        .iter()
        .take(manifold.point_count)
        .enumerate()
    {
        let target = &mut contact.points[i];
        target.x = source.x;
        target.y = source.y;
        target.z = source.z;
        target.depth = source.depth;
        target.feature_id = source.feature_id;
        target.r_ax = source.x - center_a[0];
        target.r_ay = source.y - center_a[1];
        target.r_az = source.z - center_a[2];
        target.r_bx = source.x - center_b[0];
        target.r_by = source.y - center_b[1];
        target.r_bz = source.z - center_b[2];
    }
    contact.point_count = manifold.point_count;
}

fn rebuild_physics_3d_contacts(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    clear_events: bool,
    preserve_overrides: bool,
) {
    crate::broadphase::synchronize_physics_3d_broadphase(world);
    let mut pairs: Vec<SpatialPair> = Vec::new();
    (world.index.query_spatial_pairs)(&mut pairs);
    if clear_events {
        world.events.began.clear();
        world.events.ended.clear();
    }
    for contact in &world.contacts {
        contact.write().unwrap().touching = false;
    }
    let mut manifold = create_collision_contact_manifold3d();
    for pair in pairs {
        let (Some(first_ref), Some(second_ref)) = (
            world.body_by_index.get(&pair.a).cloned(),
            world.body_by_index.get(&pair.b).cloned(),
        ) else {
            continue;
        };
        let first = first_ref.read().unwrap();
        let second = second_ref.read().unwrap();
        let both_immovable = first.inverse_mass == 0.0 && second.inverse_mass == 0.0;
        if both_immovable && !has_sensor(&first) && !has_sensor(&second) {
            continue;
        }
        if is_physics_3d_pair_joint_suppressed(world, first.index, second.index) {
            continue;
        }
        let ordered = first.index <= second.index;
        let (body_a, body_b) = if ordered {
            (&*first, &*second)
        } else {
            (&*second, &*first)
        };
        for (i, collider_a_ref) in body_a.colliders.iter().enumerate() {
            for (j, collider_b_ref) in body_b.colliders.iter().enumerate() {
                let collider_a = collider_a_ref.read().unwrap();
                let collider_b = collider_b_ref.read().unwrap();
                if !collider_pair_enabled(&collider_a, &collider_b) {
                    continue;
                }
                let sensor = collider_a.sensor || collider_b.sensor;
                if both_immovable && !sensor {
                    continue;
                }
                if !collide_physics_3d_collider_shapes(
                    &mut manifold,
                    registry,
                    &collider_a.world,
                    &collider_b.world,
                ) {
                    continue;
                }
                let friction = mix_physics_3d_friction(
                    collider_a.material.friction,
                    collider_b.material.friction,
                );
                let restitution = mix_physics_3d_restitution(
                    collider_a.material.restitution,
                    collider_b.material.restitution,
                );
                merge_contact(
                    world,
                    body_a.index,
                    body_b.index,
                    i,
                    j,
                    &manifold,
                    sensor,
                    friction,
                    restitution,
                    preserve_overrides,
                );
            }
        }
    }
    let mut i = world.contacts.len();
    while i > 0 {
        i -= 1;
        if !world.contacts[i].read().unwrap().touching {
            let contact = world.contacts.remove(i);
            world.events.ended.push(contact);
        }
    }
    world.contacts.sort_by(|a, b| {
        let a = a.read().unwrap();
        let b = b.read().unwrap();
        (a.body_a, a.body_b, a.collider_a, a.collider_b).cmp(&(
            b.body_a,
            b.body_b,
            b.collider_a,
            b.collider_b,
        ))
    });
}

pub fn refresh_physics_3d_contacts(world: &mut Physics3DWorld, registry: &CollisionRegistry3D) {
    rebuild_physics_3d_contacts(world, registry, false, true);
}

pub fn set_physics_3d_contact_intake_guard(
    guards: &mut crate::Physics3DGuardState,
    guard: Option<crate::Physics3DContactIntakeGuard>,
) {
    guards.contact_intake_guard = guard;
}
