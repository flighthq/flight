// flight-lint: allow-file(f64) D1: wire records are IEEE doubles (TS DataView/Float64Array) and the step dt is flight-physics2d's f64 timestep
//! The executable specification for the Physics2D ABI (TS `referencePhysics2DAbi.ts`): a real
//! `Physics2DWorld` behind persistent handles, caller-chosen ids and packed buffers. It exists to
//! make the wire contract testable rather than to be fast; a native shadow replaces this one
//! constructor and inherits every codec above it.
//!
//! D5: every world, id table and scratch result lives in state the ABI's callbacks capture, never in
//! module globals. Each world has its own lock plus a `stepping` flag that every entry point checks
//! first, so a contact hook calling back into the ABI during a step sees `Busy` instead of blocking.

use std::collections::HashMap;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionObb2D, CollisionPoint2D,
    CollisionPolygon2D, CollisionRegistry2D, CollisionSegment2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{Ref, allocate_entity, throw_range_error};
use flight_physics2d::{
    Physics2DBodyType, Physics2DCollider, Physics2DCollisionFilter, Physics2DContact,
    Physics2DContactCallback, Physics2DDistanceJointOptions, Physics2DGearCoordinateKind,
    Physics2DGearJointOptions, Physics2DJoint, Physics2DJointOptions, Physics2DJointReaction,
    Physics2DJointRef, Physics2DMaterial, Physics2DMouseJointOptions,
    Physics2DPrismaticJointOptions, Physics2DPulleyJointOptions, Physics2DQueryHit,
    Physics2DQueryResult, Physics2DRayResult, Physics2DRevoluteJointOptions,
    Physics2DRopeJointOptions, Physics2DShapeCastResult, Physics2DSolverConfig,
    Physics2DWeldJointOptions, Physics2DWheelJointOptions, Physics2DWorld, RigidBody2D,
    add_physics2d_body, add_physics2d_collider, add_physics2d_joint, apply_physics2d_force,
    apply_physics2d_force_at_point, apply_physics2d_linear_impulse,
    apply_physics2d_linear_impulse_at_point, apply_physics2d_torque, create_physics2d_collider,
    create_physics2d_distance_joint, create_physics2d_gear_joint, create_physics2d_joint_reaction,
    create_physics2d_mouse_joint, create_physics2d_prismatic_joint, create_physics2d_pulley_joint,
    create_physics2d_query_result, create_physics2d_ray_result, create_physics2d_revolute_joint,
    create_physics2d_rope_joint, create_physics2d_shape_cast_result, create_physics2d_weld_joint,
    create_physics2d_wheel_joint, create_physics2d_world, create_rigid_body2d,
    is_physics2d_body_state_valid, is_physics2d_contact_state_valid, is_physics2d_gravity_valid,
    is_physics2d_joint_state_valid, is_physics2d_previous_timestep_valid,
    is_physics2d_solver_config_valid, is_physics2d_timestep_valid, query_physics2d_point,
    query_physics2d_ray, query_physics2d_ray_closest, query_physics2d_region,
    query_physics2d_shape_cast, register_built_in_physics2d_joint_solvers, remove_physics2d_body,
    remove_physics2d_collider, remove_physics2d_joint, set_physics2d_body_bullet,
    set_physics2d_body_fixed_rotation, set_physics2d_body_sleep_enabled,
    set_physics2d_body_transform, set_physics2d_body_type, step_physics2d, wake_physics2d_body,
    write_physics2d_joint_reaction,
};

use crate::physics2d_abi_command::{read_f64, read_i32, read_u32};
use crate::physics2d_abi_layout::*;
use crate::types::*;

const PHYSICS2D_ABI_BODY_FLAG_MASK: u32 = PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK
    | PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION
    | PHYSICS2D_ABI_BODY_FLAG_BULLET
    | PHYSICS2D_ABI_BODY_FLAG_SLEEPING
    | PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED;

// The ABI-id view of a world's objects, shared with the contact hooks: a step reads it while the
// world itself is locked, and only commands (never during a step) change it. Live objects are keyed
// by the world's persistent body index and by the shared collider/joint allocation (D15).
#[derive(Default)]
struct ReferenceIds {
    id_by_body_index: HashMap<i32, u32>,
    id_by_collider: HashMap<usize, u32>,
    id_by_joint: HashMap<usize, u32>,
}

struct ReferenceCollider {
    body_id: u32,
    collider: Ref<Physics2DCollider>,
}

// A joint that broke during the most recent step: Physics2D removes it from the world, so this is
// the only surface on which a buffer-based caller learns that a joint it holds an id for is gone.
#[derive(Clone, Copy)]
struct ReferenceBrokenJoint {
    force_x: f32,
    force_y: f32,
    id: u32,
    torque: f32,
}

struct ReferenceWorld {
    body_by_id: HashMap<u32, Ref<RigidBody2D>>,
    body_ids: Vec<u32>,
    broken_joints: Vec<ReferenceBrokenJoint>,
    collider_by_id: HashMap<u32, ReferenceCollider>,
    ids: Arc<RwLock<ReferenceIds>>,
    joint_by_id: HashMap<u32, Physics2DJointRef>,
    joint_ids: Vec<u32>,
    last_step_dt: f64,
    query: Physics2DQueryResult,
    ray: Physics2DRayResult,
    reaction: Physics2DJointReaction,
    registry: Arc<CollisionRegistry2D>,
    shape_cast: Physics2DShapeCastResult,
    world: Physics2DWorld,
}

struct ReferenceWorldEntry {
    state: Mutex<ReferenceWorld>,
    stepping: AtomicBool,
}

struct ReferenceAbiState {
    next_world_handle: u64,
    registry: Arc<CollisionRegistry2D>,
    worlds: HashMap<u32, Arc<ReferenceWorldEntry>>,
}

type ReferenceAbiStateRef = Arc<Mutex<ReferenceAbiState>>;

// One decoded command record.
struct CommandRecord<'a> {
    byte_length: usize,
    bytes: &'a [u8],
    kind: u32,
    object_id: u32,
    payload: usize,
    related_id: u32,
    start: usize,
}

