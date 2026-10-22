//! physics2d-owned declarations (TS `Physics2D.ts`): rigid bodies, colliders, contacts, the world,
//! the open joint family and its solver records, queries, explanations and debug geometry.
//!
//! Shared identity: bodies, colliders, contacts and joints are `Ref` handles, because the source
//! compares and returns the same objects (contact events hold the contacts the world holds). The
//! source's module ownership maps become private per-entity links to the owner's durable identity
//! token (D5: no globals): bodies and joints point at their world's, colliders at their body's.

// flight-lint: allow-file(contract-vocabulary) D16 open Physics2D joint family and its solver callback records; contact hooks, guards and spatial backends are named Arc callbacks

use std::any::Any;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, RwLock};

use flight_collision::CollisionShape2D;
use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_spatial::SpatialIndexBackend2D;

/// The current serialized world layout (TS `Physics2DWorldVersion`).
pub const PHYSICS2D_WORLD_VERSION: u32 = 2;

/// How a body participates in the simulation (TS `Physics2DBodyType`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DBodyType {
    Dynamic,
    Kinematic,
    Static,
}

/// The surface properties a contact is resolved with (TS `Physics2DMaterial`). Plain record.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics2DMaterial {
    pub density: f32,
    pub friction: f32,
    pub restitution: f32,
}

/// Which other colliders one collider may contact (TS `Physics2DCollisionFilter`). Plain record;
/// the bits are the source's 32-bit integer masks.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Physics2DCollisionFilter {
    pub category_bits: u32,
    pub mask_bits: u32,
    pub group_index: i32,
}

/// One piece of a body's shape (TS `Physics2DCollider`): its LOCAL-space shape and the world-space
/// copy the step rewrites. Call `invalidate_physics2d_collider` after mutating the authored fields.
pub struct Physics2DCollider {
    runtime: EntityRuntimeSlot,
    /// The owning body's identity token (TS `colliderOwners` WeakMap value). A durable token rather
    /// than a weak body link, so ownership is never released while the collider lives.
    pub(crate) owner: Option<Arc<Physics2DBodyIdentity>>,
    pub filter: Physics2DCollisionFilter,
    pub local: CollisionShape2D,
    pub material: Physics2DMaterial,
    pub sensor: bool,
    /// The world-space shape, rewritten every step; its kind may differ from `local`'s (an aabb
    /// local shape carries an obb world shape).
    pub world: CollisionShape2D,
}

/// The mass properties derived from a body's colliders (TS `Physics2DMassData`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DMassData {
    pub center_x: f32,
    pub center_y: f32,
    pub inertia: f32,
    pub mass: f32,
}

/// A rigid body (TS `RigidBody2D`). `index` is the persistent identity the world assigns (`-1`
/// until inserted); `angle` is in radians.
// flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
pub struct RigidBody2D {
    runtime: EntityRuntimeSlot,
    pub(crate) identity: Arc<Physics2DBodyIdentity>,
    pub(crate) owner: Option<Arc<Physics2DWorldIdentity>>,
    pub angle: f32,
    pub angular_damping: f32,
    pub angular_velocity: f32,
    pub body_type: Physics2DBodyType,
    pub bullet: bool,
    pub center_x: f32,
    pub center_y: f32,
    pub colliders: Vec<Ref<Physics2DCollider>>,
    pub fixed_rotation: bool,
    pub force_x: f32,
    pub force_y: f32,
    pub gravity_scale: f32,
    pub index: i32,
    pub inertia: f32,
    pub inverse_inertia: f32,
    pub inverse_mass: f32,
    pub linear_damping: f32,
    pub mass: f32,
    pub sleep_enabled: bool,
    pub sleep_timer: f64,
    pub sleeping: bool,
    pub torque: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub x: f32,
    pub y: f32,
}

/// One point of a persistent contact with its warm-start impulses (TS `Physics2DContactPoint`).
/// Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DContactPoint {
    pub bias: f32,
    pub depth: f32,
    pub feature_id: i64,
    pub normal_impulse: f32,
    pub normal_mass: f32,
    pub r_ax: f32,
    pub r_ay: f32,
    pub r_bx: f32,
    pub r_by: f32,
    pub tangent_impulse: f32,
    pub tangent_mass: f32,
    pub x: f32,
    pub y: f32,
}

/// A persistent contact between two colliders (TS `Physics2DContact`). Plain record held by shared
/// handle: the event lists and hooks see the same contacts the world holds. `body_a < body_b`.
#[derive(Clone, Debug, PartialEq)]
pub struct Physics2DContact {
    pub body_a: i32,
    pub body_b: i32,
    pub collider_a: usize,
    pub collider_b: usize,
    pub enabled: bool,
    pub friction: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    pub point_count: usize,
    pub points: Vec<Physics2DContactPoint>,
    pub restitution: f32,
    pub sensor: bool,
    pub touching: bool,
}

