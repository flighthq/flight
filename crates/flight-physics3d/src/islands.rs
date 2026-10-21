// flight-lint: allow-file(conform-params) D5: diagnostics guard state is explicit caller-owned state
use std::collections::HashMap;

use crate::{Physics3DBodyType, Physics3DWorld, RigidBody3D};

fn body_is_still(body: &RigidBody3D, linear: f32, angular: f32) -> bool {
    if [
        body.force_x,
        body.force_y,
        body.force_z,
        body.torque_x,
        body.torque_y,
        body.torque_z,
    ]
    .iter()
    .any(|v| *v != 0.0)
    {
        return false;
    }
    let speed = body.velocity_x * body.velocity_x
        + body.velocity_y * body.velocity_y
        + body.velocity_z * body.velocity_z;
    if speed > linear * linear {
        return false;
    }
    let angular_speed = body.angular_velocity_x * body.angular_velocity_x
        + body.angular_velocity_y * body.angular_velocity_y
        + body.angular_velocity_z * body.angular_velocity_z;
    return angular_speed <= angular * angular;
}

pub fn build_physics_3d_solve_islands(world: &mut Physics3DWorld) {
    world.solve_island_roots.clear();
    world.solve_island_by_root.clear();
    world.solve_island_body_counts.clear();
    world.solve_island_contact_counts.clear();
    world.solve_island_joint_counts.clear();
    for body_ref in &world.bodies {
        let body = body_ref.read().unwrap();
        if body.body_type == Physics3DBodyType::Static || body.sleeping {
            continue;
        }
        let root = island_root(&mut world.island_parents, body.index);
        if !world.solve_island_by_root.contains_key(&root) {
            let island = world.solve_island_roots.len();
            world.solve_island_roots.push(root);
            world.solve_island_by_root.insert(root, island);
            world.solve_island_body_counts.push(0);
            world.solve_island_contact_counts.push(0);
            world.solve_island_joint_counts.push(0);
        }
        world.solve_island_body_counts[*world.solve_island_by_root.get(&root).unwrap()] += 1;
    }
    for contact in &world.contacts {
        let contact = contact.read().unwrap();
        if !contact.enabled || contact.sensor {
            continue;
        }
        if let Some(island) = island_for_pair(world, contact.body_a, contact.body_b) {
            world.solve_island_contact_counts[island] += 1;
        }
    }
    for joint in &world.joints {
        let joint = joint.read().unwrap();
        let f = joint.fields();
        let Some(solver) = world.joint_solvers.get(&f.kind) else {
            continue;
        };
        if f.broken {
            continue;
        }
        let island = if solver.uses_body_a == Some(false) {
            island_for_body(world, f.body_b)
        } else {
            island_for_pair(world, f.body_a, f.body_b)
        };
        if let Some(island) = island {
            world.solve_island_joint_counts[island] += 1;
        }
    }
    prepare_starts(
        &mut world.solve_island_body_starts,
        &world.solve_island_body_counts,
    );
    prepare_starts(
        &mut world.solve_island_contact_starts,
        &world.solve_island_contact_counts,
    );
    prepare_starts(
        &mut world.solve_island_joint_starts,
        &world.solve_island_joint_counts,
    );
    world.solve_island_body_indices = vec![
        0;
        item_count(
            &world.solve_island_body_starts,
            &world.solve_island_body_counts
        )
    ];
    world.solve_island_contact_indices = vec![
        0;
        item_count(
            &world.solve_island_contact_starts,
            &world.solve_island_contact_counts
        )
    ];
    world.solve_island_joint_indices = vec![
        0;
        item_count(
            &world.solve_island_joint_starts,
            &world.solve_island_joint_counts
        )
    ];
    world.solve_island_cursors = world.solve_island_body_starts.clone();
    for (i, body) in world.bodies.iter().enumerate() {
        let body = body.read().unwrap();
        if body.body_type == Physics3DBodyType::Static || body.sleeping {
            continue;
        }
        let root = island_root(&mut world.island_parents, body.index);
        if let Some(&island) = world.solve_island_by_root.get(&root) {
            let at = world.solve_island_cursors[island];
            world.solve_island_body_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }
    world.solve_island_cursors = world.solve_island_contact_starts.clone();
    for i in 0..world.contacts.len() {
        let contact = world.contacts[i].read().unwrap();
        if !contact.enabled || contact.sensor {
            continue;
        }
        if let Some(island) = island_for_pair(world, contact.body_a, contact.body_b) {
            let at = world.solve_island_cursors[island];
            world.solve_island_contact_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }
    world.solve_island_cursors = world.solve_island_joint_starts.clone();
    for i in 0..world.joints.len() {
        let joint = world.joints[i].read().unwrap();
        let f = joint.fields();
        let Some(solver) = world.joint_solvers.get(&f.kind) else {
            continue;
        };
        if f.broken {
            continue;
        }
        let island = if solver.uses_body_a == Some(false) {
            island_for_body(world, f.body_b)
        } else {
            island_for_pair(world, f.body_a, f.body_b)
        };
        if let Some(island) = island {
            let at = world.solve_island_cursors[island];
            world.solve_island_joint_indices[at] = i;
            world.solve_island_cursors[island] += 1;
        }
    }
}

fn is_body_live(body: &RigidBody3D) -> bool {
    return body.body_type != Physics3DBodyType::Static && !body.sleeping;
}

pub fn is_rigid_body_3d_pair_awake(a: &RigidBody3D, b: &RigidBody3D) -> bool {
    return is_body_live(a) || is_body_live(b);
}

fn island_for_body(world: &Physics3DWorld, index: i32) -> Option<usize> {
    let body = world.body_by_index.get(&index)?.read().unwrap();
    if body.body_type == Physics3DBodyType::Static || body.sleeping {
        return None;
    }
    let mut parents = world.island_parents.clone();
    let root = island_root(&mut parents, body.index);
    return world.solve_island_by_root.get(&root).copied();
}

fn island_for_pair(world: &Physics3DWorld, a: i32, b: i32) -> Option<usize> {
    return island_for_body(world, a).or_else(|| island_for_body(world, b));
}

fn island_root(parents: &mut HashMap<i32, i32>, index: i32) -> i32 {
    let mut root = index;
    while let Some(&parent) = parents.get(&root) {
        if parent == root {
            break;
        }
        root = parent;
    }
    let mut walk = index;
    while let Some(&parent) = parents.get(&walk) {
        if parent == walk {
            break;
        }
        parents.insert(walk, root);
        walk = parent;
    }
    return root;
}

fn item_count(starts: &[usize], counts: &[usize]) -> usize {
    return counts
        .len()
        .checked_sub(1)
        .map_or(0, |last| starts[last] + counts[last]);
}

fn keep_awake(world: &Physics3DWorld, index: i32) {
    if let Some(body) = world.body_by_index.get(&index) {
        let mut body = body.write().unwrap();
        if body.body_type != Physics3DBodyType::Static {
            body.sleep_timer = 0.0;
        }
    }
}

fn prepare_starts(starts: &mut Vec<usize>, counts: &[usize]) {
    starts.clear();
    let mut start = 0;
    for count in counts {
        starts.push(start);
        start += count;
    }
}

pub fn set_physics_3d_joint_resolution_guard(
    guards: &mut crate::Physics3DGuardState,
    guard: Option<crate::Physics3DJointResolutionGuard>,
) {
    guards.joint_resolution_guard = guard;
}

fn union_pair_owned(world: &mut Physics3DWorld, a: i32, b: i32) {
    let (Some(first), Some(second)) = (world.body_by_index.get(&a), world.body_by_index.get(&b))
    else {
        return;
    };
    if first.read().unwrap().body_type == Physics3DBodyType::Static
        || second.read().unwrap().body_type == Physics3DBodyType::Static
    {
        return;
    }
    let ra = island_root(&mut world.island_parents, a);
    let rb = island_root(&mut world.island_parents, b);
    if ra != rb {
        world.island_parents.insert(ra, rb);
    }
}

pub fn update_physics_3d_sleep(world: &mut Physics3DWorld, dt: f32) {
    world.island_parents.clear();
    world.island_sleep_timers.clear();
    // Build directly into the world-owned graph without retaining contact locks.
    let contact_pairs: Vec<(i32, i32)> = world
        .contacts
        .iter()
        .filter_map(|c| {
            let c = c.read().unwrap();
            (c.enabled && !c.sensor).then_some((c.body_a, c.body_b))
        })
        .collect();
    for (a, b) in contact_pairs {
        union_pair_owned(world, a, b);
    }
    let joint_pairs: Vec<(i32, i32)> = world
        .joints
        .iter()
        .filter_map(|joint| {
            let joint = joint.read().unwrap();
            let f = joint.fields();
            let solver = world.joint_solvers.get(&f.kind)?;
            (!f.broken && solver.uses_body_a != Some(false)).then_some((f.body_a, f.body_b))
        })
        .collect();
    for (a, b) in joint_pairs {
        union_pair_owned(world, a, b);
    }
    if !world.config.allow_sleeping {
        for body in &world.bodies {
            let mut body = body.write().unwrap();
            body.sleeping = false;
            body.sleep_timer = 0.0;
        }
        return;
    }
    for body in &world.bodies {
        let mut body = body.write().unwrap();
        if body.body_type == Physics3DBodyType::Static {
            continue;
        }
        if !body.sleep_enabled {
            body.sleeping = false;
            body.sleep_timer = 0.0;
            continue;
        }
        if body_is_still(
            &body,
            world.config.sleep_linear_threshold,
            world.config.sleep_angular_threshold,
        ) {
            body.sleep_timer += dt
        } else {
            body.sleep_timer = 0.0
        }
    }
    for joint in &world.joints {
        let joint = joint.read().unwrap();
        let f = joint.fields();
        let Some(solver) = world.joint_solvers.get(&f.kind) else {
            continue;
        };
        if solver.keeps_bodies_awake != Some(true) || f.broken {
            continue;
        }
        if solver.uses_body_a != Some(false) {
            keep_awake(world, f.body_a);
        }
        keep_awake(world, f.body_b);
    }
    for body in &world.bodies {
        let body = body.read().unwrap();
        if body.body_type == Physics3DBodyType::Static {
            continue;
        }
        let root = island_root(&mut world.island_parents, body.index);
        let current = world.island_sleep_timers.get(&root).copied();
        world.island_sleep_timers.insert(
            root,
            current.map_or(body.sleep_timer, |v| v.min(body.sleep_timer)),
        );
    }
    for body in &world.bodies {
        let mut body = body.write().unwrap();
        if body.body_type == Physics3DBodyType::Static {
            continue;
        }
        let root = island_root(&mut world.island_parents, body.index);
        let timer = world
            .island_sleep_timers
            .get(&root)
            .copied()
            .unwrap_or(body.sleep_timer);
        let tolerance = f32::EPSILON * 1.0_f32.max(timer).max(world.config.time_to_sleep);
        let should = body.sleep_enabled && timer + tolerance >= world.config.time_to_sleep;
        if !should && body.sleeping {
            body.sleep_timer = 0.0;
        }
        body.sleeping = should;
        if should {
            body.velocity_x = 0.0;
            body.velocity_y = 0.0;
            body.velocity_z = 0.0;
            body.angular_velocity_x = 0.0;
            body.angular_velocity_y = 0.0;
            body.angular_velocity_z = 0.0;
        }
    }
}
