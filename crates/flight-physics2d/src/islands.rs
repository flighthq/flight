//! Island sleeping and the per-island solve lists (TS `islands.ts`).

use std::collections::HashMap;

use crate::material::js_min;
use crate::ownership::assert_physics2d_body_not_stepping;
use crate::types::*;
use crate::world::find_physics2d_body;

/// Rebuilds the deterministic contiguous solve lists of the awake islands (TS
/// `buildPhysics2DSolveIslands`): roots in body order, and bodies, contacts and joints in their
/// world order inside each root.
pub fn build_physics2d_solve_islands(world: &mut Physics2DWorld) {
    world.solve_island_roots.clear();
    world.solve_island_by_root.clear();
    world.solve_island_body_counts.clear();
    world.solve_island_contact_counts.clear();
    world.solve_island_joint_counts.clear();

    for body in world.bodies.clone() {
        let body = body.read().unwrap();
        if body.body_type == Physics2DBodyType::Static || body.sleeping {
            continue;
        }
        let root = island_root_of(&mut world.island_parents, body.index);
        let island = match world.solve_island_by_root.get(&root) {
            Some(island) => *island,
            None => {
                let island = world.solve_island_roots.len();
                world.solve_island_roots.push(root);
                world.solve_island_by_root.insert(root, island);
                world.solve_island_body_counts.push(0);
                world.solve_island_contact_counts.push(0);
                world.solve_island_joint_counts.push(0);
                island
            }
        };
        world.solve_island_body_counts[island] += 1;
    }

    for contact in world.contacts.clone() {
        let (body_a, body_b, live) = contact_ends(&contact);
        if !live {
            continue;
        }
        if let Some(island) = solve_island_for_pair(world, body_a, body_b) {
            world.solve_island_contact_counts[island] += 1;
        }
    }
    for joint in world.joints.clone() {
        if let Some(island) = solve_island_for_joint(world, &joint) {
            world.solve_island_joint_counts[island] += 1;
        }
    }

    prepare_island_slices(&mut world.solve_island_body_starts, &world.solve_island_body_counts, &mut world.solve_island_cursors);
    prepare_island_slices(
        &mut world.solve_island_contact_starts,
        &world.solve_island_contact_counts,
        &mut world.solve_island_cursors,
    );
    prepare_island_slices(&mut world.solve_island_joint_starts, &world.solve_island_joint_counts, &mut world.solve_island_cursors);

    let body_items = island_item_count(&world.solve_island_body_starts, &world.solve_island_body_counts);
    let contact_items = island_item_count(&world.solve_island_contact_starts, &world.solve_island_contact_counts);
    let joint_items = island_item_count(&world.solve_island_joint_starts, &world.solve_island_joint_counts);
    world.solve_island_body_indices.resize(body_items, 0);
    world.solve_island_contact_indices.resize(contact_items, 0);
    world.solve_island_joint_indices.resize(joint_items, 0);

    copy_island_starts(&mut world.solve_island_cursors, &world.solve_island_body_starts);
    for i in 0..world.bodies.len() {
        let index = {
            let body = world.bodies[i].read().unwrap();
            if body.body_type == Physics2DBodyType::Static || body.sleeping {
                continue;
            }
            body.index
        };
        let root = island_root_of(&mut world.island_parents, index);
        if let Some(island) = world.solve_island_by_root.get(&root).copied() {
            let at = world.solve_island_cursors[island];
            world.solve_island_body_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }

    copy_island_starts(&mut world.solve_island_cursors, &world.solve_island_contact_starts);
    for i in 0..world.contacts.len() {
        let (body_a, body_b, live) = contact_ends(&world.contacts[i]);
        if !live {
            continue;
        }
        if let Some(island) = solve_island_for_pair(world, body_a, body_b) {
            let at = world.solve_island_cursors[island];
            world.solve_island_contact_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }

    copy_island_starts(&mut world.solve_island_cursors, &world.solve_island_joint_starts);
    for i in 0..world.joints.len() {
        let joint = world.joints[i].clone();
        if let Some(island) = solve_island_for_joint(world, &joint) {
            let at = world.solve_island_cursors[island];
            world.solve_island_joint_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }
}

/// Whether a constraint between these two bodies has anything to solve: at least one end can move
/// this step (TS `isRigidBody2DPairAwake`).
pub fn is_rigid_body2d_pair_awake(a: &RigidBody2D, b: &RigidBody2D) -> bool {
    return is_body_live(a) || is_body_live(b);
}

/// Advances every body's sleep state for one step, deciding sleep per island (TS
/// `updatePhysics2DSleep`).
pub fn update_physics2d_sleep(world: &mut Physics2DWorld, dt: f32) {
    let config = world.config;
    world.island_parents.clear();
    world.island_sleep_timers.clear();

    for contact in world.contacts.clone() {
        let (body_a, body_b, live) = contact_ends(&contact);
        if !live {
            continue;
        }
        union_dynamic_pair(world, body_a, body_b);
    }
    for joint in world.joints.clone() {
        let (kind, body_a, body_b) = joint_ends(&joint);
        let Some(solver) = world.joint_solvers.get(&kind) else {
            continue;
        };
        if solver.uses_body_a == Some(false) {
            continue;
        }
        union_dynamic_pair(world, body_a, body_b);
    }

    if !config.allow_sleeping {
        for body in &world.bodies {
            let mut body = body.write().unwrap();
            body.sleeping = false;
            body.sleep_timer = 0.0;
        }
        return;
    }

    for body in &world.bodies {
        let mut body = body.write().unwrap();
        if body.body_type == Physics2DBodyType::Static {
            continue;
        }
        if !body.sleep_enabled {
            body.sleeping = false;
            body.sleep_timer = 0.0;
            continue;
        }
        if is_body_still(&body, config.sleep_linear_threshold, config.sleep_angular_threshold) {
            body.sleep_timer += dt;
        } else {
            body.sleep_timer = 0.0;
        }
    }

    for joint in world.joints.clone() {
        let (kind, body_a, body_b) = joint_ends(&joint);
        let Some(solver) = world.joint_solvers.get(&kind).cloned() else {
            continue;
        };
        if solver.keeps_bodies_awake != Some(true) {
            continue;
        }
        if solver.uses_body_a != Some(false) {
            keep_physics2d_body_awake(world, body_a);
        }
        keep_physics2d_body_awake(world, body_b);
    }

    for body in world.bodies.clone() {
        let (index, timer) = {
            let body = body.read().unwrap();
            if body.body_type == Physics2DBodyType::Static {
                continue;
            }
            (body.index, body.sleep_timer)
        };
        let root = island_root_of(&mut world.island_parents, index);
        let next = match world.island_sleep_timers.get(&root) {
            None => timer,
            Some(current) => js_min(*current, timer),
        };
        world.island_sleep_timers.insert(root, next);
    }

    for body in world.bodies.clone() {
        let index = {
            let body = body.read().unwrap();
            if body.body_type == Physics2DBodyType::Static {
                continue;
            }
            body.index
        };
        let root = island_root_of(&mut world.island_parents, index);
        let mut body = body.write().unwrap();
        let island_timer = world.island_sleep_timers.get(&root).copied().unwrap_or(body.sleep_timer);
        let should_sleep = body.sleep_enabled && island_timer >= config.time_to_sleep;
        if !should_sleep && body.sleeping {
            body.sleep_timer = 0.0;
        }
        body.sleeping = should_sleep;
        if should_sleep {
            body.velocity_x = 0.0;
            body.velocity_y = 0.0;
            body.angular_velocity = 0.0;
        }
    }
}

/// Wakes `body` and clears its stillness timer (TS `wakePhysics2DBody`).
pub fn wake_physics2d_body(body: &mut RigidBody2D) {
    assert_physics2d_body_not_stepping(body);
    body.sleeping = false;
    body.sleep_timer = 0.0;
}

fn contact_ends(contact: &Physics2DContactRef) -> (i32, i32, bool) {
    let contact = contact.read().unwrap();
    return (contact.body_a, contact.body_b, contact.enabled && !contact.sensor);
}

fn copy_island_starts(cursors: &mut Vec<usize>, starts: &[usize]) {
    cursors.clear();
    cursors.extend_from_slice(starts);
}

fn is_body_live(body: &RigidBody2D) -> bool {
    return body.body_type != Physics2DBodyType::Static && !body.sleeping;
}

fn is_body_still(body: &RigidBody2D, linear_threshold: f32, angular_threshold: f32) -> bool {
    if body.force_x != 0.0 || body.force_y != 0.0 || body.torque != 0.0 {
        return false;
    }
    let speed_squared = body.velocity_x * body.velocity_x + body.velocity_y * body.velocity_y;
    if speed_squared > linear_threshold * linear_threshold {
        return false;
    }
    return body.angular_velocity.abs() <= angular_threshold;
}

fn island_item_count(starts: &[usize], counts: &[usize]) -> usize {
    return match counts.len() {
        0 => 0,
        len => starts[len - 1] + counts[len - 1],
    };
}

pub(crate) fn island_root_of(parents: &mut HashMap<i32, i32>, index: i32) -> i32 {
    let mut root = index;
    loop {
        match parents.get(&root) {
            Some(parent) if *parent != root => root = *parent,
            _ => break,
        }
    }
    let mut walk = index;
    loop {
        match parents.get(&walk).copied() {
            Some(parent) if parent != walk => {
                parents.insert(walk, root);
                walk = parent;
            }
            _ => break,
        }
    }
    return root;
}

fn joint_ends(joint: &Physics2DJointRef) -> (flight_entity::Kind, i32, i32) {
    let joint = joint.read().unwrap();
    let fields = joint.joint_fields();
    return (fields.kind.clone(), fields.body_a, fields.body_b);
}

fn keep_physics2d_body_awake(world: &Physics2DWorld, body_index: i32) {
    if let Some(body) = find_physics2d_body(world, body_index) {
        let mut body = body.write().unwrap();
        if body.body_type != Physics2DBodyType::Static {
            body.sleep_timer = 0.0;
        }
    }
}

fn prepare_island_slices(starts: &mut Vec<usize>, counts: &[usize], cursors: &mut Vec<usize>) {
    starts.resize(counts.len(), 0);
    cursors.resize(counts.len(), 0);
    let mut start = 0;
    for i in 0..counts.len() {
        starts[i] = start;
        start += counts[i];
    }
}

fn solve_island_for_body(world: &mut Physics2DWorld, body_index: i32) -> Option<usize> {
    let body = find_physics2d_body(world, body_index)?;
    let index = {
        let body = body.read().unwrap();
        if body.body_type == Physics2DBodyType::Static || body.sleeping {
            return None;
        }
        body.index
    };
    let root = island_root_of(&mut world.island_parents, index);
    return world.solve_island_by_root.get(&root).copied();
}

fn solve_island_for_joint(world: &mut Physics2DWorld, joint: &Physics2DJointRef) -> Option<usize> {
    let (kind, body_a, body_b) = joint_ends(joint);
    let uses_body_a = world.joint_solvers.get(&kind)?.uses_body_a != Some(false);
    if uses_body_a {
        return solve_island_for_pair(world, body_a, body_b);
    }
    return solve_island_for_body(world, body_b);
}

fn solve_island_for_pair(world: &mut Physics2DWorld, body_a: i32, body_b: i32) -> Option<usize> {
    if let Some(island) = solve_island_for_body(world, body_a) {
        return Some(island);
    }
    return solve_island_for_body(world, body_b);
}

fn union_dynamic_pair(world: &mut Physics2DWorld, a: i32, b: i32) {
    let (Some(first), Some(second)) = (find_physics2d_body(world, a), find_physics2d_body(world, b)) else {
        return;
    };
    if first.read().unwrap().body_type == Physics2DBodyType::Static
        || second.read().unwrap().body_type == Physics2DBodyType::Static
    {
        return;
    }
    let root_a = island_root_of(&mut world.island_parents, a);
    let root_b = island_root_of(&mut world.island_parents, b);
    if root_a != root_b {
        world.island_parents.insert(root_a, root_b);
    }
}