/// A shared persistent contact.
pub type Physics2DContactRef = Ref<Physics2DContact>;

/// A strict per-contact hook invoked by the step (TS `Physics2DContactCallback`). The contact is the
/// hook's sole mutation surface; the world is read-only to it.
pub type Physics2DContactCallback =
    Arc<dyn Fn(&Physics2DWorld, &mut Physics2DContact) + Send + Sync>;

/// The pre-solve and post-solve contact hooks (TS `Physics2DContactHooks`). Plain record.
#[derive(Clone, Default)]
pub struct Physics2DContactHooks {
    pub post_solve: Option<Physics2DContactCallback>,
    pub pre_solve: Option<Physics2DContactCallback>,
}

/// The sequential-impulse solver's tuning (TS `Physics2DSolverConfig`). Plain record.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics2DSolverConfig {
    pub allow_sleeping: bool,
    pub continuous_collision: bool,
    pub max_ccd_rotation_substeps: i32,
    pub max_ccd_substeps: i32,
    pub penetration_slop: f32,
    pub position_correction: f32,
    pub position_iterations: i32,
    pub restitution_threshold: f32,
    pub sleep_angular_threshold: f32,
    pub sleep_linear_threshold: f32,
    pub time_to_sleep: f32,
    pub velocity_iterations: i32,
    pub warm_starting: bool,
}

/// Optional overrides for `create_physics2d_solver_config`. Omitted fields keep the documented
/// solver defaults.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DSolverConfigOptions {
    pub allow_sleeping: Option<bool>,
    pub continuous_collision: Option<bool>,
    pub max_ccd_rotation_substeps: Option<i32>,
    pub max_ccd_substeps: Option<i32>,
    pub penetration_slop: Option<f32>,
    pub position_correction: Option<f32>,
    pub position_iterations: Option<i32>,
    pub restitution_threshold: Option<f32>,
    pub sleep_angular_threshold: Option<f32>,
    pub sleep_linear_threshold: Option<f32>,
    pub time_to_sleep: Option<f32>,
    pub velocity_iterations: Option<i32>,
    pub warm_starting: Option<bool>,
}

/// Whether a step can run (TS `Physics2DStepExplanation['status']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DStepStatus {
    InvalidStep,
    Ready,
}

/// The step's precondition flags as data (TS `Physics2DStepExplanation`). Plain record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Physics2DStepExplanation {
    pub body_state_valid: bool,
    pub contact_state_valid: bool,
    pub gravity_valid: bool,
    pub joint_state_valid: bool,
    pub position_iterations_valid: bool,
    pub previous_timestep_valid: bool,
    pub solver_config_valid: bool,
    pub status: Physics2DStepStatus,
    pub timestep_valid: bool,
    pub velocity_iterations_valid: bool,
}

/// The per-body identity a collider's private ownership link points at: it is what "this body"
/// means to a collider, and it holds no body data, so the link forms no cycle.
#[derive(Debug)]
pub(crate) struct Physics2DBodyIdentity;

/// The per-world identity the private ownership links point at: it is what "this world" means to
/// a body or joint, and it carries the stepping flag (TS `steppingPhysics2DWorlds`).
#[derive(Debug, Default)]
pub(crate) struct Physics2DWorldIdentity {
    pub(crate) stepping: AtomicBool,
}

/// Contact begin/end events of the last step (TS `Physics2DContactEvents`). Plain record.
#[derive(Clone, Default)]
pub struct Physics2DContactEvents {
    pub began: Vec<Physics2DContactRef>,
    pub ended: Vec<Physics2DContactRef>,
}

/// A 2D physics world (TS `Physics2DWorld`), stepped explicitly by `step_physics2d`.
// flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
pub struct Physics2DWorld {
    runtime: EntityRuntimeSlot,
    pub(crate) identity: Arc<Physics2DWorldIdentity>,
    pub bodies: Vec<Ref<RigidBody2D>>,
    pub body_by_index: HashMap<i32, Ref<RigidBody2D>>,
    pub config: Physics2DSolverConfig,
    pub contact_hooks: Physics2DContactHooks,
    pub contacts: Vec<Physics2DContactRef>,
    pub events: Physics2DContactEvents,
    pub gravity_x: f32,
    pub gravity_y: f32,
    pub index: SpatialIndexBackend2D,
    pub island_parents: HashMap<i32, i32>,
    pub island_sleep_timers: HashMap<i32, f64>,
    pub joint_collision_suppressions: HashMap<i32, HashMap<i32, u32>>,
    pub joint_events: Physics2DJointEvents,
    pub joint_solvers: HashMap<Kind, Physics2DJointSolverRef>,
    pub joints: Vec<Physics2DJointRef>,
    pub next_body_index: i32,
    pub previous_timestep: f64,
    pub solve_island_body_counts: Vec<usize>,
    pub solve_island_body_indices: Vec<usize>,
    pub solve_island_body_starts: Vec<usize>,
    pub solve_island_by_root: HashMap<i32, usize>,
    pub solve_island_contact_counts: Vec<usize>,
    pub solve_island_contact_indices: Vec<usize>,
    pub solve_island_contact_starts: Vec<usize>,
    pub solve_island_cursors: Vec<usize>,
    pub solve_island_joint_counts: Vec<usize>,
    pub solve_island_joint_indices: Vec<usize>,
    pub solve_island_joint_starts: Vec<usize>,
    pub solve_island_roots: Vec<i32>,
    pub version: u32,
}

