//! World and body lifecycle (TS `world.ts`): insertion, removal, collider topology, body controls
//! and actions. Topology changes keep every derived structure coherent immediately: they discard
//! stale constraints, wake affected bodies and republish bounds.

use std::collections::HashSet;
use std::sync::{Arc, RwLock};

use flight_collision::CollisionShape2D;
use flight_entity::{Ref, allocate_entity, throw_error};
use flight_spatial::SpatialIndexBackend2D;

use crate::broadphase::synchronize_physics2d_broadphase;
use crate::collider_transform::create_physics2d_collider_world_shape;
use crate::joint_collision_suppression::rebuild_physics2d_joint_collision_suppressions;
use crate::mass_properties::update_rigid_body2d_mass_data;
use crate::ownership::{assert_physics2d_body_not_stepping, assert_physics2d_world_not_stepping};
use crate::types::*;

/// Creates a collider from a LOCAL-space shape, owning copies of every authored value and
/// allocating its world-space shape (TS `createPhysics2DCollider`).
pub fn create_physics2d_collider(
    local: &CollisionShape2D,
    material: &Physics2DMaterial,
    sensor: Option<bool>,
    filter: Option<&Physics2DCollisionFilter>,
) -> Ref<Physics2DCollider> {
    let owned_local = local.clone();
    let world_shape = create_physics2d_collider_world_shape(&owned_local);
    let filter = filter.copied().unwrap_or(Physics2DCollisionFilter {
        category_bits: 1,
        mask_bits: 0xffff_ffff,
        group_index: 0,
    });
    let mut out: Physics2DCollider = allocate_entity();
    initialize_physics2d_collider(
        &mut out,
        filter,
        owned_local,
        *material,
        sensor.unwrap_or(false),
        world_shape,
    );
    return Arc::new(RwLock::new(out));
}

/// The default solver tuning (TS `createPhysics2DSolverConfig`).
// flight-lint: allow(conform-params) D23 configuration construction uses optional-field overrides
pub fn create_physics2d_solver_config(
    options: Option<&Physics2DSolverConfigOptions>,
) -> Physics2DSolverConfig {
    let mut out = Physics2DSolverConfig::default();
    initialize_physics2d_solver_config(&mut out, options);
    return out;
}

/// Creates an empty world, defaulting to `-9.81` gravity and a unit uniform-grid broadphase (TS
/// `createPhysics2DWorld`).
pub fn create_physics2d_world(
    gravity_x: Option<f32>,
    gravity_y: Option<f32>,
    index: Option<SpatialIndexBackend2D>,
) -> Physics2DWorld {
    let mut out: Physics2DWorld = allocate_entity();
    initialize_physics2d_world(
        &mut out,
        create_physics2d_solver_config(None),
        gravity_x.unwrap_or(0.0),
        gravity_y.unwrap_or(-9.81),
        index.unwrap_or_else(|| flight_spatial::create_uniform_grid_spatial_backend_2d(1.0)),
    );
    return out;
}

