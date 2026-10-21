//! The explicit world step (TS `step.ts`): contact intake, sleep and islands, the sequential-impulse
//! velocity solve over contacts and joints, integration (with chronological CCD for bullets), the
//! position pass, and break detection. The source's step scratch pool is a per-step local; its
//! module guards are the caller's `Physics2DGuardState` (D5); the collision registry the sweep reads
//! is explicit (D5, as flight-collision).

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use flight_collision::{
    CollisionContactManifold2D, CollisionRegistry2D, CollisionShape2D, CollisionTimeOfImpact2D,
    collide_contact_manifold2d, create_collision_contact_manifold2d, create_collision_time_of_impact2d,
    get_collision_shape_contains_point2d, sweep_collision_shape2d, test_segment_aabb_collision2d,
    test_segment_capsule_collision2d, test_segment_circle_collision2d, test_segment_obb_collision2d,
    test_segment_polygon_collision2d, test_segment_segment_collision2d,
};
use flight_entity::{Ref, throw_error};
use flight_spatial::SpatialPair;

use crate::broadphase::{synchronize_physics2d_broadphase, synchronize_physics2d_swept_broadphase};
use crate::collider_transform::update_physics2d_collider_world_shape;
use crate::islands::{build_physics2d_solve_islands, update_physics2d_sleep};
use crate::joint_collision_suppression::is_physics2d_pair_joint_suppressed;
use crate::joint_reactions::{create_physics2d_joint_reaction, write_physics2d_joint_reaction};
use crate::joint_registry::remove_physics2d_joint;
use crate::material::{js_max, js_min, mix_physics2d_friction, mix_physics2d_restitution};
use crate::ownership::{is_physics2d_world_stepping, set_physics2d_world_stepping};
use crate::solver::{
    Physics2DBodyPair, apply_physics2d_pair_impulse, is_pair_awake, lock_physics2d_body_pair,
    pair_relative_axis_velocity, solve_physics2d_contact_indices_once, warm_start_physics2d_contact_indices,
};
use crate::step_validation::*;
use crate::types::*;
use crate::world::{find_physics2d_body, is_physics2d_pair_ordered};

const CCD_ROTATION_BISECTION_ITERATIONS: usize = 12;
const CCD_ROTATION_INCREMENT: f32 = std::f32::consts::PI / 90.0;

// The per-step scratch the source leases from its pool.
struct Physics2DStepScratch {
    ccd_center_a: (f32, f32),
    ccd_center_b: (f32, f32),
    ccd_impact_body_a: i32,
    ccd_impact_body_b: i32,
    ccd_impact_collider_a: i32,
    ccd_impact_collider_b: i32,
    ccd_impact_fraction: f32,
    ccd_impact_normal_x: f32,
    ccd_impact_normal_y: f32,
    ccd_impact_x: f32,
    ccd_impact_y: f32,
    ccd_pairs: Vec<SpatialPair>,
    ccd_rotational_manifold: CollisionContactManifold2D,
    ccd_sweep: CollisionTimeOfImpact2D,
    manifold: CollisionContactManifold2D,
    pairs: Vec<SpatialPair>,
}

fn create_physics2d_contact_point() -> Physics2DContactPoint {
    return Physics2DContactPoint::default();
}

fn create_physics2d_impact_contact(
    world: &mut Physics2DWorld,
    scratch: &mut Physics2DStepScratch,
    body_a: i32,
    body_b: i32,
    friction: f32,
    restitution: f32,
) -> Physics2DContactRef {
    scratch.manifold.normal_x = scratch.ccd_impact_normal_x;
    scratch.manifold.normal_y = scratch.ccd_impact_normal_y;
    scratch.manifold.point_count = 1;
    scratch.manifold.points[0].x = scratch.ccd_impact_x;
    scratch.manifold.points[0].y = scratch.ccd_impact_y;
    scratch.manifold.points[0].depth = 0.0;
    scratch.manifold.points[0].feature_id = 0;
    let contact = merge_physics2d_contact(
        world,
        body_a,
        body_b,
        scratch.ccd_impact_collider_a as usize,
        scratch.ccd_impact_collider_b as usize,
        &scratch.manifold,
        false,
        friction,
        restitution,
    );
    if let Some(pre_solve) = world.contact_hooks.pre_solve.clone() {
        run_physics2d_contact_hook(world, &contact, &pre_solve, "Physics2D pre-solve hook produced invalid contact state");
    }
    return contact;
}

fn advance_all_awake_physics2d_bodies(world: &Physics2DWorld, dt: f32) {
    for body in &world.bodies {
        let mut body = body.write().unwrap();
        if body.body_type == Physics2DBodyType::Static || body.sleeping {
            continue;
        }
        advance_physics2d_body(&mut body, dt);
    }
}

fn advance_physics2d_body(body: &mut RigidBody2D, dt: f32) {
    let (dx, dy) = (body.velocity_x * dt, body.velocity_y * dt);
    let angle_delta = if body.fixed_rotation { 0.0 } else { body.angular_velocity * dt };
    advance_physics2d_body_transform(body, dx, dy, angle_delta);
}

// Moves a body by a displacement of its centre of mass plus a rotation about that centre.
fn advance_physics2d_body_transform(body: &mut RigidBody2D, center_delta_x: f32, center_delta_y: f32, angle_delta: f32) {
    if body.center_x == 0.0 && body.center_y == 0.0 {
        body.x += center_delta_x;
        body.y += center_delta_y;
        body.angle += angle_delta;
        return;
    }
    let cos = body.angle.cos();
    let sin = body.angle.sin();
    let center_x = body.x + body.center_x * cos - body.center_y * sin + center_delta_x;
    let center_y = body.y + body.center_x * sin + body.center_y * cos + center_delta_y;
    let angle = body.angle + angle_delta;
    let next_cos = angle.cos();
    let next_sin = angle.sin();
    body.x = center_x - (body.center_x * next_cos - body.center_y * next_sin);
    body.y = center_y - (body.center_x * next_sin + body.center_y * next_cos);
    body.angle = angle;
}