/// The base fields every joint has (TS `Physics2DJoint`): the open kind, its two body indices and
/// anchors, the accumulated impulse block, the solve-time lever arms and the break thresholds.
/// A kind struct composes it as `fields` and dereferences to it.
#[derive(Clone, Debug)]
pub struct Physics2DJointFields {
    runtime: EntityRuntimeSlot,
    pub(crate) owner: Option<Arc<Physics2DWorldIdentity>>,
    /// Per-joint solve-time scratch (TS module `jointSolveStates`).
    pub(crate) solve_state: Option<Vec<f32>>,
    pub body_a: i32,
    pub body_b: i32,
    pub break_force: f32,
    pub break_torque: f32,
    pub collide_connected: bool,
    pub impulse0: f32,
    pub impulse1: f32,
    pub impulse2: f32,
    pub kind: Kind,
    pub local_anchor_ax: f32,
    pub local_anchor_ay: f32,
    pub local_anchor_bx: f32,
    pub local_anchor_by: f32,
    pub r_ax: f32,
    pub r_ay: f32,
    pub r_bx: f32,
    pub r_by: f32,
}

/// Any joint (TS `Physics2DJoint`, an open base contract). Implement it for a kind struct with
/// `impl_physics2d_joint!`, listing the kind's own number fields.
pub trait Physics2DJoint: flight_entity::Entity + Any + Send + Sync {
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn joint_fields(&self) -> &Physics2DJointFields;
    fn joint_fields_mut(&mut self) -> &mut Physics2DJointFields;

    /// Visits every number field the joint carries except the break thresholds (TS: the
    /// `for (const key in joint)` number scan of joint validation). The default visits the base
    /// fields; a kind adds its own.
    fn for_each_number_field(&self, visit: &mut dyn FnMut(f32)) {
        visit_physics2d_joint_base_number_fields(self.joint_fields(), visit);
    }
}

/// A shared joint of any kind.
pub type Physics2DJointRef = Ref<dyn Physics2DJoint>;

/// A joint that broke on the last step and the load it failed under (TS `Physics2DBrokenJoint`).
#[derive(Clone)]
pub struct Physics2DBrokenJoint {
    pub force_x: f32,
    pub force_y: f32,
    pub joint: Physics2DJointRef,
    pub torque: f32,
}

/// The joint events of the last step (TS `Physics2DJointEvents`). Plain record.
#[derive(Clone, Default)]
pub struct Physics2DJointEvents {
    pub broke: Vec<Physics2DBrokenJoint>,
}

/// A distance joint (TS `Physics2DDistanceJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DDistanceJoint {
    pub(crate) fields: Physics2DJointFields,
    pub damping_ratio: f32,
    pub frequency_hz: f32,
    pub length: f32,
}

/// A revolute joint (TS `Physics2DRevoluteJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DRevoluteJoint {
    pub(crate) fields: Physics2DJointFields,
    pub enable_limit: bool,
    pub enable_limit_spring: bool,
    pub enable_motor: bool,
    pub limit_damping_ratio: f32,
    pub limit_frequency_hz: f32,
    pub lower_angle: f32,
    pub max_motor_torque: f32,
    pub motor_impulse: f32,
    pub motor_speed: f32,
    pub reference_angle: f32,
    pub upper_angle: f32,
}

/// A weld joint (TS `Physics2DWeldJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DWeldJoint {
    pub(crate) fields: Physics2DJointFields,
    pub reference_angle: f32,
}

/// A rope joint (TS `Physics2DRopeJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DRopeJoint {
    pub(crate) fields: Physics2DJointFields,
    pub max_length: f32,
}

/// A pulley joint (TS `Physics2DPulleyJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DPulleyJoint {
    pub(crate) fields: Physics2DJointFields,
    pub constant: f32,
    pub ground_anchor_ax: f32,
    pub ground_anchor_ay: f32,
    pub ground_anchor_bx: f32,
    pub ground_anchor_by: f32,
    pub ratio: f32,
}

/// Which coordinate of a body a gear couples (TS `Physics2DGearCoordinateKind`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Physics2DGearCoordinateKind {
    #[default]
    Angular,
    Linear,
}

/// A gear joint (TS `Physics2DGearJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DGearJoint {
    pub(crate) fields: Physics2DJointFields,
    pub axis_ax: f32,
    pub axis_ay: f32,
    pub axis_bx: f32,
    pub axis_by: f32,
    pub constant: f32,
    pub coordinate_a: Physics2DGearCoordinateKind,
    pub coordinate_b: Physics2DGearCoordinateKind,
    pub ratio: f32,
}