/// Creates a rigid body at rest; mass is derived once it joins a world (TS `createRigidBody2D`).
// flight-lint: allow(conform-params) the TS parameter is named `type`, a Rust keyword, so it is `body_type` here
pub fn create_rigid_body2d(
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    angle: Option<f32>,
) -> Ref<RigidBody2D> {
    let mut out: RigidBody2D = allocate_entity();
    initialize_rigid_body2d(&mut out, angle.unwrap_or(0.0), body_type, x, y);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_physics2d_collider` (TS `initializePhysics2DCollider`).
pub fn initialize_physics2d_collider(
    out: &mut Physics2DCollider,
    filter: Physics2DCollisionFilter,
    local: CollisionShape2D,
    material: Physics2DMaterial,
    sensor: bool,
    world: CollisionShape2D,
) {
    out.filter = filter;
    out.local = local;
    out.material = material;
    out.sensor = sensor;
    out.world = world;
}

/// The construction initializer of `create_physics2d_solver_config`.
// flight-lint: allow(conform-extra) D23 adds the public configuration initializer
pub fn initialize_physics2d_solver_config(
    out: &mut Physics2DSolverConfig,
    options: Option<&Physics2DSolverConfigOptions>,
) {
    let defaults = Physics2DSolverConfig::default();
    *out = Physics2DSolverConfig {
        allow_sleeping: options
            .and_then(|value| value.allow_sleeping)
            .unwrap_or(defaults.allow_sleeping),
        sleep_linear_threshold: options
            .and_then(|value| value.sleep_linear_threshold)
            .unwrap_or(defaults.sleep_linear_threshold),
        sleep_angular_threshold: options
            .and_then(|value| value.sleep_angular_threshold)
            .unwrap_or(defaults.sleep_angular_threshold),
        time_to_sleep: options
            .and_then(|value| value.time_to_sleep)
            .unwrap_or(defaults.time_to_sleep),
        velocity_iterations: options
            .and_then(|value| value.velocity_iterations)
            .unwrap_or(defaults.velocity_iterations),
        position_iterations: options
            .and_then(|value| value.position_iterations)
            .unwrap_or(defaults.position_iterations),
        penetration_slop: options
            .and_then(|value| value.penetration_slop)
            .unwrap_or(defaults.penetration_slop),
        position_correction: options
            .and_then(|value| value.position_correction)
            .unwrap_or(defaults.position_correction),
        restitution_threshold: options
            .and_then(|value| value.restitution_threshold)
            .unwrap_or(defaults.restitution_threshold),
        warm_starting: options
            .and_then(|value| value.warm_starting)
            .unwrap_or(defaults.warm_starting),
        continuous_collision: options
            .and_then(|value| value.continuous_collision)
            .unwrap_or(defaults.continuous_collision),
        max_ccd_substeps: options
            .and_then(|value| value.max_ccd_substeps)
            .unwrap_or(defaults.max_ccd_substeps),
        max_ccd_rotation_substeps: options
            .and_then(|value| value.max_ccd_rotation_substeps)
            .unwrap_or(defaults.max_ccd_rotation_substeps),
    };
}

/// The construction initializer of `create_physics2d_world` (TS `initializePhysics2DWorld`).
pub fn initialize_physics2d_world(
    out: &mut Physics2DWorld,
    config: Physics2DSolverConfig,
    gravity_x: f32,
    gravity_y: f32,
    index: SpatialIndexBackend2D,
) {
    out.bodies = Vec::new();
    out.body_by_index.clear();
    out.config = config;
    out.contact_hooks = Physics2DContactHooks::default();
    out.contacts = Vec::new();
    out.events = Physics2DContactEvents::default();
    out.gravity_x = gravity_x;
    out.gravity_y = gravity_y;
    out.index = index;
    out.island_parents.clear();
    out.island_sleep_timers.clear();
    out.joint_collision_suppressions.clear();
    out.joint_events = Physics2DJointEvents::default();
    out.joint_solvers.clear();
    out.joints = Vec::new();
    out.next_body_index = 0;
    out.previous_timestep = 0.0;
    out.solve_island_body_counts.clear();
    out.solve_island_body_indices.clear();
    out.solve_island_body_starts.clear();
    out.solve_island_by_root.clear();
    out.solve_island_contact_counts.clear();
    out.solve_island_contact_indices.clear();
    out.solve_island_contact_starts.clear();
    out.solve_island_cursors.clear();
    out.solve_island_joint_counts.clear();
    out.solve_island_joint_indices.clear();
    out.solve_island_joint_starts.clear();
    out.solve_island_roots.clear();
    out.version = PHYSICS2D_WORLD_VERSION;
}

/// The construction initializer of `create_rigid_body2d` (TS `initializeRigidBody2D`).
// flight-lint: allow(conform-params) the TS parameter is named `type`, a Rust keyword, so it is `body_type` here
pub fn initialize_rigid_body2d(
    out: &mut RigidBody2D,
    angle: f32,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
) {
    out.angle = angle;
    out.angular_damping = 0.0;
    out.angular_velocity = 0.0;
    out.bullet = false;
    out.center_x = 0.0;
    out.center_y = 0.0;
    out.colliders = Vec::new();
    out.fixed_rotation = false;
    out.force_x = 0.0;
    out.force_y = 0.0;
    out.gravity_scale = 1.0;
    out.index = -1;
    out.inertia = 0.0;
    out.inverse_inertia = 0.0;
    out.inverse_mass = 0.0;
    out.linear_damping = 0.0;
    out.mass = 0.0;
    out.sleep_enabled = true;
    out.sleep_timer = 0.0;
    out.sleeping = false;
    out.torque = 0.0;
    out.body_type = body_type;
    out.velocity_x = 0.0;
    out.velocity_y = 0.0;
    out.x = x;
    out.y = y;
}

/// Adds `body` to `world`, assigning the persistent index every contact is keyed and ordered by
/// (TS `addPhysics2DBody`; returns nothing per the D0 chaining exception). Panics when the body
/// already belongs to a world or holds a collider twice or one owned by another body.
pub fn add_physics2d_body(world: &mut Physics2DWorld, body: &Ref<RigidBody2D>) {
    assert_physics2d_world_not_stepping(world);
    {
        let guard = body.read().unwrap();
        if guard.owner.is_some()
            || guard.index != -1
            || world.bodies.iter().any(|b| Arc::ptr_eq(b, body))
        {
            throw_error("Cannot add a rigid body that already belongs to a physics world");
        }
        let mut seen: HashSet<*const RwLock<Physics2DCollider>> = HashSet::new();
        for collider in &guard.colliders {
            if !seen.insert(Arc::as_ptr(collider)) {
                throw_error("Cannot add a rigid body containing the same collider twice");
            }
            if is_owned_by_another_body(&collider.read().unwrap(), &guard.identity) {
                throw_error("Cannot share a physics collider between rigid bodies");
            }
        }
    }
    let mut guard = body.write().unwrap();
    guard.index = world.next_body_index;
    world.next_body_index += 1;
    world.bodies.push(body.clone());
    world.body_by_index.insert(guard.index, body.clone());
    guard.owner = Some(world.identity.clone());
    for collider in &guard.colliders {
        collider.write().unwrap().owner = Some(guard.identity.clone());
    }
    update_rigid_body2d_mass_data(&mut guard);
}

/// Adds a collider while keeping every derived world structure coherent (TS
/// `addPhysics2DCollider`; returns nothing per the D0 chaining exception). A body authored before
/// insertion only gains the collider and mass data.
pub fn add_physics2d_collider(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
) {
    assert_physics2d_world_not_stepping(world);
    {
        let guard = body.read().unwrap();
        if guard
            .owner
            .as_ref()
            .is_some_and(|owner| !Arc::ptr_eq(owner, &world.identity))
        {
            throw_error("Cannot mutate a rigid body through a physics world that does not own it");
        }
        if guard.colliders.iter().any(|c| Arc::ptr_eq(c, collider)) {
            throw_error("Cannot add the same physics collider to a rigid body twice");
        }
    }
    let identity = body.read().unwrap().identity.clone();
    if is_owned_by_another_body(&collider.read().unwrap(), &identity) {
        throw_error("Cannot share a physics collider between rigid bodies");
    }
    let body_index = body.read().unwrap().index;
    let in_world = is_body_in_world(world, body);
    if in_world {
        invalidate_physics2d_body_constraints(world, body_index);
    }
    let mut guard = body.write().unwrap();
    guard.colliders.push(collider.clone());
    collider.write().unwrap().owner = Some(guard.identity.clone());
    update_rigid_body2d_mass_data(&mut guard);
    if in_world {
        wake_physics2d_body_from_topology(&mut guard);
        drop(guard);
        synchronize_physics2d_broadphase(world);
    }
}

/// Accumulates a world-space force at the centre of mass for the next step (TS
/// `applyPhysics2DForce`). `false` for a non-dynamic body or a non-finite force.
pub fn apply_physics2d_force(body: &mut RigidBody2D, force_x: f32, force_y: f32) -> bool {
    assert_physics2d_body_not_stepping(body);
    if body.body_type != Physics2DBodyType::Dynamic || !force_x.is_finite() || !force_y.is_finite()
    {
        return false;
    }
    body.force_x += force_x;
    body.force_y += force_y;
    if force_x != 0.0 || force_y != 0.0 {
        wake_physics2d_body_from_topology(body);
    }
    return true;
}

/// Accumulates a world-space force at a world-space point, including its moment about the current
/// centre of mass (TS `applyPhysics2DForceAtPoint`).
pub fn apply_physics2d_force_at_point(
    body: &mut RigidBody2D,
    force_x: f32,
    force_y: f32,
    point_x: f32,
    point_y: f32,
) -> bool {
    assert_physics2d_body_not_stepping(body);
    if body.body_type != Physics2DBodyType::Dynamic
        || !force_x.is_finite()
        || !force_y.is_finite()
        || !point_x.is_finite()
        || !point_y.is_finite()
    {
        return false;
    }
    body.force_x += force_x;
    body.force_y += force_y;
    if !body.fixed_rotation {
        body.torque += cross_physics2d_body_point_vector(body, point_x, point_y, force_x, force_y);
    }
    if force_x != 0.0 || force_y != 0.0 {
        wake_physics2d_body_from_topology(body);
    }
    return true;
}

/// Applies an instantaneous world-space impulse at the centre of mass (TS
/// `applyPhysics2DLinearImpulse`).
pub fn apply_physics2d_linear_impulse(
    body: &mut RigidBody2D,
    impulse_x: f32,
    impulse_y: f32,
) -> bool {
    assert_physics2d_body_not_stepping(body);
    if body.body_type != Physics2DBodyType::Dynamic
        || !impulse_x.is_finite()
        || !impulse_y.is_finite()
    {
        return false;
    }
    body.velocity_x += impulse_x * body.inverse_mass;
    body.velocity_y += impulse_y * body.inverse_mass;
    if impulse_x != 0.0 || impulse_y != 0.0 {
        wake_physics2d_body_from_topology(body);
    }
    return true;
}

/// Applies an instantaneous world-space impulse at a world-space point (TS
/// `applyPhysics2DLinearImpulseAtPoint`).
pub fn apply_physics2d_linear_impulse_at_point(
    body: &mut RigidBody2D,
    impulse_x: f32,
    impulse_y: f32,
    point_x: f32,
    point_y: f32,
) -> bool {
    assert_physics2d_body_not_stepping(body);
    if body.body_type != Physics2DBodyType::Dynamic
        || !impulse_x.is_finite()
        || !impulse_y.is_finite()
        || !point_x.is_finite()
        || !point_y.is_finite()
    {
        return false;
    }
    body.velocity_x += impulse_x * body.inverse_mass;
    body.velocity_y += impulse_y * body.inverse_mass;
    body.angular_velocity +=
        cross_physics2d_body_point_vector(body, point_x, point_y, impulse_x, impulse_y)
            * body.inverse_inertia;
    if impulse_x != 0.0 || impulse_y != 0.0 {
        wake_physics2d_body_from_topology(body);
    }
    return true;
}

/// Accumulates torque for the next step (TS `applyPhysics2DTorque`).
pub fn apply_physics2d_torque(body: &mut RigidBody2D, torque: f32) -> bool {
    assert_physics2d_body_not_stepping(body);
    if body.body_type != Physics2DBodyType::Dynamic || body.fixed_rotation || !torque.is_finite() {
        return false;
    }
    body.torque += torque;
    if torque != 0.0 {
        wake_physics2d_body_from_topology(body);
    }
    return true;
}

fn cross_physics2d_body_point_vector(
    body: &RigidBody2D,
    point_x: f32,
    point_y: f32,
    vector_x: f32,
    vector_y: f32,
) -> f32 {
    let cos = body.angle.cos();
    let sin = body.angle.sin();
    let center_x = body.x + body.center_x * cos - body.center_y * sin;
    let center_y = body.y + body.center_x * sin + body.center_y * cos;
    return (point_x - center_x) * vector_y - (point_y - center_y) * vector_x;
}

/// The body carrying `index`, or `None` when the world no longer holds it (TS
/// `findPhysics2DBody`).
pub fn find_physics2d_body(world: &Physics2DWorld, index: i32) -> Option<Ref<RigidBody2D>> {
    return world.body_by_index.get(&index).cloned();
}

/// Upgrades the serializable fields of a reconstructed world in place (TS `hydratePhysics2DWorld`).
/// Fails closed on an unknown future version. The source's missing-field upgrades for pre-CCD
/// layouts (an absent `continuousCollision`, `fixedRotation`, ...) cannot arise for typed Rust
/// records (D15), so a supported older version only advances.
pub fn hydrate_physics2d_world(world: &mut Physics2DWorld) -> bool {
    assert_physics2d_world_not_stepping(world);
    if world.version > PHYSICS2D_WORLD_VERSION {
        return false;
    }
    world.version = PHYSICS2D_WORLD_VERSION;
    return true;
}

pub(crate) fn invalidate_physics2d_body_constraints(world: &mut Physics2DWorld, body_index: i32) {
    invalidate_physics2d_body_contacts(world, body_index);
    for joint in world.joints.clone() {
        let (kind, joint_a, joint_b) = {
            let guard = joint.read().unwrap();
            let fields = guard.joint_fields();
            (fields.kind.clone(), fields.body_a, fields.body_b)
        };
        let solver = world.joint_solvers.get(&kind).cloned();
        let uses_body_a = solver
            .as_ref()
            .map_or(true, |solver| solver.uses_body_a != Some(false));
        let connected_a = uses_body_a && joint_a == body_index;
        let connected_b = joint_b == body_index;
        if !connected_a && !connected_b {
            continue;
        }
        {
            let mut guard = joint.write().unwrap();
            if let Some(clear) = solver
                .as_ref()
                .and_then(|solver| solver.clear_accumulated_impulses.clone())
            {
                clear(&mut *guard);
            }
            let fields = guard.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            fields.impulse2 = 0.0;
        }
        if solver.is_none() || !uses_body_a {
            continue;
        }
        let other_index = if connected_a { joint_b } else { joint_a };
        if other_index == body_index {
            continue;
        }
        if let Some(other) = find_physics2d_body(world, other_index) {
            wake_physics2d_body_from_topology(&mut other.write().unwrap());
        }
    }
}

fn invalidate_physics2d_body_contacts(world: &mut Physics2DWorld, body_index: i32) {
    let mut i = world.contacts.len();
    while i > 0 {
        i -= 1;
        let (body_a, body_b, live) = {
            let contact = world.contacts[i].read().unwrap();
            (
                contact.body_a,
                contact.body_b,
                contact.enabled && !contact.sensor,
            )
        };
        if body_a != body_index && body_b != body_index {
            continue;
        }
        if live {
            let other_index = if body_a == body_index { body_b } else { body_a };
            if let Some(other) = find_physics2d_body(world, other_index) {
                wake_physics2d_body_from_topology(&mut other.write().unwrap());
            }
        }
        world.contacts.remove(i);
    }
    remove_physics2d_contact_events_for_body(&mut world.events.began, body_index);
    remove_physics2d_contact_events_for_body(&mut world.events.ended, body_index);
}

/// Rebuilds everything derived from a collider after its authored fields change (TS
/// `invalidatePhysics2DCollider`). `false` when the body is not this world's or lacks the collider.
pub fn invalidate_physics2d_collider(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    {
        let guard = body.read().unwrap();
        if guard
            .owner
            .as_ref()
            .is_some_and(|owner| !Arc::ptr_eq(owner, &world.identity))
        {
            return false;
        }
        if !guard.colliders.iter().any(|c| Arc::ptr_eq(c, collider)) {
            return false;
        }
    }
    let body_index = body.read().unwrap().index;
    let in_world = is_body_in_world(world, body);
    if in_world {
        invalidate_physics2d_body_constraints(world, body_index);
    }
    {
        let mut collider = collider.write().unwrap();
        collider.world = create_physics2d_collider_world_shape(&collider.local);
    }
    let mut guard = body.write().unwrap();
    update_rigid_body2d_mass_data(&mut guard);
    if in_world {
        wake_physics2d_body_from_topology(&mut guard);
        drop(guard);
        synchronize_physics2d_broadphase(world);
    }
    return true;
}

fn is_body_in_world(world: &Physics2DWorld, body: &Ref<RigidBody2D>) -> bool {
    let index = body.read().unwrap().index;
    return world
        .body_by_index
        .get(&index)
        .is_some_and(|b| Arc::ptr_eq(b, body));
}

fn is_owned_by_another_body(
    collider: &Physics2DCollider,
    body: &Arc<Physics2DBodyIdentity>,
) -> bool {
    return collider
        .owner
        .as_ref()
        .is_some_and(|owner| !Arc::ptr_eq(owner, body));
}

/// The canonical order of a body pair: lower index first (TS `isPhysics2DPairOrdered`).
pub fn is_physics2d_pair_ordered(a: &RigidBody2D, b: &RigidBody2D) -> bool {
    return a.index <= b.index;
}

/// Removes `body` from `world` with every contact and joint naming it, waking the surviving ends
/// first (TS `removePhysics2DBody`).
pub fn remove_physics2d_body(world: &mut Physics2DWorld, body: &Ref<RigidBody2D>) -> bool {
    assert_physics2d_world_not_stepping(world);
    let Some(at) = world.bodies.iter().position(|b| Arc::ptr_eq(b, body)) else {
        return false;
    };
    let body_index = body.read().unwrap().index;
    invalidate_physics2d_body_contacts(world, body_index);
    let mut i = world.joints.len();
    while i > 0 {
        i -= 1;
        let joint = world.joints[i].clone();
        let (kind, joint_a, joint_b) = {
            let guard = joint.read().unwrap();
            let fields = guard.joint_fields();
            (fields.kind.clone(), fields.body_a, fields.body_b)
        };
        let solver = world.joint_solvers.get(&kind).cloned();
        let uses_body_a = solver
            .as_ref()
            .map_or(true, |solver| solver.uses_body_a != Some(false));
        let removes_body_a = uses_body_a && joint_a == body_index;
        let removes_body_b = joint_b == body_index;
        if !removes_body_a && !removes_body_b {
            continue;
        }
        if solver.is_some() && uses_body_a {
            let other_index = if removes_body_a { joint_b } else { joint_a };
            if let Some(other) = find_physics2d_body(world, other_index) {
                wake_physics2d_body_from_topology(&mut other.write().unwrap());
            }
        }
        world.joints.remove(i);
        joint.write().unwrap().joint_fields_mut().owner = None;
    }
    rebuild_physics2d_joint_collision_suppressions(world);
    world.body_by_index.remove(&body_index);
    world.bodies.remove(at);
    (world.index.remove_spatial_object)(body_index);
    let mut guard = body.write().unwrap();
    guard.index = -1;
    guard.owner = None;
    return true;
}

/// Removes one collider and updates every state derived from the body's collider list (TS
/// `removePhysics2DCollider`).
pub fn remove_physics2d_collider(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    collider: &Ref<Physics2DCollider>,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    let at = {
        let guard = body.read().unwrap();
        if guard
            .owner
            .as_ref()
            .is_some_and(|owner| !Arc::ptr_eq(owner, &world.identity))
        {
            return false;
        }
        let Some(at) = guard
            .colliders
            .iter()
            .position(|c| Arc::ptr_eq(c, collider))
        else {
            return false;
        };
        at
    };
    let body_index = body.read().unwrap().index;
    let in_world = is_body_in_world(world, body);
    if in_world {
        invalidate_physics2d_body_constraints(world, body_index);
    }
    let mut guard = body.write().unwrap();
    guard.colliders.remove(at);
    collider.write().unwrap().owner = None;
    update_rigid_body2d_mass_data(&mut guard);
    if in_world {
        wake_physics2d_body_from_topology(&mut guard);
        drop(guard);
        synchronize_physics2d_broadphase(world);
    }
    return true;
}

fn remove_physics2d_contact_events_for_body(
    events: &mut Vec<Physics2DContactRef>,
    body_index: i32,
) {
    let mut i = events.len();
    while i > 0 {
        i -= 1;
        let named = {
            let contact = events[i].read().unwrap();
            contact.body_a == body_index || contact.body_b == body_index
        };
        if named {
            events.remove(i);
        }
    }
}

/// Opts a world-owned body into or out of continuous collision detection (TS
/// `setPhysics2DBodyBullet`). The source's non-boolean rejection cannot arise for a typed `bool`.
pub fn set_physics2d_body_bullet(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    bullet: bool,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    if !is_body_in_world(world, body) {
        return false;
    }
    let mut guard = body.write().unwrap();
    guard.bullet = bullet;
    wake_physics2d_body_from_topology(&mut guard);
    return true;
}

/// Enables or disables angular response while keeping translational mass; fixing rotation discards
/// spin, torque and cached constraints (TS `setPhysics2DBodyFixedRotation`).
pub fn set_physics2d_body_fixed_rotation(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    fixed_rotation: bool,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    if !is_body_in_world(world, body) {
        return false;
    }
    let body_index = body.read().unwrap().index;
    if body.read().unwrap().fixed_rotation == fixed_rotation {
        return true;
    }
    invalidate_physics2d_body_constraints(world, body_index);
    let mut guard = body.write().unwrap();
    guard.fixed_rotation = fixed_rotation;
    if fixed_rotation {
        guard.angular_velocity = 0.0;
        guard.torque = 0.0;
    }
    update_rigid_body2d_mass_data(&mut guard);
    wake_physics2d_body_from_topology(&mut guard);
    return true;
}

/// Changes whether this body may participate in island sleeping, waking it (TS
/// `setPhysics2DBodySleepEnabled`).
pub fn set_physics2d_body_sleep_enabled(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    sleep_enabled: bool,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    if !is_body_in_world(world, body) {
        return false;
    }
    let mut guard = body.write().unwrap();
    guard.sleep_enabled = sleep_enabled;
    wake_physics2d_body_from_topology(&mut guard);
    return true;
}

/// Teleports a world body, invalidating its constraints first and republishing its bounds (TS
/// `setPhysics2DBodyTransform`). `false` for a foreign body or a non-finite pose.
pub fn set_physics2d_body_transform(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    x: f32,
    y: f32,
    angle: f32,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    if !is_body_in_world(world, body) || !x.is_finite() || !y.is_finite() || !angle.is_finite() {
        return false;
    }
    let body_index = {
        let guard = body.read().unwrap();
        if guard.x == x && guard.y == y && guard.angle == angle {
            return true;
        }
        guard.index
    };
    invalidate_physics2d_body_constraints(world, body_index);
    {
        let mut guard = body.write().unwrap();
        guard.x = x;
        guard.y = y;
        guard.angle = angle;
        wake_physics2d_body_from_topology(&mut guard);
    }
    synchronize_physics2d_broadphase(world);
    return true;
}

/// Changes how a body participates, keeping mass, forces, constraints and sleep coherent (TS
/// `setPhysics2DBodyType`).
// flight-lint: allow(conform-params) the TS parameter is named `type`, a Rust keyword, so it is `body_type` here
pub fn set_physics2d_body_type(
    world: &mut Physics2DWorld,
    body: &Ref<RigidBody2D>,
    body_type: Physics2DBodyType,
) -> bool {
    assert_physics2d_world_not_stepping(world);
    if !is_body_in_world(world, body) {
        return false;
    }
    let body_index = body.read().unwrap().index;
    if body.read().unwrap().body_type == body_type {
        return true;
    }
    invalidate_physics2d_body_constraints(world, body_index);
    let mut guard = body.write().unwrap();
    guard.body_type = body_type;
    update_rigid_body2d_mass_data(&mut guard);
    if body_type != Physics2DBodyType::Dynamic {
        guard.force_x = 0.0;
        guard.force_y = 0.0;
        guard.torque = 0.0;
    }
    if body_type == Physics2DBodyType::Static {
        guard.velocity_x = 0.0;
        guard.velocity_y = 0.0;
        guard.angular_velocity = 0.0;
    }
    wake_physics2d_body_from_topology(&mut guard);
    return true;
}

// Kept local, as the source keeps it out of islands.rs: topology only needs the two-field wake.
pub(crate) fn wake_physics2d_body_from_topology(body: &mut RigidBody2D) {
    body.sleeping = false;
    body.sleep_timer = 0.0;
}