fn advance_physics2d_solve_island_bodies(world: &Physics2DWorld, dt: f32) {
    for island in 0..world.solve_island_roots.len() {
        let start = world.solve_island_body_starts[island];
        let end = start + world.solve_island_body_counts[island];
        for at in start..end {
            advance_physics2d_body(&mut world.bodies[world.solve_island_body_indices[at]].write().unwrap(), dt);
        }
    }
}

fn body_center(body: &RigidBody2D) -> (f32, f32) {
    let cos = body.angle.cos();
    let sin = body.angle.sin();
    return (
        body.x + body.center_x * cos - body.center_y * sin,
        body.y + body.center_x * sin + body.center_y * cos,
    );
}

fn build_physics2d_contacts(world: &mut Physics2DWorld, scratch: &mut Physics2DStepScratch) {
    scratch.pairs.clear();
    (world.index.query_spatial_pairs)(&mut scratch.pairs);

    world.events.began.clear();
    world.events.ended.clear();
    for contact in &world.contacts {
        contact.write().unwrap().touching = false;
    }

    let pairs = scratch.pairs.clone();
    for pair in &pairs {
        let (Some(first), Some(second)) = (find_physics2d_body(world, pair.a), find_physics2d_body(world, pair.b)) else {
            continue;
        };
        let (first_index, second_index, both_immovable, sensing) = {
            let (f, s) = (first.read().unwrap(), second.read().unwrap());
            (
                f.index,
                s.index,
                f.inverse_mass == 0.0 && s.inverse_mass == 0.0,
                has_sensor_collider(&f) || has_sensor_collider(&s),
            )
        };
        if both_immovable && !sensing {
            continue;
        }
        if is_physics2d_pair_joint_suppressed(world, first_index, second_index) {
            continue;
        }
        let ordered = is_physics2d_pair_ordered(&first.read().unwrap(), &second.read().unwrap());
        let (body_a, body_b) = if ordered { (first, second) } else { (second, first) };
        let (index_a, colliders_a) = {
            let a = body_a.read().unwrap();
            (a.index, a.colliders.clone())
        };
        let (index_b, colliders_b) = {
            let b = body_b.read().unwrap();
            (b.index, b.colliders.clone())
        };
        for (i, collider_a) in colliders_a.iter().enumerate() {
            for (j, collider_b) in colliders_b.iter().enumerate() {
                let (sensor_pair, friction, restitution) = {
                    let (ca, cb) = (collider_a.read().unwrap(), collider_b.read().unwrap());
                    if !is_physics2d_collider_pair_enabled(&ca, &cb) {
                        continue;
                    }
                    let sensor_pair = ca.sensor || cb.sensor;
                    if both_immovable && !sensor_pair {
                        continue;
                    }
                    let manifold = collide_contact_manifold2d(&ca.world, &cb.world, &mut scratch.manifold);
                    if !manifold && (!sensor_pair || !test_physics2d_area_less_sensor_overlap(&ca.world, &cb.world)) {
                        continue;
                    }
                    (
                        sensor_pair,
                        mix_physics2d_friction(ca.material.friction, cb.material.friction),
                        mix_physics2d_restitution(ca.material.restitution, cb.material.restitution),
                    )
                };
                merge_physics2d_contact(world, index_a, index_b, i, j, &scratch.manifold, sensor_pair, friction, restitution);
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

    world.contacts.sort_by(|left, right| {
        let (l, r) = (left.read().unwrap(), right.read().unwrap());
        return l
            .body_a
            .cmp(&r.body_a)
            .then(l.body_b.cmp(&r.body_b))
            .then(l.collider_a.cmp(&r.collider_a))
            .then(l.collider_b.cmp(&r.collider_b));
    });
}

fn effective_mass(pair: &mut Physics2DBodyPair<'_>, r_ax: f32, r_ay: f32, r_bx: f32, r_by: f32, axis_x: f32, axis_y: f32) -> f32 {
    let cross_a = r_ax * axis_y - r_ay * axis_x;
    let cross_b = r_bx * axis_y - r_by * axis_x;
    let (inv_mass_a, inv_inertia_a) = (pair.a().inverse_mass, pair.a().inverse_inertia);
    let (inv_mass_b, inv_inertia_b) = (pair.b().inverse_mass, pair.b().inverse_inertia);
    let total = inv_mass_a + inv_mass_b + inv_inertia_a * cross_a * cross_a + inv_inertia_b * cross_b * cross_b;
    return if total > 0.0 { 1.0 / total } else { 0.0 };
}

fn find_earliest_physics2d_impact(world: &Physics2DWorld, scratch: &mut Physics2DStepScratch, registry: &CollisionRegistry2D, dt: f32) -> bool {
    scratch.ccd_impact_fraction = f32::INFINITY;
    scratch.ccd_impact_body_a = -1;
    scratch.ccd_impact_body_b = -1;
    scratch.ccd_impact_collider_a = -1;
    scratch.ccd_impact_collider_b = -1;
    synchronize_physics2d_swept_broadphase(world, dt);
    scratch.ccd_pairs.clear();
    (world.index.query_spatial_pairs)(&mut scratch.ccd_pairs);
    synchronize_physics2d_broadphase(world);
    let pairs = scratch.ccd_pairs.clone();
    for pair in &pairs {
        let (Some(first), Some(second)) = (find_physics2d_body(world, pair.a), find_physics2d_body(world, pair.b)) else {
            continue;
        };
        let ordered = is_physics2d_pair_ordered(&first.read().unwrap(), &second.read().unwrap());
        let (body_a, body_b) = if ordered { (first, second) } else { (second, first) };
        let mut p = lock_physics2d_body_pair(&body_a, &body_b);
        if !is_physics2d_ccd_pair_active(&mut p) {
            continue;
        }
        let (index_a, index_b) = (p.a().index, p.b().index);
        if is_physics2d_pair_joint_suppressed(world, index_a, index_b) {
            continue;
        }
        let (tax, tay) = moving_translation(p.a(), dt);
        let (tbx, tby) = moving_translation(p.b(), dt);
        let (colliders_a, colliders_b) = (p.a().colliders.clone(), p.b().colliders.clone());
        for (collider_a, first) in colliders_a.iter().enumerate() {
            if first.read().unwrap().sensor {
                continue;
            }
            for (collider_b, second) in colliders_b.iter().enumerate() {
                {
                    let (f, s) = (first.read().unwrap(), second.read().unwrap());
                    if s.sensor || !is_physics2d_collider_pair_enabled(&f, &s) {
                        continue;
                    }
                }
                if find_physics2d_contact(world, index_a, index_b, collider_a, collider_b).is_some() {
                    continue;
                }
                let rotation_a = p.a().angular_velocity * dt;
                let rotation_b = p.b().angular_velocity * dt;
                if !find_physics2d_collider_impact(world, scratch, registry, &mut p, first, second, tax, tay, tbx, tby, dt)
                    || scratch.ccd_sweep.fraction > scratch.ccd_impact_fraction
                    || !is_physics2d_impact_approaching(&mut p, &scratch.ccd_sweep, tax, tay, tbx, tby, rotation_a, rotation_b)
                {
                    continue;
                }
                scratch.ccd_impact_fraction = scratch.ccd_sweep.fraction;
                scratch.ccd_impact_body_a = index_a;
                scratch.ccd_impact_body_b = index_b;
                scratch.ccd_impact_collider_a = collider_a as i32;
                scratch.ccd_impact_collider_b = collider_b as i32;
                scratch.ccd_impact_x = scratch.ccd_sweep.x;
                scratch.ccd_impact_y = scratch.ccd_sweep.y;
                scratch.ccd_impact_normal_x = scratch.ccd_sweep.normal_x;
                scratch.ccd_impact_normal_y = scratch.ccd_sweep.normal_y;
            }
        }
    }
    return scratch.ccd_impact_body_a >= 0;
}

fn find_physics2d_collider_impact(
    world: &Physics2DWorld,
    scratch: &mut Physics2DStepScratch,
    registry: &CollisionRegistry2D,
    p: &mut Physics2DBodyPair<'_>,
    collider_a: &Ref<Physics2DCollider>,
    collider_b: &Ref<Physics2DCollider>,
    tax: f32,
    tay: f32,
    tbx: f32,
    tby: f32,
    dt: f32,
) -> bool {
    let rotation_a = moving_rotation(p.a(), dt);
    let rotation_b = moving_rotation(p.b(), dt);
    if (rotation_a != 0.0 || rotation_b != 0.0) && world.config.max_ccd_rotation_substeps > 0 {
        return find_physics2d_rotational_impact(
            scratch,
            p,
            collider_a,
            collider_b,
            [tax, tay, tbx, tby],
            rotation_a,
            rotation_b,
            world.config.max_ccd_rotation_substeps,
        );
    }
    let (a, b) = (collider_a.read().unwrap(), collider_b.read().unwrap());
    return sweep_collision_shape2d(&mut scratch.ccd_sweep, registry, &a.world, tax, tay, &b.world, tbx, tby, None);
}

fn find_physics2d_contact(world: &Physics2DWorld, body_a: i32, body_b: i32, collider_a: usize, collider_b: usize) -> Option<Physics2DContactRef> {
    for contact in &world.contacts {
        let c = contact.read().unwrap();
        if c.body_a == body_a && c.body_b == body_b && c.collider_a == collider_a && c.collider_b == collider_b {
            return Some(contact.clone());
        }
    }
    return None;
}

fn find_physics2d_rotational_impact(
    scratch: &mut Physics2DStepScratch,
    p: &mut Physics2DBodyPair<'_>,
    collider_a: &Ref<Physics2DCollider>,
    collider_b: &Ref<Physics2DCollider>,
    translations: [f32; 4],
    rotation_a: f32,
    rotation_b: f32,
    max_substeps: i32,
) -> bool {
    let angular_travel = js_max(rotation_a.abs(), rotation_b.abs());
    let substeps = js_min(max_substeps as f32, js_max(1.0, (angular_travel / CCD_ROTATION_INCREMENT).ceil())) as i32;
    let mut lower_fraction = 0.0;
    for sample in 1..=substeps {
        let upper_fraction = sample as f32 / substeps as f32;
        if !test_physics2d_collider_overlap_at_fraction(scratch, p, collider_a, collider_b, translations, rotation_a, rotation_b, upper_fraction) {
            lower_fraction = upper_fraction;
            continue;
        }
        let mut upper = upper_fraction;
        let mut lower = lower_fraction;
        for _ in 0..CCD_ROTATION_BISECTION_ITERATIONS {
            let middle = (lower + upper) * 0.5;
            if test_physics2d_collider_overlap_at_fraction(scratch, p, collider_a, collider_b, translations, rotation_a, rotation_b, middle) {
                upper = middle;
            } else {
                lower = middle;
            }
        }
        test_physics2d_collider_overlap_at_fraction(scratch, p, collider_a, collider_b, translations, rotation_a, rotation_b, upper);
        let point = scratch.ccd_rotational_manifold.points[0];
        scratch.ccd_sweep.fraction = upper;
        scratch.ccd_sweep.x = point.x;
        scratch.ccd_sweep.y = point.y;
        scratch.ccd_sweep.normal_x = scratch.ccd_rotational_manifold.normal_x;
        scratch.ccd_sweep.normal_y = scratch.ccd_rotational_manifold.normal_y;
        return true;
    }
    return false;
}

fn has_active_physics2d_bullet(world: &Physics2DWorld) -> bool {
    for body in &world.bodies {
        let body = body.read().unwrap();
        if body.body_type == Physics2DBodyType::Dynamic && body.bullet && !body.sleeping {
            return true;
        }
    }
    return false;
}

fn has_sensor_collider(body: &RigidBody2D) -> bool {
    return body.colliders.iter().any(|collider| collider.read().unwrap().sensor);
}

fn integrate_physics2d_continuous(world: &mut Physics2DWorld, scratch: &mut Physics2DStepScratch, registry: &CollisionRegistry2D, dt: f32) {
    let mut remaining = dt;
    let mut substep = 0;
    while substep < world.config.max_ccd_substeps && remaining > 0.0 {
        if !find_earliest_physics2d_impact(world, scratch, registry, remaining) {
            break;
        }
        let advance = remaining * scratch.ccd_impact_fraction;
        advance_all_awake_physics2d_bodies(world, advance);
        remaining -= advance;
        synchronize_physics2d_broadphase(world);
        resolve_earliest_physics2d_impact(world, scratch);
        if scratch.ccd_impact_fraction >= 1.0 {
            return;
        }
        substep += 1;
    }
    if remaining > 0.0 {
        advance_all_awake_physics2d_bodies(world, remaining);
    }
}

fn is_physics2d_ccd_pair_active(p: &mut Physics2DBodyPair<'_>) -> bool {
    let is_bullet = |body: &RigidBody2D| body.body_type == Physics2DBodyType::Dynamic && body.bullet && !body.sleeping;
    let (bullet_a, inverse_a) = (is_bullet(p.a()), p.a().inverse_mass);
    let (bullet_b, inverse_b) = (is_bullet(p.b()), p.b().inverse_mass);
    if !bullet_a && !bullet_b {
        return false;
    }
    return inverse_a > 0.0 || inverse_b > 0.0;
}

fn is_physics2d_collider_pair_enabled(collider_a: &Physics2DCollider, collider_b: &Physics2DCollider) -> bool {
    let (filter_a, filter_b) = (&collider_a.filter, &collider_b.filter);
    if filter_a.group_index != 0 && filter_a.group_index == filter_b.group_index {
        return filter_a.group_index > 0;
    }
    return (filter_a.mask_bits & filter_b.category_bits) != 0 && (filter_b.mask_bits & filter_a.category_bits) != 0;
}

fn is_physics2d_impact_approaching(
    p: &mut Physics2DBodyPair<'_>,
    impact: &CollisionTimeOfImpact2D,
    tax: f32,
    tay: f32,
    tbx: f32,
    tby: f32,
    rotation_a: f32,
    rotation_b: f32,
) -> bool {
    let center_a = write_physics2d_body_center(p.a(), tax * impact.fraction, tay * impact.fraction, rotation_a * impact.fraction);
    let center_b = write_physics2d_body_center(p.b(), tbx * impact.fraction, tby * impact.fraction, rotation_b * impact.fraction);
    let r_ax = impact.x - center_a.0;
    let r_ay = impact.y - center_a.1;
    let r_bx = impact.x - center_b.0;
    let r_by = impact.y - center_b.1;
    return pair_relative_axis_velocity(p, r_ax, r_ay, r_bx, r_by, impact.normal_x, impact.normal_y) < -1e-9;
}

fn merge_physics2d_contact(
    world: &mut Physics2DWorld,
    body_a: i32,
    body_b: i32,
    collider_a: usize,
    collider_b: usize,
    manifold: &CollisionContactManifold2D,
    sensor: bool,
    friction: f32,
    restitution: f32,
) -> Physics2DContactRef {
    let existing = find_physics2d_contact(world, body_a, body_b, collider_a, collider_b);
    let contact = match existing {
        Some(contact) => contact,
        None => {
            let contact = Ref::new(std::sync::RwLock::new(Physics2DContact {
                body_a,
                body_b,
                collider_a,
                collider_b,
                normal_x: 0.0,
                normal_y: 0.0,
                point_count: 0,
                points: vec![create_physics2d_contact_point(), create_physics2d_contact_point()],
                friction,
                restitution,
                enabled: true,
                sensor,
                touching: true,
            }));
            world.contacts.push(contact.clone());
            world.events.began.push(contact.clone());
            contact
        }
    };
    {
        let mut c = contact.write().unwrap();
        c.normal_x = manifold.normal_x;
        c.normal_y = manifold.normal_y;
        c.friction = friction;
        c.restitution = restitution;
        c.enabled = true;
        c.sensor = sensor;
        c.touching = true;

        let old_point_count = c.point_count;
        let old = [c.points[0], c.points[1]];
        let old_feature0 = if old_point_count > 0 { old[0].feature_id } else { -1 };
        let old_feature1 = if old_point_count > 1 { old[1].feature_id } else { -1 };
        for i in 0..manifold.point_count {
            let source = manifold.points[i];
            let (mut normal_impulse, mut tangent_impulse) = (0.0, 0.0);
            if old_point_count > 0 && old_feature0 == source.feature_id {
                normal_impulse = old[0].normal_impulse;
                tangent_impulse = old[0].tangent_impulse;
            } else if old_point_count > 1 && old_feature1 == source.feature_id {
                normal_impulse = old[1].normal_impulse;
                tangent_impulse = old[1].tangent_impulse;
            }
            let target = &mut c.points[i];
            target.x = source.x;
            target.y = source.y;
            target.depth = source.depth;
            target.feature_id = source.feature_id;
            target.normal_impulse = normal_impulse;
            target.tangent_impulse = tangent_impulse;
        }
        c.point_count = manifold.point_count;
    }
    return contact;
}

fn moving_rotation(body: &RigidBody2D, dt: f32) -> f32 {
    if body.body_type == Physics2DBodyType::Static || body.sleeping {
        return 0.0;
    }
    return body.angular_velocity * dt;
}

fn moving_translation(body: &RigidBody2D, dt: f32) -> (f32, f32) {
    if body.body_type == Physics2DBodyType::Static || body.sleeping {
        return (0.0, 0.0);
    }
    return (body.velocity_x * dt, body.velocity_y * dt);
}

fn prepare_physics2d_constraints(world: &Physics2DWorld, indices: &[usize], start: usize, count: usize) {
    let config = world.config;
    for contact_at in start..start + count {
        let Some(contact) = world.contacts.get(indices[contact_at]) else {
            continue;
        };
        let mut contact = contact.write().unwrap();
        if !contact.enabled || contact.sensor {
            continue;
        }
        let (Some(body_a), Some(body_b)) = (find_physics2d_body(world, contact.body_a), find_physics2d_body(world, contact.body_b)) else {
            continue;
        };
        let mut p = lock_physics2d_body_pair(&body_a, &body_b);
        let center_a = body_center(p.a());
        let center_b = body_center(p.b());
        let normal_x = contact.normal_x;
        let normal_y = contact.normal_y;
        let tangent_x = -normal_y;
        let tangent_y = normal_x;
        let restitution = contact.restitution;
        for i in 0..contact.point_count {
            let point = &mut contact.points[i];
            point.r_ax = point.x - center_a.0;
            point.r_ay = point.y - center_a.1;
            point.r_bx = point.x - center_b.0;
            point.r_by = point.y - center_b.1;
            point.normal_mass = effective_mass(&mut p, point.r_ax, point.r_ay, point.r_bx, point.r_by, normal_x, normal_y);
            point.tangent_mass = effective_mass(&mut p, point.r_ax, point.r_ay, point.r_bx, point.r_by, tangent_x, tangent_y);
            let approach = pair_relative_axis_velocity(&mut p, point.r_ax, point.r_ay, point.r_bx, point.r_by, normal_x, normal_y);
            point.bias = if approach < -config.restitution_threshold { restitution * approach } else { 0.0 };
        }
    }
}

fn record_physics2d_broken_joints(world: &mut Physics2DWorld, dt: f32) {
    let mut reaction = create_physics2d_joint_reaction();
    for joint in world.joints.clone() {
        let guard = joint.read().unwrap();
        let fields = guard.joint_fields();
        if fields.break_force == f32::INFINITY && fields.break_torque == f32::INFINITY {
            continue;
        }
        if !write_physics2d_joint_reaction(&mut reaction, world, &*guard, dt) {
            continue;
        }
        let (force_x, force_y, torque) = (reaction.force_x, reaction.force_y, reaction.torque);
        if force_x * force_x + force_y * force_y <= fields.break_force * fields.break_force && torque.abs() <= fields.break_torque {
            continue;
        }
        drop(guard);
        world.joint_events.broke.push(Physics2DBrokenJoint {
            force_x,
            force_y,
            joint: joint.clone(),
            torque,
        });
    }
}

fn resolve_earliest_physics2d_impact(world: &mut Physics2DWorld, scratch: &mut Physics2DStepScratch) {
    let (Some(body_a), Some(body_b)) = (
        find_physics2d_body(world, scratch.ccd_impact_body_a),
        find_physics2d_body(world, scratch.ccd_impact_body_b),
    ) else {
        return;
    };
    let colliders = {
        let (a, b) = (body_a.read().unwrap(), body_b.read().unwrap());
        (
            a.colliders.get(scratch.ccd_impact_collider_a as usize).cloned(),
            b.colliders.get(scratch.ccd_impact_collider_b as usize).cloned(),
        )
    };
    let (Some(collider_a), Some(collider_b)) = colliders else {
        return;
    };
    let (friction, restitution) = {
        let (a, b) = (collider_a.read().unwrap(), collider_b.read().unwrap());
        (
            mix_physics2d_friction(a.material.friction, b.material.friction),
            mix_physics2d_restitution(a.material.restitution, b.material.restitution),
        )
    };
    let (index_a, index_b) = (body_a.read().unwrap().index, body_b.read().unwrap().index);
    let contact = create_physics2d_impact_contact(world, scratch, index_a, index_b, friction, restitution);
    let mut contact = contact.write().unwrap();
    if !contact.enabled || contact.sensor {
        return;
    }
    let mut p = lock_physics2d_body_pair(&body_a, &body_b);
    if p.a().body_type != Physics2DBodyType::Static {
        p.a().sleeping = false;
        p.a().sleep_timer = 0.0;
    }
    if p.b().body_type != Physics2DBodyType::Static {
        p.b().sleeping = false;
        p.b().sleep_timer = 0.0;
    }
    let center_a = write_physics2d_body_center(p.a(), 0.0, 0.0, 0.0);
    let center_b = write_physics2d_body_center(p.b(), 0.0, 0.0, 0.0);
    scratch.ccd_center_a = center_a;
    scratch.ccd_center_b = center_b;
    let r_ax = scratch.ccd_impact_x - center_a.0;
    let r_ay = scratch.ccd_impact_y - center_a.1;
    let r_bx = scratch.ccd_impact_x - center_b.0;
    let r_by = scratch.ccd_impact_y - center_b.1;
    let (normal_x, normal_y) = (scratch.ccd_impact_normal_x, scratch.ccd_impact_normal_y);
    let normal_mass = effective_mass(&mut p, r_ax, r_ay, r_bx, r_by, normal_x, normal_y);
    if !(normal_mass > 0.0) {
        return;
    }
    let approach = pair_relative_axis_velocity(&mut p, r_ax, r_ay, r_bx, r_by, normal_x, normal_y);
    if approach >= 0.0 {
        return;
    }
    let restitution = if approach < -world.config.restitution_threshold { contact.restitution } else { 0.0 };
    let normal_impulse = -(1.0 + restitution) * approach * normal_mass;
    apply_physics2d_pair_impulse(&mut p, r_ax, r_ay, r_bx, r_by, normal_impulse * normal_x, normal_impulse * normal_y);
    contact.points[0].normal_impulse = normal_impulse;

    let tangent_x = -normal_y;
    let tangent_y = normal_x;
    let tangent_mass = effective_mass(&mut p, r_ax, r_ay, r_bx, r_by, tangent_x, tangent_y);
    if !(tangent_mass > 0.0) {
        return;
    }
    let tangent_velocity = pair_relative_axis_velocity(&mut p, r_ax, r_ay, r_bx, r_by, tangent_x, tangent_y);
    let friction = contact.friction;
    let tangent_impulse = js_max(-friction * normal_impulse, js_min(friction * normal_impulse, -tangent_velocity * tangent_mass));
    apply_physics2d_pair_impulse(&mut p, r_ax, r_ay, r_bx, r_by, tangent_impulse * tangent_x, tangent_impulse * tangent_y);
    contact.points[0].tangent_impulse = tangent_impulse;
}

fn restore_physics2d_contact_hook_fields(contact: &mut Physics2DContact, saved: (f32, f32, bool, bool)) {
    contact.friction = saved.0;
    contact.restitution = saved.1;
    contact.enabled = saved.2;
    contact.sensor = saved.3;
}

// Runs one contact hook, restoring the hook-mutable fields and rethrowing when it throws, and
// restoring them then throwing `invalid` when it leaves the contact invalid.
fn run_physics2d_contact_hook(world: &Physics2DWorld, contact: &Physics2DContactRef, hook: &Physics2DContactCallback, invalid: &str) {
    let mut guard = contact.write().unwrap();
    let saved = (guard.friction, guard.restitution, guard.enabled, guard.sensor);
    let result = catch_unwind(AssertUnwindSafe(|| hook(world, &mut guard)));
    if let Err(payload) = result {
        restore_physics2d_contact_hook_fields(&mut guard, saved);
        drop(guard);
        resume_unwind(payload);
    }
    if !is_physics2d_contact_valid(&guard) {
        restore_physics2d_contact_hook_fields(&mut guard, saved);
        drop(guard);
        throw_error(invalid);
    }
}

fn scale_physics2d_warm_start_caches(world: &Physics2DWorld, dt: f32) {
    let previous = world.previous_timestep;
    if !(previous > 0.0) || previous == dt {
        return;
    }
    let divided = dt / previous;
    let timestep_ratio = if divided.is_finite() { divided } else { 0.0 };
    for contact in &world.contacts {
        let mut contact = contact.write().unwrap();
        for i in 0..contact.point_count {
            contact.points[i].normal_impulse *= timestep_ratio;
            contact.points[i].tangent_impulse *= timestep_ratio;
        }
    }
    for joint in &world.joints {
        let mut guard = joint.write().unwrap();
        let kind = {
            let fields = guard.joint_fields_mut();
            fields.impulse0 *= timestep_ratio;
            fields.impulse1 *= timestep_ratio;
            fields.impulse2 *= timestep_ratio;
            fields.kind.clone()
        };
        if let Some(scale) = world.joint_solvers.get(&kind).and_then(|solver| solver.scale_accumulated_impulses.clone()) {
            scale(&mut *guard, timestep_ratio);
        }
    }
}

/// Installs the diagnostics seam consulted once per running step before contacts are built (TS
/// `setPhysics2DContactIntakeGuard`).
// flight-lint: allow(conform-params) D5: the guard slot lives in the caller-owned guard state instead of a module variable
pub fn set_physics2d_contact_intake_guard(guards: &mut Physics2DGuardState, guard: Option<Physics2DContactIntakeGuard>) {
    guards.contact_intake_guard = guard;
}

/// Installs the diagnostics seam consulted once per running step before joints are prepared (TS
/// `setPhysics2DJointResolutionGuard`).
// flight-lint: allow(conform-params) D5: the guard slot lives in the caller-owned guard state instead of a module variable
pub fn set_physics2d_joint_resolution_guard(guards: &mut Physics2DGuardState, guard: Option<Physics2DJointResolutionGuard>) {
    guards.joint_resolution_guard = guard;
}

/// Installs the diagnostics seam consulted when a step declines its preconditions (TS
/// `setPhysics2DStepGuard`).
// flight-lint: allow(conform-params) D5: the guard slot lives in the caller-owned guard state instead of a module variable
pub fn set_physics2d_step_guard(guards: &mut Physics2DGuardState, guard: Option<Physics2DStepGuard>) {
    guards.step_guard = guard;
}

fn solve_physics2d_positions_once(world: &Physics2DWorld, scratch: &mut Physics2DStepScratch, indices: &[usize], start: usize, count: usize) {
    let config = world.config;
    for contact_at in start..start + count {
        let Some(contact) = world.contacts.get(indices[contact_at]) else {
            continue;
        };
        let (enabled, body_a, body_b, collider_a, collider_b) = {
            let c = contact.read().unwrap();
            (c.enabled && !c.sensor, c.body_a, c.body_b, c.collider_a, c.collider_b)
        };
        if !enabled {
            continue;
        }
        let (Some(body_a), Some(body_b)) = (find_physics2d_body(world, body_a), find_physics2d_body(world, body_b)) else {
            continue;
        };
        let mut p = lock_physics2d_body_pair(&body_a, &body_b);
        if !is_pair_awake(&mut p) {
            continue;
        }
        let (Some(collider_a), Some(collider_b)) = (p.a().colliders.get(collider_a).cloned(), p.b().colliders.get(collider_b).cloned()) else {
            continue;
        };
        update_physics2d_collider_world_shape(&mut collider_a.write().unwrap(), p.a());
        update_physics2d_collider_world_shape(&mut collider_b.write().unwrap(), p.b());
        {
            let (a, b) = (collider_a.read().unwrap(), collider_b.read().unwrap());
            if !collide_contact_manifold2d(&a.world, &b.world, &mut scratch.manifold) {
                continue;
            }
        }
        let normal_x = scratch.manifold.normal_x;
        let normal_y = scratch.manifold.normal_y;
        for i in 0..scratch.manifold.point_count {
            let point = scratch.manifold.points[i];
            let excess = point.depth - config.penetration_slop;
            if excess <= 0.0 {
                continue;
            }
            let center_a = body_center(p.a());
            let center_b = body_center(p.b());
            let r_ax = point.x - center_a.0;
            let r_ay = point.y - center_a.1;
            let r_bx = point.x - center_b.0;
            let r_by = point.y - center_b.1;
            let mass = effective_mass(&mut p, r_ax, r_ay, r_bx, r_by, normal_x, normal_y);
            let impulse = config.position_correction * excess * mass;
            let impulse_x = impulse * normal_x;
            let impulse_y = impulse * normal_y;
            {
                let a = p.a();
                let (inverse_mass, inverse_inertia) = (a.inverse_mass, a.inverse_inertia);
                advance_physics2d_body_transform(
                    a,
                    impulse_x * inverse_mass,
                    impulse_y * inverse_mass,
                    inverse_inertia * (r_ax * impulse_y - r_ay * impulse_x),
                );
            }
            {
                let b = p.b();
                let (inverse_mass, inverse_inertia) = (b.inverse_mass, b.inverse_inertia);
                advance_physics2d_body_transform(
                    b,
                    -impulse_x * inverse_mass,
                    -impulse_y * inverse_mass,
                    -inverse_inertia * (r_bx * impulse_y - r_by * impulse_x),
                );
            }
        }
    }
}

/// Advances the simulation by `dt` seconds (TS `stepPhysics2D`). Panics on a recursive step. Joints
/// that broke are removed after the stepping boundary is released, so a post-solve hook still sees
/// them.
// flight-lint: allow(conform-params) D5: the collision registry and the diagnostics guards are explicit caller-owned state
pub fn step_physics2d(
    world: &mut Physics2DWorld,
    dt: f32,
    registry: &CollisionRegistry2D,
    guards: Option<&Physics2DGuardState>,
) {
    if is_physics2d_world_stepping(world) {
        throw_error("Cannot step a physics world recursively");
    }
    set_physics2d_world_stepping(world, true);
    let result = catch_unwind(AssertUnwindSafe(|| step_physics2d_once(world, dt, registry, guards)));
    set_physics2d_world_stepping(world, false);
    if let Err(payload) = result {
        resume_unwind(payload);
    }
    for broken in world.joint_events.broke.clone() {
        remove_physics2d_joint(world, &broken.joint);
    }
}

fn step_physics2d_once(world: &mut Physics2DWorld, dt: f32, registry: &CollisionRegistry2D, guards: Option<&Physics2DGuardState>) {
    let config = world.config;
    if !is_physics2d_timestep_valid(dt)
        || config.velocity_iterations < 0
        || config.position_iterations < 0
        || !is_physics2d_solver_config_valid(&config)
        || !is_physics2d_gravity_valid(world)
        || !is_physics2d_previous_timestep_valid(world)
        || !is_physics2d_body_state_valid(world)
        || !is_physics2d_contact_state_valid(world)
        || !is_physics2d_joint_state_valid(world)
    {
        if let Some(guard) = guards.and_then(|guards| guards.step_guard.clone()) {
            guard(world, dt);
        }
        return;
    }

    world.joint_events.broke.clear();
    if let Some(guard) = guards.and_then(|guards| guards.contact_intake_guard.clone()) {
        guard(world);
    }
    if !world.joints.is_empty()
        && let Some(guard) = guards.and_then(|guards| guards.joint_resolution_guard.clone())
    {
        guard(world);
    }

    let mut scratch = Physics2DStepScratch {
        ccd_center_a: (0.0, 0.0),
        ccd_center_b: (0.0, 0.0),
        ccd_impact_body_a: -1,
        ccd_impact_body_b: -1,
        ccd_impact_collider_a: -1,
        ccd_impact_collider_b: -1,
        ccd_impact_fraction: 0.0,
        ccd_impact_normal_x: 0.0,
        ccd_impact_normal_y: 0.0,
        ccd_impact_x: 0.0,
        ccd_impact_y: 0.0,
        ccd_pairs: Vec::new(),
        ccd_rotational_manifold: create_collision_contact_manifold2d(),
        ccd_sweep: create_collision_time_of_impact2d(),
        manifold: create_collision_contact_manifold2d(),
        pairs: Vec::new(),
    };

    synchronize_physics2d_broadphase(world);
    build_physics2d_contacts(world, &mut scratch);

    if let Some(pre_solve) = world.contact_hooks.pre_solve.clone() {
        for contact in world.contacts.clone() {
            if contact.read().unwrap().sensor {
                continue;
            }
            run_physics2d_contact_hook(world, &contact, &pre_solve, "Physics2D pre-solve hook produced invalid contact state");
            let mut c = contact.write().unwrap();
            if !c.enabled || c.sensor {
                for i in 0..c.point_count {
                    c.points[i].normal_impulse = 0.0;
                    c.points[i].tangent_impulse = 0.0;
                }
            }
        }
    }
    scale_physics2d_warm_start_caches(world, dt);

    update_physics2d_sleep(world, dt);
    build_physics2d_solve_islands(world);

    for island in 0..world.solve_island_roots.len() {
        let start = world.solve_island_body_starts[island];
        let end = start + world.solve_island_body_counts[island];
        for at in start..end {
            let mut body = world.bodies[world.solve_island_body_indices[at]].write().unwrap();
            if body.body_type != Physics2DBodyType::Dynamic {
                continue;
            }
            body.velocity_x += (body.force_x * body.inverse_mass + world.gravity_x * body.gravity_scale) * dt;
            body.velocity_y += (body.force_y * body.inverse_mass + world.gravity_y * body.gravity_scale) * dt;
            if body.fixed_rotation {
                body.angular_velocity = 0.0;
            } else {
                body.angular_velocity += body.torque * body.inverse_inertia * dt;
            }
            body.velocity_x /= 1.0 + body.linear_damping * dt;
            body.velocity_y /= 1.0 + body.linear_damping * dt;
            if !body.fixed_rotation {
                body.angular_velocity /= 1.0 + body.angular_damping * dt;
            }
        }
    }

    let contact_indices = world.solve_island_contact_indices.clone();
    let joint_indices = world.solve_island_joint_indices.clone();
    for island in 0..world.solve_island_roots.len() {
        prepare_physics2d_constraints(
            world,
            &contact_indices,
            world.solve_island_contact_starts[island],
            world.solve_island_contact_counts[island],
        );
        let joint_start = world.solve_island_joint_starts[island];
        let joint_end = joint_start + world.solve_island_joint_counts[island];
        for at in joint_start..joint_end {
            with_island_joint(world, joint_indices[at], |world, solver, joint| (solver.prepare)(world, joint, dt));
        }
    }
    if config.warm_starting {
        for island in 0..world.solve_island_roots.len() {
            warm_start_physics2d_contact_indices(
                world,
                &contact_indices,
                world.solve_island_contact_starts[island],
                world.solve_island_contact_counts[island],
            );
        }
    } else {
        for contact in &world.contacts {
            let mut c = contact.write().unwrap();
            for i in 0..c.point_count {
                c.points[i].normal_impulse = 0.0;
                c.points[i].tangent_impulse = 0.0;
            }
        }
    }
    for island in 0..world.solve_island_roots.len() {
        let start = world.solve_island_joint_starts[island];
        let end = start + world.solve_island_joint_counts[island];
        for at in start..end {
            with_island_joint(world, joint_indices[at], |world, solver, joint| {
                match (config.warm_starting, solver.warm_start.clone()) {
                    (true, Some(warm_start)) => warm_start(world, joint),
                    _ => {
                        if let Some(clear) = solver.clear_accumulated_impulses.clone() {
                            clear(joint);
                        }
                    }
                }
            });
        }
    }
    for island in 0..world.solve_island_roots.len() {
        let joint_start = world.solve_island_joint_starts[island];
        let joint_end = joint_start + world.solve_island_joint_counts[island];
        let contact_start = world.solve_island_contact_starts[island];
        let contact_count = world.solve_island_contact_counts[island];
        for _ in 0..config.velocity_iterations {
            for at in joint_start..joint_end {
                with_island_joint(world, joint_indices[at], |world, solver, joint| (solver.solve)(world, joint));
            }
            solve_physics2d_contact_indices_once(world, &contact_indices, contact_start, contact_count);
        }
    }

    if config.continuous_collision && config.max_ccd_substeps > 0 && has_active_physics2d_bullet(world) {
        integrate_physics2d_continuous(world, &mut scratch, registry, dt);
    } else {
        advance_physics2d_solve_island_bodies(world, dt);
    }

    let contact_indices = world.solve_island_contact_indices.clone();
    for island in 0..world.solve_island_roots.len() {
        let contact_start = world.solve_island_contact_starts[island];
        let contact_count = world.solve_island_contact_counts[island];
        for _ in 0..config.position_iterations {
            solve_physics2d_positions_once(world, &mut scratch, &contact_indices, contact_start, contact_count);
        }
    }

    for body in &world.bodies {
        let mut body = body.write().unwrap();
        body.force_x = 0.0;
        body.force_y = 0.0;
        body.torque = 0.0;
    }
    world.previous_timestep = dt;

    if let Some(post_solve) = world.contact_hooks.post_solve.clone() {
        for contact in world.contacts.clone() {
            let (live, body_a, body_b) = {
                let c = contact.read().unwrap();
                (c.enabled && !c.sensor, c.body_a, c.body_b)
            };
            if !live {
                continue;
            }
            let (Some(a), Some(b)) = (find_physics2d_body(world, body_a), find_physics2d_body(world, body_b)) else {
                continue;
            };
            if !is_pair_awake(&mut lock_physics2d_body_pair(&a, &b)) {
                continue;
            }
            run_physics2d_contact_hook(world, &contact, &post_solve, "Physics2D post-solve hook produced invalid contact state");
        }
    }

    record_physics2d_broken_joints(world, dt);
}

fn test_physics2d_area_less_sensor_overlap(a: &CollisionShape2D, b: &CollisionShape2D) -> bool {
    if let CollisionShape2D::Point(point) = a {
        return get_collision_shape_contains_point2d(b, point.x, point.y);
    }
    if let CollisionShape2D::Point(point) = b {
        return get_collision_shape_contains_point2d(a, point.x, point.y);
    }
    if let CollisionShape2D::Segment(segment) = a {
        return test_physics2d_segment_overlap(segment, b);
    }
    if let CollisionShape2D::Segment(segment) = b {
        return test_physics2d_segment_overlap(segment, a);
    }
    return false;
}

fn test_physics2d_collider_overlap_at_fraction(
    scratch: &mut Physics2DStepScratch,
    p: &mut Physics2DBodyPair<'_>,
    collider_a: &Ref<Physics2DCollider>,
    collider_b: &Ref<Physics2DCollider>,
    translations: [f32; 4],
    rotation_a: f32,
    rotation_b: f32,
    fraction: f32,
) -> bool {
    let saved_a = (p.a().x, p.a().y, p.a().angle);
    let saved_b = (p.b().x, p.b().y, p.b().angle);
    {
        let a = p.a();
        a.x = saved_a.0 + translations[0] * fraction;
        a.y = saved_a.1 + translations[1] * fraction;
        a.angle = saved_a.2 + rotation_a * fraction;
    }
    {
        let b = p.b();
        b.x = saved_b.0 + translations[2] * fraction;
        b.y = saved_b.1 + translations[3] * fraction;
        b.angle = saved_b.2 + rotation_b * fraction;
    }
    update_physics2d_collider_world_shape(&mut collider_a.write().unwrap(), p.a());
    update_physics2d_collider_world_shape(&mut collider_b.write().unwrap(), p.b());
    let overlapping = {
        let (a, b) = (collider_a.read().unwrap(), collider_b.read().unwrap());
        collide_contact_manifold2d(&a.world, &b.world, &mut scratch.ccd_rotational_manifold)
    };
    {
        let a = p.a();
        a.x = saved_a.0;
        a.y = saved_a.1;
        a.angle = saved_a.2;
    }
    {
        let b = p.b();
        b.x = saved_b.0;
        b.y = saved_b.1;
        b.angle = saved_b.2;
    }
    update_physics2d_collider_world_shape(&mut collider_a.write().unwrap(), p.a());
    update_physics2d_collider_world_shape(&mut collider_b.write().unwrap(), p.b());
    return overlapping;
}

fn test_physics2d_segment_overlap(segment: &flight_collision::CollisionSegment2D, other: &CollisionShape2D) -> bool {
    return match other {
        CollisionShape2D::Aabb(other) => test_segment_aabb_collision2d(segment, other),
        CollisionShape2D::Circle(other) => test_segment_circle_collision2d(segment, other),
        CollisionShape2D::Capsule(other) => test_segment_capsule_collision2d(segment, other),
        CollisionShape2D::Obb(other) => test_segment_obb_collision2d(segment, other),
        CollisionShape2D::Polygon(other) => test_segment_polygon_collision2d(segment, other),
        CollisionShape2D::Segment(other) => test_segment_segment_collision2d(segment, other),
        CollisionShape2D::Point(other) => {
            get_collision_shape_contains_point2d(&CollisionShape2D::Segment(*segment), other.x, other.y)
        }
    };
}

// Runs `action` on the indexed joint with its registered solver, holding the joint's lock.
fn with_island_joint(
    world: &Physics2DWorld,
    joint_index: usize,
    action: impl FnOnce(&Physics2DWorld, &Physics2DJointSolver, &mut dyn Physics2DJoint),
) {
    let joint = world.joints[joint_index].clone();
    let mut guard = joint.write().unwrap();
    let kind = guard.joint_fields().kind.clone();
    let Some(solver) = world.joint_solvers.get(&kind).cloned() else {
        return;
    };
    action(world, &solver, &mut *guard);
}

fn write_physics2d_body_center(body: &RigidBody2D, translation_x: f32, translation_y: f32, rotation: f32) -> (f32, f32) {
    let cos = (body.angle + rotation).cos();
    let sin = (body.angle + rotation).sin();
    return (
        body.x + translation_x + body.center_x * cos - body.center_y * sin,
        body.y + translation_y + body.center_x * sin + body.center_y * cos,
    );
}