/// A prismatic joint (TS `Physics2DPrismaticJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DPrismaticJoint {
    pub(crate) fields: Physics2DJointFields,
    pub enable_limit: bool,
    pub enable_limit_spring: bool,
    pub enable_motor: bool,
    pub limit_damping_ratio: f32,
    pub limit_frequency_hz: f32,
    pub local_axis_ax: f32,
    pub local_axis_ay: f32,
    pub lower_translation: f32,
    pub max_motor_force: f32,
    pub motor_impulse: f32,
    pub motor_speed: f32,
    pub reference_angle: f32,
    pub upper_translation: f32,
}

/// A wheel joint (TS `Physics2DWheelJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DWheelJoint {
    pub(crate) fields: Physics2DJointFields,
    pub damping_ratio: f32,
    pub enable_motor: bool,
    pub frequency_hz: f32,
    pub local_axis_ax: f32,
    pub local_axis_ay: f32,
    pub max_motor_torque: f32,
    pub motor_impulse: f32,
    pub motor_speed: f32,
    pub rest_translation: f32,
}

/// A mouse joint (TS `Physics2DMouseJoint`).
#[derive(Clone, Debug, Default)]
pub struct Physics2DMouseJoint {
    pub(crate) fields: Physics2DJointFields,
    pub damping_ratio: f32,
    pub frequency_hz: f32,
    pub max_force: f32,
    pub target_x: f32,
    pub target_y: f32,
}

/// The fields every joint factory reads (TS `Physics2DJointOptions`). Plain record.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DJointOptions {
    pub body_a: i32,
    pub body_b: i32,
    pub break_force: Option<f32>,
    pub break_torque: Option<f32>,
    pub collide_connected: Option<bool>,
    pub local_anchor_ax: Option<f32>,
    pub local_anchor_ay: Option<f32>,
    pub local_anchor_bx: Option<f32>,
    pub local_anchor_by: Option<f32>,
}

/// Options for `create_physics2d_distance_joint` (TS `Physics2DDistanceJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DDistanceJointOptions {
    pub base: Physics2DJointOptions,
    pub damping_ratio: Option<f32>,
    pub frequency_hz: Option<f32>,
    pub length: f32,
}

/// Options for `create_physics2d_revolute_joint` (TS `Physics2DRevoluteJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DRevoluteJointOptions {
    pub base: Physics2DJointOptions,
    pub enable_limit: Option<bool>,
    pub enable_limit_spring: Option<bool>,
    pub enable_motor: Option<bool>,
    pub limit_damping_ratio: Option<f32>,
    pub limit_frequency_hz: Option<f32>,
    pub lower_angle: Option<f32>,
    pub max_motor_torque: Option<f32>,
    pub motor_speed: Option<f32>,
    pub reference_angle: Option<f32>,
    pub upper_angle: Option<f32>,
}

/// Options for `create_physics2d_weld_joint` (TS `Physics2DWeldJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DWeldJointOptions {
    pub base: Physics2DJointOptions,
    pub reference_angle: Option<f32>,
}

/// Options for `create_physics2d_rope_joint` (TS `Physics2DRopeJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DRopeJointOptions {
    pub base: Physics2DJointOptions,
    pub max_length: f32,
}

/// Options for `create_physics2d_pulley_joint` (TS `Physics2DPulleyJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DPulleyJointOptions {
    pub base: Physics2DJointOptions,
    pub constant: f32,
    pub ground_anchor_ax: f32,
    pub ground_anchor_ay: f32,
    pub ground_anchor_bx: f32,
    pub ground_anchor_by: f32,
    pub ratio: Option<f32>,
}

/// Options for `create_physics2d_gear_joint` (TS `Physics2DGearJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DGearJointOptions {
    pub axis_ax: Option<f32>,
    pub axis_ay: Option<f32>,
    pub axis_bx: Option<f32>,
    pub axis_by: Option<f32>,
    pub base: Physics2DJointOptions,
    pub constant: f32,
    pub coordinate_a: Physics2DGearCoordinateKind,
    pub coordinate_b: Physics2DGearCoordinateKind,
    pub ratio: Option<f32>,
}

/// Options for `create_physics2d_prismatic_joint` (TS `Physics2DPrismaticJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DPrismaticJointOptions {
    pub base: Physics2DJointOptions,
    pub enable_limit: Option<bool>,
    pub enable_limit_spring: Option<bool>,
    pub enable_motor: Option<bool>,
    pub limit_damping_ratio: Option<f32>,
    pub limit_frequency_hz: Option<f32>,
    pub local_axis_ax: Option<f32>,
    pub local_axis_ay: Option<f32>,
    pub lower_translation: Option<f32>,
    pub max_motor_force: Option<f32>,
    pub motor_speed: Option<f32>,
    pub reference_angle: Option<f32>,
    pub upper_translation: Option<f32>,
}