fn create_joint(
    kind: u32,
    body_a: i32,
    body_b: i32,
    flags: u32,
    common: &[f64; 6],
    values: &[f64; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT],
) -> Option<Physics2DJointRef> {
    let v = |i: usize| values[i] as f32;
    let base = Physics2DJointOptions {
        body_a,
        body_b,
        break_force: Some(common[4] as f32),
        break_torque: Some(common[5] as f32),
        collide_connected: Some(flags & PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED != 0),
        local_anchor_ax: Some(common[0] as f32),
        local_anchor_ay: Some(common[1] as f32),
        local_anchor_bx: Some(common[2] as f32),
        local_anchor_by: Some(common[3] as f32),
    };
    let enable_motor = flags & PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR != 0;
    let enable_limit = flags & PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT != 0;
    let enable_limit_spring = flags & PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT_SPRING != 0;
    if kind == PHYSICS2D_ABI_JOINT_KIND_DISTANCE {
        return Some(authored_physics2d_distance_joint(
            &Physics2DDistanceJointOptions {
                base,
                damping_ratio: Some(v(2)),
                frequency_hz: Some(v(1)),
                length: v(0),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_REVOLUTE {
        return Some(authored_physics2d_revolute_joint(
            &Physics2DRevoluteJointOptions {
                base,
                enable_limit: Some(enable_limit),
                enable_limit_spring: Some(enable_limit_spring),
                enable_motor: Some(enable_motor),
                limit_damping_ratio: Some(v(6)),
                limit_frequency_hz: Some(v(5)),
                lower_angle: Some(v(0)),
                max_motor_torque: Some(v(4)),
                motor_speed: Some(v(3)),
                reference_angle: Some(v(2)),
                upper_angle: Some(v(1)),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_PRISMATIC {
        return Some(authored_physics2d_prismatic_joint(
            &Physics2DPrismaticJointOptions {
                base,
                enable_limit: Some(enable_limit),
                enable_limit_spring: Some(enable_limit_spring),
                enable_motor: Some(enable_motor),
                limit_damping_ratio: Some(v(8)),
                limit_frequency_hz: Some(v(7)),
                local_axis_ax: Some(v(0)),
                local_axis_ay: Some(v(1)),
                lower_translation: Some(v(3)),
                max_motor_force: Some(v(6)),
                motor_speed: Some(v(5)),
                reference_angle: Some(v(2)),
                upper_translation: Some(v(4)),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_WELD {
        return Some(authored_physics2d_weld_joint(&Physics2DWeldJointOptions {
            base,
            reference_angle: Some(v(0)),
        }));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_WHEEL {
        return Some(authored_physics2d_wheel_joint(
            &Physics2DWheelJointOptions {
                base,
                damping_ratio: Some(v(4)),
                enable_motor: Some(enable_motor),
                frequency_hz: Some(v(3)),
                local_axis_ax: Some(v(0)),
                local_axis_ay: Some(v(1)),
                max_motor_torque: Some(v(6)),
                motor_speed: Some(v(5)),
                rest_translation: Some(v(2)),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_ROPE {
        return Some(authored_physics2d_rope_joint(&Physics2DRopeJointOptions {
            base,
            max_length: v(0),
        }));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_MOUSE {
        // A mouse joint drags ONE body toward a world point, so the factory sets both endpoints to
        // the same body and reads the anchor from the B slot. A record naming two different bodies
        // describes a joint Physics2D cannot build.
        if body_a != body_b {
            return None;
        }
        return Some(authored_physics2d_mouse_joint(
            &Physics2DMouseJointOptions {
                body: body_a,
                break_force: Some(common[4] as f32),
                break_torque: Some(common[5] as f32),
                damping_ratio: Some(v(4)),
                frequency_hz: Some(v(3)),
                local_anchor_x: Some(common[2] as f32),
                local_anchor_y: Some(common[3] as f32),
                max_force: v(2),
                target_x: v(0),
                target_y: v(1),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_PULLEY {
        return Some(authored_physics2d_pulley_joint(
            &Physics2DPulleyJointOptions {
                base,
                constant: v(5),
                ground_anchor_ax: v(0),
                ground_anchor_ay: v(1),
                ground_anchor_bx: v(2),
                ground_anchor_by: v(3),
                ratio: Some(v(4)),
            },
        ));
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_GEAR {
        let coordinate = |bit: u32| {
            return if flags & bit != 0 {
                Physics2DGearCoordinateKind::Linear
            } else {
                Physics2DGearCoordinateKind::Angular
            };
        };
        return Some(authored_physics2d_gear_joint(&Physics2DGearJointOptions {
            axis_ax: Some(v(0)),
            axis_ay: Some(v(1)),
            axis_bx: Some(v(2)),
            axis_by: Some(v(3)),
            base,
            constant: v(5),
            coordinate_a: coordinate(PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A),
            coordinate_b: coordinate(PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B),
            ratio: Some(v(4)),
        }));
    }
    return None;
}

/// Creates the executable reference ABI (TS `createReferencePhysics2DAbi`).
pub fn create_reference_physics2d_abi() -> Physics2DAbi {
    let mut out: Physics2DAbi = allocate_entity();
    initialize_reference_physics2d_abi(&mut out);
    return out;
}

fn create_reference_world(
    world: Physics2DWorld,
    registry: Arc<CollisionRegistry2D>,
) -> ReferenceWorld {
    return ReferenceWorld {
        body_by_id: HashMap::new(),
        body_ids: Vec::new(),
        broken_joints: Vec::new(),
        collider_by_id: HashMap::new(),
        ids: Arc::new(RwLock::new(ReferenceIds::default())),
        joint_by_id: HashMap::new(),
        joint_ids: Vec::new(),
        last_step_dt: 0.0,
        query: create_physics2d_query_result(),
        ray: create_physics2d_ray_result(),
        reaction: create_physics2d_joint_reaction(),
        registry,
        shape_cast: create_physics2d_shape_cast_result(),
        world,
    };
}

/// Installs a fresh reference backend into `out` (TS `initializeReferencePhysics2DAbi`): its own
/// world table and handle counter, captured by every callback.
pub fn initialize_reference_physics2d_abi(out: &mut Physics2DAbi) {
    let mut registry = CollisionRegistry2D {
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    let state: ReferenceAbiStateRef = Arc::new(Mutex::new(ReferenceAbiState {
        next_world_handle: 1,
        registry: Arc::new(registry),
        worlds: HashMap::new(),
    }));
    out.version = PHYSICS2D_ABI_VERSION;
    out.capabilities = PHYSICS2D_ABI_CAPABILITY_CONTACT_HOOKS
        | PHYSICS2D_ABI_CAPABILITY_PERSISTENT_WORLDS
        | PHYSICS2D_ABI_CAPABILITY_QUERIES
        | PHYSICS2D_ABI_CAPABILITY_SELECTIVE_READBACK;

    let s = state.clone();
    out.create_world = Arc::new(move || {
        let mut abi = lock(&s);
        if abi.next_world_handle > 0xffff_ffff {
            return 0;
        }
        let handle = abi.next_world_handle as u32;
        abi.next_world_handle += 1;
        let mut world = create_physics2d_world();
        register_built_in_physics2d_joint_solvers(&mut world);
        let registry = abi.registry.clone();
        abi.worlds.insert(
            handle,
            Arc::new(ReferenceWorldEntry {
                state: Mutex::new(create_reference_world(world, registry)),
                stepping: AtomicBool::new(false),
            }),
        );
        return handle;
    });
    let s = state.clone();
    out.destroy_world = Arc::new(move |handle| {
        let mut abi = lock(&s);
        if abi
            .worlds
            .get(&handle)
            .is_some_and(|entry| entry.stepping.load(Ordering::SeqCst))
        {
            return false;
        }
        return abi.worlds.remove(&handle).is_some();
    });
    let s = state.clone();
    out.get_world_status = Arc::new(move |handle| {
        let Some(entry) = get_entry(&s, handle) else {
            return Physics2DAbiWorldStatus::Stale;
        };
        return if entry.stepping.load(Ordering::SeqCst) {
            Physics2DAbiWorldStatus::Busy
        } else {
            Physics2DAbiWorldStatus::Ready
        };
    });
    let s = state.clone();
    out.execute = Arc::new(move |handle, commands, result| {
        let Some(entry) = get_entry(&s, handle) else {
            return fail_execution(
                result,
                Physics2DAbiExecutionStatus::StaleWorld,
                0,
                PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH,
                0,
            );
        };
        if entry.stepping.load(Ordering::SeqCst) {
            return fail_execution(
                result,
                Physics2DAbiExecutionStatus::BusyWorld,
                0,
                PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH,
                0,
            );
        }
        return execute_commands(&mut lock(&entry.state), commands, result);
    });
    let s = state.clone();
    out.step = Arc::new(move |handle, dt, hooks| {
        let Some(entry) = get_entry(&s, handle) else {
            return Physics2DAbiStepStatus::StaleWorld;
        };
        if entry.stepping.load(Ordering::SeqCst) {
            return Physics2DAbiStepStatus::BusyWorld;
        }
        return step_reference_world(&entry, dt, hooks);
    });
    let s = state.clone();
    out.read_bodies = Arc::new(move |handle, body_ids, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_bodies(&lock(&entry.state), body_ids, buffer);
        return true;
    });
    let s = state.clone();
    out.read_contacts = Arc::new(move |handle, selection, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_contacts(&lock(&entry.state), selection, buffer);
        return true;
    });
    let s = state.clone();
    out.read_joints = Arc::new(move |handle, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        read_joints(&mut lock(&entry.state), buffer);
        return true;
    });
    let s = state.clone();
    out.query_point = Arc::new(move |handle, x, y, filter, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        let mut world = lock(&entry.state);
        let world = &mut *world;
        query_physics2d_point(&mut world.query, &world.world, x, y, filter);
        write_query_hits(world, buffer);
        return true;
    });
    let s = state.clone();
    out.query_ray = Arc::new(
        move |handle,
              origin_x,
              origin_y,
              direction_x,
              direction_y,
              max_fraction,
              closest,
              filter,
              buffer| {
            let Some(entry) = get_ready_entry(&s, handle) else {
                return false;
            };
            let mut world = lock(&entry.state);
            let world = &mut *world;
            let query = if closest {
                query_physics2d_ray_closest
            } else {
                query_physics2d_ray
            };
            query(
                &mut world.ray,
                &world.world,
                origin_x,
                origin_y,
                direction_x,
                direction_y,
                Some(max_fraction),
                filter,
            );
            write_ray_hits(world, buffer);
            return true;
        },
    );
    let s = state.clone();
    out.query_region = Arc::new(move |handle, region, filter, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        let mut world = lock(&entry.state);
        let world = &mut *world;
        query_physics2d_region(&mut world.query, &world.world, region, filter);
        write_query_hits(world, buffer);
        return true;
    });
    let s = state;
    out.query_shape_cast = Arc::new(move |handle, shape, dx, dy, max_fraction, filter, buffer| {
        let Some(entry) = get_ready_entry(&s, handle) else {
            return false;
        };
        let mut world = lock(&entry.state);
        let world = &mut *world;
        let registry = world.registry.clone();
        query_physics2d_shape_cast(
            &mut world.shape_cast,
            &world.world,
            &registry,
            shape,
            dx,
            dy,
            Some(max_fraction),
            filter,
        );
        write_shape_cast_hit(world, buffer);
        return true;
    });
}

fn apply_joint_options(out: &mut dyn Physics2DJoint, options: &Physics2DJointOptions) {
    let out = out.joint_fields_mut();
    out.body_a = options.body_a;
    out.body_b = options.body_b;
    out.break_force = options.break_force.unwrap_or(f32::INFINITY);
    out.break_torque = options.break_torque.unwrap_or(f32::INFINITY);
    out.collide_connected = options.collide_connected.unwrap_or(false);
    out.local_anchor_ax = options.local_anchor_ax.unwrap_or(0.0);
    out.local_anchor_ay = options.local_anchor_ay.unwrap_or(0.0);
    out.local_anchor_bx = options.local_anchor_bx.unwrap_or(0.0);
    out.local_anchor_by = options.local_anchor_by.unwrap_or(0.0);
}

fn apply_torque_action(body: &mut RigidBody2D, torque: f32, _unused: f32) -> bool {
    return apply_physics2d_torque(body, torque);
}

fn are_finite(values: &[f64]) -> bool {
    return values.iter().all(|value| value.is_finite());
}

fn authored_physics2d_collider(
    local: &CollisionShape2D,
    material: &Physics2DMaterial,
    sensor: Option<bool>,
    filter: Option<&Physics2DCollisionFilter>,
) -> Ref<Physics2DCollider> {
    let out = create_physics2d_collider(local);
    {
        let mut out = out.write().unwrap();
        out.material = *material;
        out.sensor = sensor.unwrap_or(false);
        if let Some(filter) = filter {
            out.filter = *filter;
        }
    }
    return out;
}

fn authored_physics2d_distance_joint(options: &Physics2DDistanceJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_distance_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.damping_ratio = options.damping_ratio.unwrap_or(0.0);
        out.frequency_hz = options.frequency_hz.unwrap_or(0.0);
        out.length = options.length;
    }
    return out;
}

fn authored_physics2d_gear_joint(options: &Physics2DGearJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_gear_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.axis_ax = options.axis_ax.unwrap_or(1.0);
        out.axis_ay = options.axis_ay.unwrap_or(0.0);
        out.axis_bx = options.axis_bx.unwrap_or(1.0);
        out.axis_by = options.axis_by.unwrap_or(0.0);
        out.constant = options.constant;
        out.coordinate_a = options.coordinate_a;
        out.coordinate_b = options.coordinate_b;
        out.ratio = options.ratio.unwrap_or(1.0);
    }
    return out;
}

fn authored_physics2d_mouse_joint(options: &Physics2DMouseJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_mouse_joint();
    {
        let mut out = out.write().unwrap();
        out.body_a = options.body;
        out.body_b = options.body;
        out.break_force = options.break_force.unwrap_or(f32::INFINITY);
        out.break_torque = options.break_torque.unwrap_or(f32::INFINITY);
        out.damping_ratio = options.damping_ratio.unwrap_or(0.7);
        out.frequency_hz = options.frequency_hz.unwrap_or(5.0);
        out.local_anchor_bx = options.local_anchor_x.unwrap_or(0.0);
        out.local_anchor_by = options.local_anchor_y.unwrap_or(0.0);
        out.max_force = options.max_force;
        out.target_x = options.target_x;
        out.target_y = options.target_y;
    }
    return out;
}

fn authored_physics2d_prismatic_joint(
    options: &Physics2DPrismaticJointOptions,
) -> Physics2DJointRef {
    let out = create_physics2d_prismatic_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.enable_limit = options.enable_limit.unwrap_or(false);
        out.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        out.enable_motor = options.enable_motor.unwrap_or(false);
        out.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
        out.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        out.local_axis_ax = options.local_axis_ax.unwrap_or(1.0);
        out.local_axis_ay = options.local_axis_ay.unwrap_or(0.0);
        out.lower_translation = options.lower_translation.unwrap_or(0.0);
        out.max_motor_force = options.max_motor_force.unwrap_or(0.0);
        out.motor_speed = options.motor_speed.unwrap_or(0.0);
        out.reference_angle = options.reference_angle.unwrap_or(0.0);
        out.upper_translation = options.upper_translation.unwrap_or(0.0);
    }
    return out;
}

fn authored_physics2d_pulley_joint(options: &Physics2DPulleyJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_pulley_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.constant = options.constant;
        out.ground_anchor_ax = options.ground_anchor_ax;
        out.ground_anchor_ay = options.ground_anchor_ay;
        out.ground_anchor_bx = options.ground_anchor_bx;
        out.ground_anchor_by = options.ground_anchor_by;
        out.ratio = options.ratio.unwrap_or(1.0);
    }
    return out;
}

fn authored_physics2d_revolute_joint(options: &Physics2DRevoluteJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_revolute_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.enable_limit = options.enable_limit.unwrap_or(false);
        out.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        out.enable_motor = options.enable_motor.unwrap_or(false);
        out.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
        out.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        out.lower_angle = options.lower_angle.unwrap_or(0.0);
        out.max_motor_torque = options.max_motor_torque.unwrap_or(0.0);
        out.motor_speed = options.motor_speed.unwrap_or(0.0);
        out.reference_angle = options.reference_angle.unwrap_or(0.0);
        out.upper_angle = options.upper_angle.unwrap_or(0.0);
    }
    return out;
}

fn authored_physics2d_rope_joint(options: &Physics2DRopeJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_rope_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.max_length = options.max_length;
    }
    return out;
}

fn authored_physics2d_weld_joint(options: &Physics2DWeldJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_weld_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.reference_angle = options.reference_angle.unwrap_or(0.0);
    }
    return out;
}

fn authored_physics2d_wheel_joint(options: &Physics2DWheelJointOptions) -> Physics2DJointRef {
    let out = create_physics2d_wheel_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut *out, &options.base);
        out.damping_ratio = options.damping_ratio.unwrap_or(0.0);
        out.enable_motor = options.enable_motor.unwrap_or(false);
        out.frequency_hz = options.frequency_hz.unwrap_or(0.0);
        out.local_axis_ax = options.local_axis_ax.unwrap_or(0.0);
        out.local_axis_ay = options.local_axis_ay.unwrap_or(1.0);
        out.max_motor_torque = options.max_motor_torque.unwrap_or(0.0);
        out.motor_speed = options.motor_speed.unwrap_or(0.0);
        out.rest_translation = options.rest_translation.unwrap_or(0.0);
    }
    return out;
}

fn authored_rigid_body2d(
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    angle: Option<f32>,
) -> Ref<RigidBody2D> {
    let out = create_rigid_body2d();
    {
        let mut out = out.write().unwrap();
        out.angle = angle.unwrap_or(0.0);
        out.body_type = body_type;
        out.x = x;
        out.y = y;
    }
    return out;
}

// The Physics2D step validator's admission of a world (TS `canStep`).
fn can_step(world: &Physics2DWorld, dt: f64) -> bool {
    return is_physics2d_timestep_valid(dt)
        && is_physics2d_previous_timestep_valid(world)
        && is_physics2d_gravity_valid(world)
        && is_physics2d_solver_config_valid(&world.config)
        && is_physics2d_body_state_valid(world)
        && is_physics2d_contact_state_valid(world)
        && is_physics2d_joint_state_valid(world);
}

fn clear_contact_buffer(out: &mut Physics2DAbiContactBuffer) {
    out.count = 0;
    out.point_count = 0;
    out.required_count = 0;
    out.required_point_count = 0;
}

fn clear_query_values(out: &mut Physics2DAbiQueryBuffer, at: usize) {
    let base = at * PHYSICS2D_ABI_QUERY_VALUE_STRIDE;
    for i in 0..PHYSICS2D_ABI_QUERY_VALUE_STRIDE {
        out.values[base + i] = 0.0;
    }
}

// Physics2D removes a broken joint from the world, so its ABI id is retired here or a later SetJoint
// reusing that id would find a stale entry. The load that broke it is kept for one readback.
fn collect_broken_joints(state: &mut ReferenceWorld) {
    state.broken_joints.clear();
    let broke = state.world.joint_events.broke.clone();
    let mut ids = state.ids.write().unwrap();
    for broken in broke {
        let key = get_joint_key(&broken.joint);
        let Some(id) = ids.id_by_joint.get(&key).copied() else {
            continue;
        };
        state.broken_joints.push(ReferenceBrokenJoint {
            force_x: broken.force_x,
            force_y: broken.force_y,
            id,
            torque: broken.torque,
        });
        state.joint_by_id.remove(&id);
        ids.id_by_joint.remove(&key);
        remove_sorted(&mut state.joint_ids, id);
    }
    state.broken_joints.sort_by_key(|broken| broken.id);
}

fn decode_body_type(value: u32) -> Option<Physics2DBodyType> {
    return match value {
        PHYSICS2D_ABI_BODY_TYPE_DYNAMIC => Some(Physics2DBodyType::Dynamic),
        PHYSICS2D_ABI_BODY_TYPE_KINEMATIC => Some(Physics2DBodyType::Kinematic),
        PHYSICS2D_ABI_BODY_TYPE_STATIC => Some(Physics2DBodyType::Static),
        _ => None,
    };
}

fn encode_body_flags(body: &RigidBody2D) -> u32 {
    let mut flags = match body.body_type {
        Physics2DBodyType::Dynamic => PHYSICS2D_ABI_BODY_TYPE_DYNAMIC,
        Physics2DBodyType::Kinematic => PHYSICS2D_ABI_BODY_TYPE_KINEMATIC,
        Physics2DBodyType::Static => PHYSICS2D_ABI_BODY_TYPE_STATIC,
    };
    if body.fixed_rotation {
        flags |= PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION;
    }
    if body.bullet {
        flags |= PHYSICS2D_ABI_BODY_FLAG_BULLET;
    }
    if body.sleeping {
        flags |= PHYSICS2D_ABI_BODY_FLAG_SLEEPING;
    }
    if body.sleep_enabled {
        flags |= PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED;
    }
    return flags;
}

// The plane's single torque scalar travels in the first slot of the shared body-action record, so
// for ApplyTorque the second must be zero too rather than merely ignored.
fn execute_body_action(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
    apply: fn(&mut RigidBody2D, f32, f32) -> bool,
    scalar_only: bool,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let x = read_f64(command.bytes, command.payload);
    let y = read_f64(command.bytes, command.payload + 8);
    if read_f64(command.bytes, command.payload + 16) != 0.0
        || read_f64(command.bytes, command.payload + 24) != 0.0
        || (scalar_only && y != 0.0)
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    return if apply(&mut body.write().unwrap(), x as f32, y as f32) {
        Physics2DAbiExecutionStatus::Complete
    } else {
        Physics2DAbiExecutionStatus::RejectedMutation
    };
}

fn execute_body_point_action(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
    apply: fn(&mut RigidBody2D, f32, f32, f32, f32) -> bool,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_BODY_ACTION
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    let applied = apply(
        &mut body.write().unwrap(),
        read_f64(command.bytes, command.payload) as f32,
        read_f64(command.bytes, command.payload + 8) as f32,
        read_f64(command.bytes, command.payload + 16) as f32,
        read_f64(command.bytes, command.payload + 24) as f32,
    );
    return if applied {
        Physics2DAbiExecutionStatus::Complete
    } else {
        Physics2DAbiExecutionStatus::RejectedMutation
    };
}

fn execute_command(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    return match command.kind {
        PHYSICS2D_ABI_COMMAND_KIND_SET_GRAVITY => execute_set_gravity(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_SET_SOLVER_CONFIG => execute_set_solver_config(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_SET_BODY => execute_set_body(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_DESTROY_BODY => execute_destroy_body(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER => execute_set_collider(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_DESTROY_COLLIDER => execute_destroy_collider(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_SET_JOINT => execute_set_joint(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_DESTROY_JOINT => execute_destroy_joint(state, command),
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE => {
            execute_body_action(state, command, apply_physics2d_force, false)
        }
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_FORCE_AT_POINT => {
            execute_body_point_action(state, command, apply_physics2d_force_at_point)
        }
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE => {
            execute_body_action(state, command, apply_physics2d_linear_impulse, false)
        }
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_LINEAR_IMPULSE_AT_POINT => {
            execute_body_point_action(state, command, apply_physics2d_linear_impulse_at_point)
        }
        PHYSICS2D_ABI_COMMAND_KIND_APPLY_TORQUE => {
            execute_body_action(state, command, apply_torque_action, true)
        }
        PHYSICS2D_ABI_COMMAND_KIND_WAKE_BODY => execute_wake_body(state, command),
        _ => Physics2DAbiExecutionStatus::InvalidCommand,
    };
}

fn execute_commands(
    state: &mut ReferenceWorld,
    commands: &Physics2DAbiCommandBuffer,
    out: &mut Physics2DAbiExecutionResult,
) -> bool {
    if !is_command_buffer_valid(commands) {
        return fail_execution(
            out,
            Physics2DAbiExecutionStatus::InvalidBuffer,
            0,
            PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH,
            0,
        );
    }
    let bytes = &commands.data[..];
    let mut byte_offset = PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH;
    for command_index in 0..commands.command_count {
        if byte_offset + PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH > commands.byte_length {
            return fail_execution(
                out,
                Physics2DAbiExecutionStatus::InvalidBuffer,
                command_index,
                byte_offset,
                0,
            );
        }
        let kind = read_u32(bytes, byte_offset);
        let byte_length = read_u32(bytes, byte_offset + 4) as usize;
        if byte_length < PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH
            || byte_length % 8 != 0
            || byte_offset + byte_length > commands.byte_length
        {
            return fail_execution(
                out,
                Physics2DAbiExecutionStatus::InvalidBuffer,
                command_index,
                byte_offset,
                kind,
            );
        }
        let record = CommandRecord {
            byte_length,
            bytes,
            kind,
            object_id: read_u32(bytes, byte_offset + 8),
            payload: byte_offset + PHYSICS2D_ABI_COMMAND_RECORD_HEADER_BYTE_LENGTH,
            related_id: read_u32(bytes, byte_offset + 12),
            start: byte_offset,
        };
        let status = execute_command(state, &record);
        if status != Physics2DAbiExecutionStatus::Complete {
            return fail_execution(out, status, command_index, byte_offset, kind);
        }
        byte_offset += byte_length;
    }
    if byte_offset != commands.byte_length {
        return fail_execution(
            out,
            Physics2DAbiExecutionStatus::InvalidBuffer,
            commands.command_count,
            byte_offset,
            0,
        );
    }
    out.status = Physics2DAbiExecutionStatus::Complete;
    out.command_index = commands.command_count;
    out.byte_offset = byte_offset;
    out.command_kind = 0;
    return true;
}

fn execute_destroy_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id).cloned() else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    let body_index = body.read().unwrap().index;
    {
        let mut ids = state.ids.write().unwrap();
        state.collider_by_id.retain(|_, held| {
            if held.body_id != command.object_id {
                return true;
            }
            ids.id_by_collider.remove(&get_collider_key(&held.collider));
            return false;
        });
        let mut removed_joints = Vec::new();
        state.joint_by_id.retain(|id, joint| {
            let fields = joint.read().unwrap();
            let fields = fields.joint_fields();
            if fields.body_a != body_index && fields.body_b != body_index {
                return true;
            }
            ids.id_by_joint.remove(&get_joint_key(joint));
            removed_joints.push(*id);
            return false;
        });
        for id in removed_joints {
            remove_sorted(&mut state.joint_ids, id);
        }
        ids.id_by_body_index.remove(&body_index);
    }
    remove_physics2d_body(&mut state.world, &body);
    state.body_by_id.remove(&command.object_id);
    remove_sorted(&mut state.body_ids, command.object_id);
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_destroy_collider(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_COLLIDER
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(held) = state.collider_by_id.remove(&command.object_id) else {
        return Physics2DAbiExecutionStatus::MissingCollider;
    };
    if let Some(body) = state.body_by_id.get(&held.body_id).cloned() {
        remove_physics2d_collider(&mut state.world, &body, &held.collider);
    }
    state
        .ids
        .write()
        .unwrap()
        .id_by_collider
        .remove(&get_collider_key(&held.collider));
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_destroy_joint(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_DESTROY_JOINT
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(joint) = state.joint_by_id.remove(&command.object_id) else {
        return Physics2DAbiExecutionStatus::MissingJoint;
    };
    remove_physics2d_joint(&mut state.world, &joint);
    state
        .ids
        .write()
        .unwrap()
        .id_by_joint
        .remove(&get_joint_key(&joint));
    remove_sorted(&mut state.joint_ids, command.object_id);
    return Physics2DAbiExecutionStatus::Complete;
}

// Mass, inertia and centre of mass are absent from the mutation path on purpose: Physics2D derives
// them from collider geometry and density, so they travel only in the readback direction.
fn execute_set_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let flags = read_u32(command.bytes, command.payload);
    if flags & PHYSICS2D_ABI_BODY_FLAG_MASK != flags
        || read_u32(command.bytes, command.payload + 4) != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let body_type = decode_body_type(flags & PHYSICS2D_ABI_BODY_FLAG_TYPE_MASK);
    let mut values = [0.0; PHYSICS2D_ABI_BODY_VALUE_STRIDE];
    read_f64_values(
        &mut values,
        command,
        PHYSICS2D_ABI_SET_BODY_PAYLOAD_OFFSET_VALUES,
    );
    let Some(body_type) = body_type else {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    };
    if !is_body_value_block_valid(&values) {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }

    let body = match state.body_by_id.get(&command.object_id) {
        Some(existing) => existing.clone(),
        None => {
            let body = authored_rigid_body2d(
                body_type,
                values[0] as f32,
                values[1] as f32,
                Some(values[2] as f32),
            );
            add_physics2d_body(&mut state.world, &body);
            let index = body.read().unwrap().index;
            state.body_by_id.insert(command.object_id, body.clone());
            state
                .ids
                .write()
                .unwrap()
                .id_by_body_index
                .insert(index, command.object_id);
            insert_sorted(&mut state.body_ids, command.object_id);
            body
        }
    };

    let world = &mut state.world;
    if !set_physics2d_body_type(world, &body, body_type)
        || !set_physics2d_body_fixed_rotation(
            world,
            &body,
            flags & PHYSICS2D_ABI_BODY_FLAG_FIXED_ROTATION != 0,
        )
        || !set_physics2d_body_bullet(world, &body, flags & PHYSICS2D_ABI_BODY_FLAG_BULLET != 0)
        || !set_physics2d_body_sleep_enabled(
            world,
            &body,
            flags & PHYSICS2D_ABI_BODY_FLAG_SLEEP_ENABLED != 0,
        )
        || !set_physics2d_body_transform(
            world,
            &body,
            values[0] as f32,
            values[1] as f32,
            values[2] as f32,
        )
    {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }

    let mut body = body.write().unwrap();
    body.velocity_x = values[3] as f32;
    body.velocity_y = values[4] as f32;
    body.angular_velocity = values[5] as f32;
    body.force_x = values[6] as f32;
    body.force_y = values[7] as f32;
    body.torque = values[8] as f32;
    body.linear_damping = values[13] as f32;
    body.angular_damping = values[14] as f32;
    body.gravity_scale = values[15] as f32;
    body.sleep_timer = values[16];
    if flags & PHYSICS2D_ABI_BODY_FLAG_SLEEPING == 0 {
        wake_physics2d_body(&mut body);
    } else {
        body.sleeping = body.body_type != Physics2DBodyType::Static;
    }
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_set_collider(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if !is_object_id(command.object_id)
        || !is_object_id(command.related_id)
        || command.byte_length < PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_COLLIDER_MINIMUM
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.related_id).cloned() else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    let sensor_flag = read_u32(command.bytes, command.payload);
    if sensor_flag > 1 {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let shape_at = command.payload + PHYSICS2D_ABI_SET_COLLIDER_PAYLOAD_OFFSET_SHAPE;
    let shape_kind = read_u32(command.bytes, shape_at);
    if !(PHYSICS2D_ABI_SHAPE_KIND_CIRCLE..=PHYSICS2D_ABI_SHAPE_KIND_POINT).contains(&shape_kind) {
        return Physics2DAbiExecutionStatus::UnsupportedShape;
    }
    let Some(shape) = read_shape(command, shape_at) else {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    };
    if !is_shape_state_valid(&shape) {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    let density = read_f64(command.bytes, command.payload + 16);
    let friction = read_f64(command.bytes, command.payload + 24);
    let restitution = read_f64(command.bytes, command.payload + 32);
    if ![density, friction, restitution]
        .iter()
        .all(|value| value.is_finite() && *value >= 0.0)
    {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    let collider = authored_physics2d_collider(
        &shape,
        &Physics2DMaterial {
            density: density as f32,
            friction: friction as f32,
            restitution: restitution as f32,
        },
        Some(sensor_flag == 1),
        Some(&Physics2DCollisionFilter {
            category_bits: read_u32(command.bytes, command.payload + 4),
            mask_bits: read_u32(command.bytes, command.payload + 8),
            group_index: read_i32(command.bytes, command.payload + 12),
        }),
    );

    // Replacing an id detaches the previous collider first, so an id names one live collider.
    let mut ids = state.ids.write().unwrap();
    if let Some(previous) = state.collider_by_id.remove(&command.object_id) {
        if let Some(previous_body) = state.body_by_id.get(&previous.body_id) {
            remove_physics2d_collider(&mut state.world, previous_body, &previous.collider);
        }
        ids.id_by_collider
            .remove(&get_collider_key(&previous.collider));
    }
    add_physics2d_collider(&mut state.world, &body, &collider);
    ids.id_by_collider
        .insert(get_collider_key(&collider), command.object_id);
    state.collider_by_id.insert(
        command.object_id,
        ReferenceCollider {
            body_id: command.related_id,
            collider,
        },
    );
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_set_gravity(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_GRAVITY
        || command.object_id != 0
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let x = read_f64(command.bytes, command.payload);
    let y = read_f64(command.bytes, command.payload + 8);
    if !x.is_finite() || !y.is_finite() {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    state.world.gravity_x = x as f32;
    state.world.gravity_y = y as f32;
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_set_joint(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_JOINT
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let payload = command.payload;
    let kind = read_u32(
        command.bytes,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND,
    );
    let body_a_id = read_u32(
        command.bytes,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_A,
    );
    let body_b_id = read_u32(
        command.bytes,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_BODY_B,
    );
    if !(PHYSICS2D_ABI_JOINT_KIND_DISTANCE..=PHYSICS2D_ABI_JOINT_KIND_GEAR).contains(&kind) {
        return Physics2DAbiExecutionStatus::UnsupportedJoint;
    }
    if !is_object_id(body_a_id) || !is_object_id(body_b_id) {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let flags = read_u32(
        command.bytes,
        payload + PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_FLAGS,
    );
    if flags & get_joint_flag_mask(kind) != flags {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let (Some(body_a), Some(body_b)) = (
        state.body_by_id.get(&body_a_id),
        state.body_by_id.get(&body_b_id),
    ) else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    let (body_a_index, body_b_index) = (body_a.read().unwrap().index, body_b.read().unwrap().index);
    let mut common = [0.0; 6];
    read_f64_values(
        &mut common,
        command,
        PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_COMMON_VALUES,
    );
    let mut values = [0.0; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT];
    read_f64_values(
        &mut values,
        command,
        PHYSICS2D_ABI_SET_JOINT_PAYLOAD_OFFSET_KIND_VALUES,
    );
    if !is_joint_value_block_valid(&common, &values) {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    let Some(joint) = create_joint(kind, body_a_index, body_b_index, flags, &common, &values)
    else {
        return Physics2DAbiExecutionStatus::UnsupportedJoint;
    };

    let mut ids = state.ids.write().unwrap();
    if let Some(previous) = state.joint_by_id.remove(&command.object_id) {
        remove_physics2d_joint(&mut state.world, &previous);
        ids.id_by_joint.remove(&get_joint_key(&previous));
        remove_sorted(&mut state.joint_ids, command.object_id);
    }
    add_physics2d_joint(&mut state.world, &joint);
    ids.id_by_joint
        .insert(get_joint_key(&joint), command.object_id);
    state.joint_by_id.insert(command.object_id, joint);
    insert_sorted(&mut state.joint_ids, command.object_id);
    state
        .broken_joints
        .retain(|broken| broken.id != command.object_id);
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_set_solver_config(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_SOLVER_CONFIG
        || command.object_id != 0
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let payload = command.payload;
    let flags = read_u32(command.bytes, payload);
    if flags & 0b111 != flags
        || read_u32(command.bytes, payload + 4) != 0
        || read_u32(command.bytes, payload + 24) != 0
        || read_u32(command.bytes, payload + 28) != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    // Physics2D's iteration counts are i32; a wire word above i32::MAX cannot be authored there.
    let count = |at: usize| i32::try_from(read_u32(command.bytes, payload + at));
    let (
        Ok(max_ccd_substeps),
        Ok(max_ccd_rotation_substeps),
        Ok(velocity_iterations),
        Ok(position_iterations),
    ) = (count(8), count(12), count(16), count(20))
    else {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    };
    let value = |i: usize| read_f64(command.bytes, payload + 32 + i * 8);
    if !are_finite(&[value(0), value(1), value(2), value(3), value(4), value(5)]) {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    let config = Physics2DSolverConfig {
        allow_sleeping: flags & PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_ALLOW_SLEEPING != 0,
        continuous_collision: flags & PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_CONTINUOUS_COLLISION != 0,
        max_ccd_rotation_substeps,
        max_ccd_substeps,
        penetration_slop: value(3) as f32,
        position_correction: value(4) as f32,
        position_iterations,
        restitution_threshold: value(5) as f32,
        sleep_angular_threshold: value(1) as f32,
        sleep_linear_threshold: value(0) as f32,
        time_to_sleep: value(2) as f32,
        velocity_iterations,
        warm_starting: flags & PHYSICS2D_ABI_SOLVER_CONFIG_FLAG_WARM_STARTING != 0,
    };
    if !is_physics2d_solver_config_valid(&config) {
        return Physics2DAbiExecutionStatus::RejectedMutation;
    }
    state.world.config = config;
    return Physics2DAbiExecutionStatus::Complete;
}

fn execute_wake_body(
    state: &mut ReferenceWorld,
    command: &CommandRecord,
) -> Physics2DAbiExecutionStatus {
    if command.byte_length != PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_WAKE_BODY
        || !is_object_id(command.object_id)
        || command.related_id != 0
    {
        return Physics2DAbiExecutionStatus::InvalidCommand;
    }
    let Some(body) = state.body_by_id.get(&command.object_id) else {
        return Physics2DAbiExecutionStatus::MissingBody;
    };
    wake_physics2d_body(&mut body.write().unwrap());
    return Physics2DAbiExecutionStatus::Complete;
}

fn fail_execution(
    out: &mut Physics2DAbiExecutionResult,
    status: Physics2DAbiExecutionStatus,
    command_index: u32,
    byte_offset: usize,
    command_kind: u32,
) -> bool {
    out.status = status;
    out.command_index = command_index;
    out.byte_offset = byte_offset;
    out.command_kind = command_kind;
    return false;
}

fn get_collider_id(
    ids: &ReferenceIds,
    world: &Physics2DWorld,
    body_index: i32,
    collider_index: usize,
) -> u32 {
    let Some(body) = world.body_by_index.get(&body_index) else {
        return 0;
    };
    let body = body.read().unwrap();
    let Some(collider) = body.colliders.get(collider_index) else {
        return 0;
    };
    return ids
        .id_by_collider
        .get(&get_collider_key(collider))
        .copied()
        .unwrap_or(0);
}

fn get_collider_key(collider: &Ref<Physics2DCollider>) -> usize {
    return Arc::as_ptr(collider) as *const () as usize;
}

fn get_contact_capacity(out: &Physics2DAbiContactBuffer) -> usize {
    return (out.ids.len() / PHYSICS2D_ABI_CONTACT_ID_STRIDE)
        .min(out.flags.len())
        .min(out.point_starts.len())
        .min(out.point_counts.len())
        .min(out.values.len() / PHYSICS2D_ABI_CONTACT_VALUE_STRIDE);
}

fn get_entry(state: &ReferenceAbiStateRef, handle: u32) -> Option<Arc<ReferenceWorldEntry>> {
    return lock(state).worlds.get(&handle).cloned();
}

// Which flag bits a joint record may set, by kind. Anything outside the mask is InvalidCommand.
fn get_joint_flag_mask(kind: u32) -> u32 {
    let common = PHYSICS2D_ABI_JOINT_FLAG_COLLIDE_CONNECTED;
    if kind == PHYSICS2D_ABI_JOINT_KIND_REVOLUTE || kind == PHYSICS2D_ABI_JOINT_KIND_PRISMATIC {
        return common
            | PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR
            | PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT
            | PHYSICS2D_ABI_JOINT_FLAG_ENABLE_LIMIT_SPRING;
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_WHEEL {
        return common | PHYSICS2D_ABI_JOINT_FLAG_ENABLE_MOTOR;
    }
    if kind == PHYSICS2D_ABI_JOINT_KIND_GEAR {
        return common
            | PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_A
            | PHYSICS2D_ABI_JOINT_FLAG_LINEAR_COORDINATE_B;
    }
    return common;
}

fn get_joint_key(joint: &Physics2DJointRef) -> usize {
    return Arc::as_ptr(joint) as *const () as usize;
}

fn get_query_capacity(out: &Physics2DAbiQueryBuffer) -> usize {
    return out
        .body_ids
        .len()
        .min(out.collider_ids.len())
        .min(out.values.len() / PHYSICS2D_ABI_QUERY_VALUE_STRIDE);
}

// The entry of a live world that is not mid-step; reads and queries refuse otherwise.
fn get_ready_entry(state: &ReferenceAbiStateRef, handle: u32) -> Option<Arc<ReferenceWorldEntry>> {
    let entry = get_entry(state, handle)?;
    if entry.stepping.load(Ordering::SeqCst) {
        return None;
    }
    return Some(entry);
}

fn has_hook_capacity(buffer: &Physics2DAbiContactBuffer) -> bool {
    return get_contact_capacity(buffer) >= 1
        && buffer.point_feature_ids.len() >= PHYSICS2D_ABI_MAX_CONTACT_POINTS
        && buffer.point_values.len()
            >= PHYSICS2D_ABI_MAX_CONTACT_POINTS * PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE;
}

fn insert_sorted(values: &mut Vec<u32>, value: u32) {
    let mut at = values.len();
    while at > 0 && values[at - 1] > value {
        at -= 1;
    }
    values.insert(at, value);
}

// Hands one contact to a hook through the shared buffer, then reads back the three fields a hook
// may change. A non-finite friction or restitution is a programmer error (RangeError).
fn invoke_contact_hook(
    ids: &ReferenceIds,
    world: &Physics2DWorld,
    contact: &mut Physics2DContact,
    buffer: &Ref<Physics2DAbiContactBuffer>,
    hook: &Physics2DAbiContactHook,
) {
    let mut buffer = buffer.write().unwrap();
    clear_contact_buffer(&mut buffer);
    write_contact(ids, world, contact, &mut buffer, 0, 0);
    buffer.count = 1;
    buffer.point_count = contact.point_count.min(PHYSICS2D_ABI_MAX_CONTACT_POINTS);
    buffer.required_count = 1;
    buffer.required_point_count = contact.point_count;
    hook(&mut buffer);

    let enabled = buffer.flags[0] & PHYSICS2D_ABI_CONTACT_FLAG_ENABLED != 0;
    // Row zero: a hook is handed exactly one contact.
    let friction = buffer.values[PHYSICS2D_ABI_CONTACT_VALUE_FRICTION];
    let restitution = buffer.values[PHYSICS2D_ABI_CONTACT_VALUE_RESTITUTION];
    if !friction.is_finite() || !restitution.is_finite() {
        throw_range_error("Physics2D ABI contact hook wrote a non-finite friction or restitution");
    }
    contact.enabled = enabled;
    contact.friction = friction as f32;
    contact.restitution = restitution as f32;
}

fn is_body_value_block_valid(values: &[f64; PHYSICS2D_ABI_BODY_VALUE_STRIDE]) -> bool {
    return are_finite(values) && values[13] >= 0.0 && values[14] >= 0.0 && values[16] >= 0.0;
}

fn is_break_threshold_valid(value: f64) -> bool {
    return !value.is_nan() && value >= 0.0;
}

fn is_command_buffer_valid(commands: &Physics2DAbiCommandBuffer) -> bool {
    if commands.byte_length < PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH
        || commands.byte_length > commands.data.len()
    {
        return false;
    }
    return read_u32(&commands.data, 0) == PHYSICS2D_ABI_COMMAND_MAGIC
        && read_u32(&commands.data, 4) == PHYSICS2D_ABI_VERSION
        && read_u32(&commands.data, 8) as usize == commands.byte_length
        && read_u32(&commands.data, 12) == commands.command_count;
}

fn is_joint_value_block_valid(
    common: &[f64; 6],
    values: &[f64; PHYSICS2D_ABI_JOINT_KIND_VALUE_COUNT],
) -> bool {
    if !are_finite(values) || !are_finite(&common[0..4]) {
        return false;
    }
    return is_break_threshold_valid(common[4]) && is_break_threshold_valid(common[5]);
}

fn is_object_id(value: u32) -> bool {
    return value > 0;
}

// Matches the Physics2D step validator rather than the manifold validator: point and segment
// colliders are legal authored state even though they have no contact-manifold path.
fn is_shape_state_valid(shape: &CollisionShape2D) -> bool {
    return match shape {
        CollisionShape2D::Circle(s) => s.radius > 0.0,
        CollisionShape2D::Aabb(s) => s.max_x > s.min_x && s.max_y > s.min_y,
        CollisionShape2D::Obb(s) => s.half_w > 0.0 && s.half_h > 0.0,
        CollisionShape2D::Capsule(s) => s.radius > 0.0,
        CollisionShape2D::Polygon(s) => s.points.len() >= 6 && s.points.len() % 2 == 0,
        CollisionShape2D::Segment(_) | CollisionShape2D::Point(_) => true,
    };
}

// Locks a mutex, recovering it after a panic: a hook's throw unwinds through a step that holds the
// world lock, and the world stays usable afterwards as it does in the source (D10).
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    return mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
}

fn read_bodies(state: &ReferenceWorld, body_ids: Option<&[u32]>, out: &mut Physics2DAbiBodyBuffer) {
    let capacity = out
        .ids
        .len()
        .min(out.flags.len())
        .min(out.values.len() / PHYSICS2D_ABI_BODY_VALUE_STRIDE);
    let mut written = 0;
    let mut required = 0;
    let ids: &[u32] = match body_ids {
        Some(ids) => ids,
        None => &state.body_ids,
    };
    for id in ids {
        let Some(body) = state.body_by_id.get(id) else {
            continue;
        };
        required += 1;
        if written < capacity {
            write_body(*id, &body.read().unwrap(), out, written);
            written += 1;
        }
    }
    out.count = written;
    out.required_count = required;
}

fn read_contacts(
    state: &ReferenceWorld,
    selection: Physics2DAbiContactSelection,
    out: &mut Physics2DAbiContactBuffer,
) {
    let source = match selection {
        Physics2DAbiContactSelection::Began => &state.world.events.began,
        Physics2DAbiContactSelection::Ended => &state.world.events.ended,
        Physics2DAbiContactSelection::All => &state.world.contacts,
    };
    let capacity = get_contact_capacity(out);
    let point_capacity = out
        .point_feature_ids
        .len()
        .min(out.point_values.len() / PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE);
    clear_contact_buffer(out);
    let ids = state.ids.read().unwrap();
    let mut written = 0;
    let mut points_written = 0;
    let mut required_points = 0;
    // Once one contact does not fit, publishing stops: skipping it would publish a SUBSEQUENCE while
    // `count` claims a prefix, so a grown buffer would read a different set rather than a superset.
    let mut prefix_fits = true;
    for contact in source {
        let contact = contact.read().unwrap();
        required_points += contact.point_count;
        if !prefix_fits
            || written >= capacity
            || points_written + contact.point_count > point_capacity
        {
            prefix_fits = false;
            continue;
        }
        write_contact(&ids, &state.world, &contact, out, written, points_written);
        points_written += contact.point_count;
        written += 1;
    }
    out.count = written;
    out.point_count = points_written;
    out.required_count = source.len();
    out.required_point_count = required_points;
}

fn read_f64_values(out: &mut [f64], command: &CommandRecord, payload_offset: usize) {
    let at = command.payload + payload_offset;
    for (i, value) in out.iter_mut().enumerate() {
        *value = read_f64(command.bytes, at + i * 8);
    }
}

// Reading consumes the broken-joint events: each is published once.
fn read_joints(state: &mut ReferenceWorld, out: &mut Physics2DAbiJointBuffer) {
    let capacity = out
        .ids
        .len()
        .min(out.flags.len())
        .min(out.values.len() / PHYSICS2D_ABI_JOINT_VALUE_STRIDE);
    let mut written = 0;
    let dt = state.last_step_dt as f32;
    for id in &state.joint_ids {
        let Some(joint) = state.joint_by_id.get(id) else {
            continue;
        };
        if written < capacity {
            let at = written * PHYSICS2D_ABI_JOINT_VALUE_STRIDE;
            let reported = write_physics2d_joint_reaction(
                &mut state.reaction,
                &state.world,
                &*joint.read().unwrap(),
                dt,
            );
            out.ids[written] = *id;
            out.flags[written] = 0;
            out.values[at] = if reported {
                f64::from(state.reaction.force_x)
            } else {
                0.0
            };
            out.values[at + 1] = if reported {
                f64::from(state.reaction.force_y)
            } else {
                0.0
            };
            out.values[at + 2] = if reported {
                f64::from(state.reaction.torque)
            } else {
                0.0
            };
        }
        written += 1;
    }
    for broken in &state.broken_joints {
        if written < capacity {
            let at = written * PHYSICS2D_ABI_JOINT_VALUE_STRIDE;
            out.ids[written] = broken.id;
            out.flags[written] = PHYSICS2D_ABI_JOINT_FLAG_BROKEN;
            out.values[at] = f64::from(broken.force_x);
            out.values[at + 1] = f64::from(broken.force_y);
            out.values[at + 2] = f64::from(broken.torque);
        }
        written += 1;
    }
    out.required_count = written;
    out.count = written.min(capacity);
    state.broken_joints.clear();
}

fn read_shape(command: &CommandRecord, at: usize) -> Option<CollisionShape2D> {
    let end = command.start + command.byte_length;
    if at + PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH > end {
        return None;
    }
    let kind = read_u32(command.bytes, at);
    let scalar_count = read_u32(command.bytes, at + 4) as usize;
    let integer_count = read_u32(command.bytes, at + 8);
    let version = read_u32(command.bytes, at + 12);
    // No 2D built-in carries integers or a payload version; refusing a non-zero value lets a future
    // kind that does be introduced without an older reader accepting a tail it never read.
    if integer_count != 0 || version != 0 {
        return None;
    }
    let scalars_at = at + PHYSICS2D_ABI_SHAPE_HEADER_BYTE_LENGTH;
    if scalars_at + scalar_count * 8 != end {
        return None;
    }
    let scalars: Vec<f64> = (0..scalar_count)
        .map(|i| read_f64(command.bytes, scalars_at + i * 8))
        .collect();
    if !are_finite(&scalars) {
        return None;
    }
    let s = |i: usize| scalars[i] as f32;
    return match (kind, scalar_count) {
        (PHYSICS2D_ABI_SHAPE_KIND_CIRCLE, 3) => Some(CollisionShape2D::Circle(CollisionCircle2D {
            x: scalars[0],
            y: scalars[1],
            radius: scalars[2],
        })),
        (PHYSICS2D_ABI_SHAPE_KIND_AABB, 4) => Some(CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: s(0),
            min_y: s(1),
            max_x: s(2),
            max_y: s(3),
        })),
        (PHYSICS2D_ABI_SHAPE_KIND_OBB, 5) => Some(CollisionShape2D::Obb(CollisionObb2D {
            x: s(0),
            y: s(1),
            half_w: s(2),
            half_h: s(3),
            rotation: s(4),
        })),
        (PHYSICS2D_ABI_SHAPE_KIND_CAPSULE, 5) => {
            Some(CollisionShape2D::Capsule(CollisionCapsule2D {
                x0: s(0),
                y0: s(1),
                x1: s(2),
                y1: s(3),
                radius: s(4),
            }))
        }
        (PHYSICS2D_ABI_SHAPE_KIND_POLYGON, count) if count % 2 == 0 => {
            Some(CollisionShape2D::Polygon(CollisionPolygon2D {
                points: scalars,
            }))
        }
        (PHYSICS2D_ABI_SHAPE_KIND_SEGMENT, 4) => {
            Some(CollisionShape2D::Segment(CollisionSegment2D {
                x0: s(0),
                y0: s(1),
                x1: s(2),
                y1: s(3),
            }))
        }
        (PHYSICS2D_ABI_SHAPE_KIND_POINT, 2) => Some(CollisionShape2D::Point(CollisionPoint2D {
            x: s(0),
            y: s(1),
        })),
        _ => None,
    };
}

fn remove_sorted(values: &mut Vec<u32>, value: u32) {
    if let Some(at) = values.iter().position(|candidate| *candidate == value) {
        values.remove(at);
    }
}

fn step_reference_world(
    entry: &ReferenceWorldEntry,
    dt: f64,
    hooks: Option<&Physics2DAbiContactHooks>,
) -> Physics2DAbiStepStatus {
    if let Some(hooks) = hooks {
        if (hooks.pre_solve.is_some() || hooks.post_solve.is_some())
            && !has_hook_capacity(&hooks.buffer.read().unwrap())
        {
            return Physics2DAbiStepStatus::InsufficientHookBuffer;
        }
    }
    let mut state = lock(&entry.state);
    if !can_step(&state.world, dt) {
        return Physics2DAbiStepStatus::Declined;
    }
    state.world.contact_hooks.pre_solve = hooks.and_then(|hooks| {
        let hook = hooks.pre_solve.clone()?;
        return Some(wrap_contact_hook(
            state.ids.clone(),
            hooks.buffer.clone(),
            hook,
        ));
    });
    state.world.contact_hooks.post_solve = hooks.and_then(|hooks| {
        let hook = hooks.post_solve.clone()?;
        return Some(wrap_contact_hook(
            state.ids.clone(),
            hooks.buffer.clone(),
            hook,
        ));
    });
    entry.stepping.store(true, Ordering::SeqCst);
    let registry = state.registry.clone();
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        step_physics2d(&mut state.world, dt, &registry, None);
    }));
    // The source's `finally`: the world is released and the hooks detached even when one throws.
    entry.stepping.store(false, Ordering::SeqCst);
    state.world.contact_hooks.pre_solve = None;
    state.world.contact_hooks.post_solve = None;
    if let Err(payload) = outcome {
        drop(state);
        resume_unwind(payload);
    }
    state.last_step_dt = dt;
    collect_broken_joints(&mut state);
    return Physics2DAbiStepStatus::Complete;
}

fn wrap_contact_hook(
    ids: Arc<RwLock<ReferenceIds>>,
    buffer: Ref<Physics2DAbiContactBuffer>,
    hook: Physics2DAbiContactHook,
) -> Physics2DContactCallback {
    return Arc::new(
        move |world: &Physics2DWorld, contact: &mut Physics2DContact| {
            invoke_contact_hook(&ids.read().unwrap(), world, contact, &buffer, &hook);
        },
    );
}

fn write_body(id: u32, body: &RigidBody2D, out: &mut Physics2DAbiBodyBuffer, at: usize) {
    out.ids[at] = id;
    out.flags[at] = encode_body_flags(body);
    let base = at * PHYSICS2D_ABI_BODY_VALUE_STRIDE;
    let values = [
        f64::from(body.x),
        f64::from(body.y),
        f64::from(body.angle),
        f64::from(body.velocity_x),
        f64::from(body.velocity_y),
        f64::from(body.angular_velocity),
        f64::from(body.force_x),
        f64::from(body.force_y),
        f64::from(body.torque),
        f64::from(body.mass),
        f64::from(body.inertia),
        f64::from(body.center_x),
        f64::from(body.center_y),
        f64::from(body.linear_damping),
        f64::from(body.angular_damping),
        f64::from(body.gravity_scale),
        body.sleep_timer,
    ];
    out.values[base..base + PHYSICS2D_ABI_BODY_VALUE_STRIDE].copy_from_slice(&values);
}

fn write_contact(
    ids: &ReferenceIds,
    world: &Physics2DWorld,
    contact: &Physics2DContact,
    out: &mut Physics2DAbiContactBuffer,
    at: usize,
    point_start: usize,
) {
    let id_base = at * PHYSICS2D_ABI_CONTACT_ID_STRIDE;
    out.ids[id_base] = ids
        .id_by_body_index
        .get(&contact.body_a)
        .copied()
        .unwrap_or(0);
    out.ids[id_base + 1] = ids
        .id_by_body_index
        .get(&contact.body_b)
        .copied()
        .unwrap_or(0);
    out.ids[id_base + 2] = get_collider_id(ids, world, contact.body_a, contact.collider_a);
    out.ids[id_base + 3] = get_collider_id(ids, world, contact.body_b, contact.collider_b);

    let mut flags = 0;
    if contact.enabled {
        flags |= PHYSICS2D_ABI_CONTACT_FLAG_ENABLED;
    }
    if contact.sensor {
        flags |= PHYSICS2D_ABI_CONTACT_FLAG_SENSOR;
    }
    if contact.touching {
        flags |= PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING;
    }
    out.flags[at] = flags;

    let value_base = at * PHYSICS2D_ABI_CONTACT_VALUE_STRIDE;
    out.values[value_base] = f64::from(contact.normal_x);
    out.values[value_base + 1] = f64::from(contact.normal_y);
    out.values[value_base + 2] = f64::from(contact.friction);
    out.values[value_base + 3] = f64::from(contact.restitution);

    out.point_starts[at] = point_start as u32;
    let point_count = contact.point_count.min(PHYSICS2D_ABI_MAX_CONTACT_POINTS);
    out.point_counts[at] = point_count as u32;
    for i in 0..point_count {
        let point = &contact.points[i];
        let point_base = (point_start + i) * PHYSICS2D_ABI_CONTACT_POINT_VALUE_STRIDE;
        // A manifold feature id is a 32-bit packed key in the source (Uint32Array slot).
        out.point_feature_ids[point_start + i] = point.feature_id as u32;
        out.point_values[point_base] = f64::from(point.x);
        out.point_values[point_base + 1] = f64::from(point.y);
        out.point_values[point_base + 2] = f64::from(point.depth);
        out.point_values[point_base + 3] = f64::from(point.r_ax);
        out.point_values[point_base + 4] = f64::from(point.r_ay);
        out.point_values[point_base + 5] = f64::from(point.r_bx);
        out.point_values[point_base + 6] = f64::from(point.r_by);
    }
}

fn write_query_hits(state: &ReferenceWorld, out: &mut Physics2DAbiQueryBuffer) {
    let capacity = get_query_capacity(out);
    let written = state.query.hit_count.min(capacity);
    let ids = state.ids.read().unwrap();
    for i in 0..written {
        write_query_identity(&ids, &state.query.hits[i], out, i);
        clear_query_values(out, i);
    }
    out.count = written;
    out.required_count = state.query.hit_count;
}

fn write_query_identity(
    ids: &ReferenceIds,
    hit: &Physics2DQueryHit,
    out: &mut Physics2DAbiQueryBuffer,
    at: usize,
) {
    let body_index = hit.body.read().unwrap().index;
    out.body_ids[at] = ids.id_by_body_index.get(&body_index).copied().unwrap_or(0);
    out.collider_ids[at] = ids
        .id_by_collider
        .get(&get_collider_key(&hit.collider))
        .copied()
        .unwrap_or(0);
}

fn write_query_values(
    out: &mut Physics2DAbiQueryBuffer,
    at: usize,
    fraction: f32,
    x: f32,
    y: f32,
    normal_x: f32,
    normal_y: f32,
) {
    let base = at * PHYSICS2D_ABI_QUERY_VALUE_STRIDE;
    out.values[base] = f64::from(fraction);
    out.values[base + 1] = f64::from(x);
    out.values[base + 2] = f64::from(y);
    out.values[base + 3] = f64::from(normal_x);
    out.values[base + 4] = f64::from(normal_y);
}

fn write_ray_hits(state: &ReferenceWorld, out: &mut Physics2DAbiQueryBuffer) {
    let capacity = get_query_capacity(out);
    let written = state.ray.hit_count.min(capacity);
    let ids = state.ids.read().unwrap();
    for i in 0..written {
        let hit = &state.ray.hits[i];
        let body_index = hit.body.read().unwrap().index;
        out.body_ids[i] = ids.id_by_body_index.get(&body_index).copied().unwrap_or(0);
        out.collider_ids[i] = ids
            .id_by_collider
            .get(&get_collider_key(&hit.collider))
            .copied()
            .unwrap_or(0);
        write_query_values(
            out,
            i,
            hit.fraction,
            hit.x,
            hit.y,
            hit.normal_x,
            hit.normal_y,
        );
    }
    out.count = written;
    out.required_count = state.ray.hit_count;
}

fn write_shape_cast_hit(state: &ReferenceWorld, out: &mut Physics2DAbiQueryBuffer) {
    let result = &state.shape_cast;
    if !result.hit || get_query_capacity(out) < 1 {
        out.count = 0;
        out.required_count = usize::from(result.hit);
        return;
    }
    let ids = state.ids.read().unwrap();
    out.body_ids[0] = result
        .body
        .as_ref()
        .and_then(|body| {
            ids.id_by_body_index
                .get(&body.read().unwrap().index)
                .copied()
        })
        .unwrap_or(0);
    out.collider_ids[0] = result
        .collider
        .as_ref()
        .and_then(|collider| ids.id_by_collider.get(&get_collider_key(collider)).copied())
        .unwrap_or(0);
    write_query_values(
        out,
        0,
        result.fraction,
        result.x,
        result.y,
        result.normal_x,
        result.normal_y,
    );
    out.count = 1;
    out.required_count = 1;
}