/// Options for `create_physics2d_wheel_joint` (TS `Physics2DWheelJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DWheelJointOptions {
    pub base: Physics2DJointOptions,
    pub damping_ratio: Option<f32>,
    pub enable_motor: Option<bool>,
    pub frequency_hz: Option<f32>,
    pub local_axis_ax: Option<f32>,
    pub local_axis_ay: Option<f32>,
    pub max_motor_torque: Option<f32>,
    pub motor_speed: Option<f32>,
    pub rest_translation: Option<f32>,
}

/// Options for `create_physics2d_mouse_joint` (TS `Physics2DMouseJointOptions`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DMouseJointOptions {
    pub body: i32,
    pub break_force: Option<f32>,
    pub break_torque: Option<f32>,
    pub damping_ratio: Option<f32>,
    pub frequency_hz: Option<f32>,
    pub local_anchor_x: Option<f32>,
    pub local_anchor_y: Option<f32>,
    pub max_force: f32,
    pub target_x: f32,
    pub target_y: f32,
}

/// Prepares a joint's rows for this step (TS `Physics2DJointSolver.prepare`).
pub type Physics2DJointPrepare =
    Arc<dyn Fn(&Physics2DWorld, &mut dyn Physics2DJoint, f32) + Send + Sync>;

/// Solves one velocity iteration of a joint, or warm-starts it (TS `solve` / `warmStart`).
pub type Physics2DJointSolve = Arc<dyn Fn(&Physics2DWorld, &mut dyn Physics2DJoint) + Send + Sync>;

/// Reverses a joint's kind-specific fields when its ends swap, returning whether swapping is allowed
/// (TS `swapEnds`).
pub type Physics2DJointSwapEnds = Arc<dyn Fn(&mut dyn Physics2DJoint) -> bool + Send + Sync>;

/// Scales a joint's kind-specific accumulators across a timestep change (TS
/// `scaleAccumulatedImpulses`).
pub type Physics2DJointScaleImpulses = Arc<dyn Fn(&mut dyn Physics2DJoint, f32) + Send + Sync>;

/// Clears a joint's kind-specific accumulators (TS `clearAccumulatedImpulses`).
pub type Physics2DJointClearImpulses = Arc<dyn Fn(&mut dyn Physics2DJoint) + Send + Sync>;

/// Writes a joint's reaction force and torque, returning whether it has one (TS `writeReaction`).
pub type Physics2DJointWriteReaction = Arc<
    dyn Fn(&Physics2DWorld, &dyn Physics2DJoint, f32, &mut Physics2DJointReaction) -> bool
        + Send
        + Sync,
>;

/// A joint kind's solver (TS `Physics2DJointSolver`): named callbacks, the optional ones `None`.
#[derive(Clone)]
pub struct Physics2DJointSolver {
    pub clear_accumulated_impulses: Option<Physics2DJointClearImpulses>,
    pub keeps_bodies_awake: Option<bool>,
    pub prepare: Physics2DJointPrepare,
    pub scale_accumulated_impulses: Option<Physics2DJointScaleImpulses>,
    pub solve: Physics2DJointSolve,
    pub swap_ends: Option<Physics2DJointSwapEnds>,
    pub uses_body_a: Option<bool>,
    pub warm_start: Option<Physics2DJointSolve>,
    pub write_reaction: Option<Physics2DJointWriteReaction>,
}

/// A shared joint solver (TS solver object identity).
pub type Physics2DJointSolverRef = Arc<Physics2DJointSolver>;

/// One collider found by a world query (TS `Physics2DQueryHit`). Plain record.
#[derive(Clone)]
pub struct Physics2DQueryHit {
    pub body: Ref<RigidBody2D>,
    pub collider: Ref<Physics2DCollider>,
    pub collider_index: usize,
}

/// A reusable query result (TS `Physics2DQueryResult`). `hit_count` is the valid prefix of `hits`.
#[derive(Clone, Default)]
pub struct Physics2DQueryResult {
    runtime: EntityRuntimeSlot,
    pub hit_count: usize,
    pub hits: Vec<Physics2DQueryHit>,
}

/// Which bodies and colliders a query accepts (TS `Physics2DQueryFilter`). Plain record.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Physics2DQueryFilter {
    pub category_bits: u32,
    pub include_dynamic: bool,
    pub include_kinematic: bool,
    pub include_sensors: bool,
    pub include_static: bool,
    pub mask_bits: u32,
}

/// One collider a ray hit (TS `Physics2DRayHit`, a query hit plus the hit geometry). Plain record.
#[derive(Clone)]
pub struct Physics2DRayHit {
    pub body: Ref<RigidBody2D>,
    pub collider: Ref<Physics2DCollider>,
    pub collider_index: usize,
    pub fraction: f32,
    pub normal_x: f32,
    pub normal_y: f32,
    pub x: f32,
    pub y: f32,
}

/// A reusable ray query result (TS `Physics2DRayResult`). `hit_count` is the valid prefix.
#[derive(Clone, Default)]
pub struct Physics2DRayResult {
    runtime: EntityRuntimeSlot,
    pub hit_count: usize,
    pub hits: Vec<Physics2DRayHit>,
}

/// The first collider a swept shape hits (TS `Physics2DShapeCastResult`). `collider_index` is `-1`
/// without a hit.
#[derive(Clone, Default)]
pub struct Physics2DShapeCastResult {
    runtime: EntityRuntimeSlot,
    pub body: Option<Ref<RigidBody2D>>,
    pub collider: Option<Ref<Physics2DCollider>>,
    pub collider_index: i32,
    pub fraction: f32,
    pub hit: bool,
    pub normal_x: f32,
    pub normal_y: f32,
    pub x: f32,
    pub y: f32,
}

/// Whether every collider kind generates contacts (TS `Physics2DCollisionExplanation['status']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DCollisionStatus {
    MissingContactSupport,
    Ready,
}

/// The collider kinds that generate no contacts, as data (TS `Physics2DCollisionExplanation`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Physics2DCollisionExplanation {
    pub status: Physics2DCollisionStatus,
    pub unsupported_kinds: Vec<String>,
}

/// Why one joint is or is not solved (TS `Physics2DJointResolutionStatus`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DJointResolutionStatus {
    BodiesMissing,
    BodyAMissing,
    BodyBMissing,
    Ready,
    SolverUnregistered,
}

/// One joint's resolution (TS `Physics2DJointResolution`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Physics2DJointResolution {
    pub body_a: i32,
    pub body_a_found: bool,
    pub body_a_used: bool,
    pub body_b: i32,
    pub body_b_found: bool,
    pub joint_index: usize,
    pub kind: Kind,
    pub solver_registered: bool,
    pub status: Physics2DJointResolutionStatus,
}

/// Whether every joint is solved (TS `Physics2DJointResolutionExplanation['status']`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DJointResolutionExplanationStatus {
    Complete,
    UnresolvedJoints,
}

/// Every joint's resolution as data (TS `Physics2DJointResolutionExplanation`). Plain record.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Physics2DJointResolutionExplanation {
    pub joints: Vec<Physics2DJointResolution>,
    pub ready_count: usize,
    pub status: Physics2DJointResolutionExplanationStatus,
}

/// A joint's reaction force and torque (TS `Physics2DJointReaction`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics2DJointReaction {
    runtime: EntityRuntimeSlot,
    pub force_x: f32,
    pub force_y: f32,
    pub torque: f32,
}

/// Consulted when a step declines its preconditions (TS `Physics2DStepGuard`).
// flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
pub type Physics2DStepGuard = Arc<dyn Fn(&Physics2DWorld, f64) + Send + Sync>;

/// Consulted once per running step before contacts are built (TS `Physics2DContactIntakeGuard`).
pub type Physics2DContactIntakeGuard = Arc<dyn Fn(&Physics2DWorld) + Send + Sync>;

/// Consulted once per running step before joints are prepared (TS `Physics2DJointResolutionGuard`).
pub type Physics2DJointResolutionGuard = Arc<dyn Fn(&Physics2DWorld) + Send + Sync>;

/// The caller-owned diagnostics guards the step consults (D5: TS step.ts module guards and the
/// `enablePhysics2DGuards` flag).
#[derive(Clone, Default)]
pub struct Physics2DGuardState {
    pub contact_intake_guard: Option<Physics2DContactIntakeGuard>,
    pub enabled: bool,
    pub joint_resolution_guard: Option<Physics2DJointResolutionGuard>,
    pub step_guard: Option<Physics2DStepGuard>,
}

/// What a debug primitive draws (TS `Physics2DDebugFeature`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Physics2DDebugFeature {
    CenterOfMass,
    Collider,
    ContactNormal,
    Joint,
}

/// A debug line (TS `Physics2DDebugLine`). Plain record; `-1` marks an absent body.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics2DDebugLine {
    pub body_a: i32,
    pub body_b: i32,
    pub feature: Physics2DDebugFeature,
    pub x0: f32,
    pub x1: f32,
    pub y0: f32,
    pub y1: f32,
}

/// A debug circle (TS `Physics2DDebugCircle`). Plain record; `-1` marks an absent body.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics2DDebugCircle {
    pub body_a: i32,
    pub body_b: i32,
    pub feature: Physics2DDebugFeature,
    pub radius: f32,
    pub x: f32,
    pub y: f32,
}

/// Reusable debug geometry (TS `Physics2DDebugGeometry`). The counts are the valid prefixes.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics2DDebugGeometry {
    runtime: EntityRuntimeSlot,
    pub circle_count: usize,
    pub circles: Vec<Physics2DDebugCircle>,
    pub line_count: usize,
    pub lines: Vec<Physics2DDebugLine>,
}

/// Which debug features to draw and how large (TS `Partial<Physics2DDebugGeometryOptions>`); `None`
/// keeps the default.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics2DDebugGeometryOptions {
    pub center_of_mass_radius: Option<f32>,
    pub contact_normal_length: Option<f32>,
    pub draw_centers_of_mass: Option<bool>,
    pub draw_colliders: Option<bool>,
    pub draw_contacts: Option<bool>,
    pub draw_joints: Option<bool>,
    pub point_radius: Option<f32>,
}

/// Implements the joint family plumbing for a kind struct with a private
/// `fields: Physics2DJointFields` field: `Entity`, `Physics2DJoint` (visiting the listed own number
/// fields after the base ones) and `Deref`/`DerefMut` to `Physics2DJointFields`.
#[macro_export]
macro_rules! impl_physics2d_joint {
    ($t:ty, [$($field:ident),* $(,)?]) => {
        impl flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime(&self.fields);
            }

            fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
            }
        }

        impl $crate::contract::Physics2DJoint for $t {
            fn as_any(&self) -> &dyn std::any::Any {
                return self;
            }

            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                return self;
            }

            fn joint_fields(&self) -> &$crate::contract::Physics2DJointFields {
                return &self.fields;
            }

            fn joint_fields_mut(&mut self) -> &mut $crate::contract::Physics2DJointFields {
                return &mut self.fields;
            }

            fn for_each_number_field(&self, visit: &mut dyn FnMut(f32)) {
                $crate::contract::visit_physics2d_joint_base_number_fields(&self.fields, visit);
                $(visit(self.$field);)*
            }
        }

        impl std::ops::Deref for $t {
            type Target = $crate::contract::Physics2DJointFields;

            fn deref(&self) -> &$crate::contract::Physics2DJointFields {
                return &self.fields;
            }
        }

        impl std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::contract::Physics2DJointFields {
                return &mut self.fields;
            }
        }
    };
}

/// Visits the base joint's number fields except the break thresholds, which may be infinite (TS
/// joint validation's key scan over the base interface).
// flight-lint: allow(conform-extra) D16: the open joint family's structural number scan (TS `for (const key in joint)`)
pub fn visit_physics2d_joint_base_number_fields(
    fields: &Physics2DJointFields,
    visit: &mut dyn FnMut(f32),
) {
    visit(fields.body_a as f32);
    visit(fields.body_b as f32);
    visit(fields.local_anchor_ax);
    visit(fields.local_anchor_ay);
    visit(fields.local_anchor_bx);
    visit(fields.local_anchor_by);
    visit(fields.impulse0);
    visit(fields.impulse1);
    visit(fields.impulse2);
    visit(fields.r_ax);
    visit(fields.r_ay);
    visit(fields.r_bx);
    visit(fields.r_by);
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the source defaults a fresh joint's base fields
impl Default for Physics2DJointFields {
    fn default() -> Self {
        return Physics2DJointFields {
            runtime: EntityRuntimeSlot::default(),
            owner: None,
            solve_state: None,
            body_a: 0,
            body_b: 0,
            break_force: f32::INFINITY,
            break_torque: f32::INFINITY,
            collide_connected: false,
            impulse0: 0.0,
            impulse1: 0.0,
            impulse2: 0.0,
            kind: String::new(),
            local_anchor_ax: 0.0,
            local_anchor_ay: 0.0,
            local_anchor_bx: 0.0,
            local_anchor_by: 0.0,
            r_ax: 0.0,
            r_ay: 0.0,
            r_bx: 0.0,
            r_by: 0.0,
        };
    }
}

impl Default for Physics2DSolverConfig {
    fn default() -> Self {
        return Self {
            allow_sleeping: true,
            sleep_linear_threshold: 0.01,
            sleep_angular_threshold: (2.0 * std::f32::consts::PI) / 180.0,
            time_to_sleep: 0.5,
            velocity_iterations: 10,
            position_iterations: 3,
            penetration_slop: 0.005,
            position_correction: 0.2,
            restitution_threshold: 1.0,
            warm_starting: true,
            continuous_collision: true,
            max_ccd_substeps: 8,
            max_ccd_rotation_substeps: 64,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_rigid_body2d sets the source defaults
impl Default for RigidBody2D {
    fn default() -> Self {
        return RigidBody2D {
            runtime: EntityRuntimeSlot::default(),
            identity: Arc::new(Physics2DBodyIdentity),
            owner: None,
            angle: 0.0,
            angular_damping: 0.0,
            angular_velocity: 0.0,
            body_type: Physics2DBodyType::Dynamic,
            bullet: false,
            center_x: 0.0,
            center_y: 0.0,
            colliders: Vec::new(),
            fixed_rotation: false,
            force_x: 0.0,
            force_y: 0.0,
            gravity_scale: 1.0,
            index: -1,
            inertia: 0.0,
            inverse_inertia: 0.0,
            inverse_mass: 0.0,
            linear_damping: 0.0,
            mass: 0.0,
            sleep_enabled: true,
            sleep_timer: 0.0,
            sleeping: false,
            torque: 0.0,
            velocity_x: 0.0,
            velocity_y: 0.0,
            x: 0.0,
            y: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_physics2d_collider sets the authored values
impl Default for Physics2DCollider {
    fn default() -> Self {
        return Physics2DCollider {
            runtime: EntityRuntimeSlot::default(),
            owner: None,
            filter: Physics2DCollisionFilter {
                category_bits: 1,
                mask_bits: 0xffff_ffff,
                group_index: 0,
            },
            local: CollisionShape2D::Point(flight_collision::CollisionPoint2D::default()),
            material: Physics2DMaterial {
                density: 0.0,
                friction: 0.0,
                restitution: 0.0,
            },
            sensor: false,
            world: CollisionShape2D::Point(flight_collision::CollisionPoint2D::default()),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_physics2d_world sets the source defaults
impl Default for Physics2DWorld {
    fn default() -> Self {
        return Physics2DWorld {
            runtime: EntityRuntimeSlot::default(),
            identity: Arc::new(Physics2DWorldIdentity::default()),
            bodies: Vec::new(),
            body_by_index: HashMap::new(),
            config: crate::world::create_physics2d_solver_config(None),
            contact_hooks: Physics2DContactHooks::default(),
            contacts: Vec::new(),
            events: Physics2DContactEvents::default(),
            gravity_x: 0.0,
            gravity_y: -9.81,
            index: flight_spatial::create_uniform_grid_spatial_backend_2d(1.0),
            island_parents: HashMap::new(),
            island_sleep_timers: HashMap::new(),
            joint_collision_suppressions: HashMap::new(),
            joint_events: Physics2DJointEvents::default(),
            joint_solvers: HashMap::new(),
            joints: Vec::new(),
            next_body_index: 0,
            previous_timestep: 0.0,
            solve_island_body_counts: Vec::new(),
            solve_island_body_indices: Vec::new(),
            solve_island_body_starts: Vec::new(),
            solve_island_by_root: HashMap::new(),
            solve_island_contact_counts: Vec::new(),
            solve_island_contact_indices: Vec::new(),
            solve_island_contact_starts: Vec::new(),
            solve_island_cursors: Vec::new(),
            solve_island_joint_counts: Vec::new(),
            solve_island_joint_indices: Vec::new(),
            solve_island_joint_starts: Vec::new(),
            solve_island_roots: Vec::new(),
            version: PHYSICS2D_WORLD_VERSION,
        };
    }
}

flight_entity::impl_entity!(Physics2DCollider);
flight_entity::impl_entity!(RigidBody2D);
flight_entity::impl_entity!(Physics2DWorld);
flight_entity::impl_entity!(Physics2DJointFields);
flight_entity::impl_entity!(Physics2DQueryResult);
flight_entity::impl_entity!(Physics2DRayResult);
flight_entity::impl_entity!(Physics2DShapeCastResult);
flight_entity::impl_entity!(Physics2DJointReaction);
flight_entity::impl_entity!(Physics2DDebugGeometry);

impl_physics2d_joint!(
    Physics2DDistanceJoint,
    [damping_ratio, frequency_hz, length]
);
impl_physics2d_joint!(
    Physics2DRevoluteJoint,
    [
        limit_damping_ratio,
        limit_frequency_hz,
        lower_angle,
        max_motor_torque,
        motor_impulse,
        motor_speed,
        reference_angle,
        upper_angle,
    ]
);
impl_physics2d_joint!(Physics2DWeldJoint, [reference_angle]);
impl_physics2d_joint!(Physics2DRopeJoint, [max_length]);
impl_physics2d_joint!(
    Physics2DPulleyJoint,
    [
        constant,
        ground_anchor_ax,
        ground_anchor_ay,
        ground_anchor_bx,
        ground_anchor_by,
        ratio
    ]
);
impl_physics2d_joint!(
    Physics2DGearJoint,
    [axis_ax, axis_ay, axis_bx, axis_by, constant, ratio]
);
impl_physics2d_joint!(
    Physics2DPrismaticJoint,
    [
        limit_damping_ratio,
        limit_frequency_hz,
        local_axis_ax,
        local_axis_ay,
        lower_translation,
        max_motor_force,
        motor_impulse,
        motor_speed,
        reference_angle,
        upper_translation,
    ]
);
impl_physics2d_joint!(
    Physics2DWheelJoint,
    [
        damping_ratio,
        frequency_hz,
        local_axis_ax,
        local_axis_ay,
        max_motor_torque,
        motor_impulse,
        motor_speed,
        rest_translation,
    ]
);
impl_physics2d_joint!(
    Physics2DMouseJoint,
    [damping_ratio, frequency_hz, max_force, target_x, target_y]
);
