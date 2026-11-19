//! flight-compiler: rust-only

use std::any::Any;
use std::collections::{HashMap, HashSet};
use std::ops::{Deref, DerefMut};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Weak};

use flight_collision::{
    CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D, CollisionSphere3D,
};
use flight_entity::{Entity, EntityRuntimeSlot, Ref};
use flight_spatial::{SpatialIndexBackend3D, create_uniform_grid_spatial_backend_3d};

pub type Physics3DColliderRef = Ref<Physics3DCollider>;
pub type Physics3DContactRef = Ref<Physics3DContact>;
pub type Physics3DJointRef = Ref<dyn Physics3DJoint>;
pub type RigidBody3DRef = Ref<RigidBody3D>;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum Physics3DBodyType {
    #[default]
    Dynamic,
    Kinematic,
    Static,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics3DMaterial {
    pub density: f64,
    pub friction: f64,
    pub restitution: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Physics3DCollisionFilter {
    pub category_bits: u32,
    pub mask_bits: u32,
    pub group_index: i32,
}

pub struct Physics3DCollider {
    runtime: EntityRuntimeSlot,
    pub local: CollisionColliderShape3D,
    pub world: CollisionColliderShape3D,
    pub material: Physics3DMaterial,
    pub filter: Physics3DCollisionFilter,
    pub sensor: bool,
    pub(crate) owner: Option<Weak<std::sync::RwLock<RigidBody3D>>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DMassData {
    runtime: EntityRuntimeSlot,
    pub mass: f64,
    pub inertia_xx: f64,
    pub inertia_yy: f64,
    pub inertia_zz: f64,
    pub inertia_xy: f64,
    pub inertia_xz: f64,
    pub inertia_yz: f64,
    pub center_x: f64,
    pub center_y: f64,
    pub center_z: f64,
}

pub struct RigidBody3D {
    runtime: EntityRuntimeSlot,
    pub index: i32,
    pub body_type: Physics3DBodyType,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub orientation_x: f64,
    pub orientation_y: f64,
    pub orientation_z: f64,
    pub orientation_w: f64,
    pub velocity_x: f64,
    pub velocity_y: f64,
    pub velocity_z: f64,
    pub angular_velocity_x: f64,
    pub angular_velocity_y: f64,
    pub angular_velocity_z: f64,
    pub force_x: f64,
    pub force_y: f64,
    pub force_z: f64,
    pub torque_x: f64,
    pub torque_y: f64,
    pub torque_z: f64,
    pub mass: f64,
    pub inverse_mass: f64,
    pub inertia_xx: f64,
    pub inertia_yy: f64,
    pub inertia_zz: f64,
    pub inertia_xy: f64,
    pub inertia_xz: f64,
    pub inertia_yz: f64,
    pub inverse_inertia_xx: f64,
    pub inverse_inertia_yy: f64,
    pub inverse_inertia_zz: f64,
    pub inverse_inertia_xy: f64,
    pub inverse_inertia_xz: f64,
    pub inverse_inertia_yz: f64,
    pub inverse_inertia_world_xx: f64,
    pub inverse_inertia_world_yy: f64,
    pub inverse_inertia_world_zz: f64,
    pub inverse_inertia_world_xy: f64,
    pub inverse_inertia_world_xz: f64,
    pub inverse_inertia_world_yz: f64,
    pub center_x: f64,
    pub center_y: f64,
    pub center_z: f64,
    pub linear_damping: f64,
    pub angular_damping: f64,
    pub gravity_scale: f64,
    pub fixed_rotation: bool,
    pub bullet: bool,
    pub sleeping: bool,
    pub sleep_enabled: bool,
    pub sleep_timer: f64,
    pub colliders: Vec<Physics3DColliderRef>,
    pub(crate) owner: Option<Weak<AtomicBool>>,
}

// flight-lint: allow(contract-vocabulary) range |v| <= 2^53-1 (TS safe integer; built-in ids < 2^25, pre-solve callbacks may write any safe integer)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DContactPoint {
    runtime: EntityRuntimeSlot,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub depth: f64,
    pub feature_id: i64,
    pub r_ax: f64,
    pub r_ay: f64,
    pub r_az: f64,
    pub r_bx: f64,
    pub r_by: f64,
    pub r_bz: f64,
}

pub struct Physics3DContact {
    runtime: EntityRuntimeSlot,
    pub body_a: i32,
    pub body_b: i32,
    pub collider_a: usize,
    pub collider_b: usize,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
    pub point_count: usize,
    pub points: Vec<Physics3DContactPoint>,
    pub friction: f64,
    pub restitution: f64,
    pub enabled: bool,
    pub sensor: bool,
    pub touching: bool,
}

#[derive(Clone, Default)]
pub struct Physics3DContactEvents {
    pub began: Vec<Physics3DContactRef>,
    pub ended: Vec<Physics3DContactRef>,
}

pub type Physics3DContactCallback =
    Arc<dyn Fn(&mut Physics3DWorld, &Physics3DContactRef) + Send + Sync>;

pub type Physics3DStepGuard = Arc<dyn Fn(&Physics3DWorld, f64) + Send + Sync>;
pub type Physics3DContactIntakeGuard =
    Arc<dyn Fn(&Physics3DWorld, &CollisionRegistry3D) + Send + Sync>;
pub type Physics3DJointResolutionGuard = Arc<dyn Fn(&Physics3DWorld) + Send + Sync>;
pub type Physics3DSpatialIndexingGuard = Arc<dyn Fn(&Physics3DWorld) + Send + Sync>;

#[derive(Clone, Default)]
pub struct Physics3DGuardState {
    pub contact_intake_guard: Option<Physics3DContactIntakeGuard>,
    pub enabled: bool,
    pub joint_resolution_guard: Option<Physics3DJointResolutionGuard>,
    pub spatial_indexing_guard: Option<Physics3DSpatialIndexingGuard>,
    pub step_guard: Option<Physics3DStepGuard>,
}

#[derive(Clone, Default)]
pub struct Physics3DContactHooks {
    pub pre_solve: Option<Physics3DContactCallback>,
    pub post_solve: Option<Physics3DContactCallback>,
}

// flight-lint: allow(contract-vocabulary) range |v| <= 2^53-1 (TS safe integer; built-in ids < 2^25, pre-solve callbacks may write any safe integer)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DContactConstraintPoint {
    runtime: EntityRuntimeSlot,
    pub feature_id: i64,
    pub normal_impulse: f64,
    pub tangent_impulse0: f64,
    pub tangent_impulse1: f64,
    pub normal_mass: f64,
    pub tangent_mass0: f64,
    pub tangent_mass1: f64,
    pub bias: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DContactConstraint {
    runtime: EntityRuntimeSlot,
    pub contact: i32,
    pub tangent0_x: f64,
    pub tangent0_y: f64,
    pub tangent0_z: f64,
    pub tangent1_x: f64,
    pub tangent1_y: f64,
    pub tangent1_z: f64,
    pub point_count: usize,
    pub points: Vec<Physics3DContactConstraintPoint>,
}

#[derive(Default)]
pub struct Physics3DSequentialImpulseState {
    pub constraints: Vec<Physics3DContactConstraint>,
    pub constraint_by_contact: HashMap<usize, usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Physics3DSequentialImpulseConfig {
    pub velocity_iterations: usize,
    pub position_iterations: usize,
    pub penetration_slop: f64,
    pub position_correction: f64,
    pub restitution_threshold: f64,
    pub warm_starting: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics3DSequentialImpulseConfigOptions {
    pub velocity_iterations: Option<usize>,
    pub position_iterations: Option<usize>,
    pub penetration_slop: Option<f64>,
    pub position_correction: Option<f64>,
    pub restitution_threshold: Option<f64>,
    pub warm_starting: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Physics3DSolverConfig {
    pub allow_sleeping: bool,
    pub sleep_linear_threshold: f64,
    pub sleep_angular_threshold: f64,
    pub time_to_sleep: f64,
    pub substeps: usize,
    pub continuous_collision: bool,
    pub max_ccd_substeps: usize,
    pub max_ccd_rotation_substeps: usize,
    pub sequential_impulse: Physics3DSequentialImpulseConfig,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DSolverConfigOptions {
    pub allow_sleeping: Option<bool>,
    pub sleep_linear_threshold: Option<f64>,
    pub sleep_angular_threshold: Option<f64>,
    pub time_to_sleep: Option<f64>,
    pub substeps: Option<usize>,
    pub continuous_collision: Option<bool>,
    pub max_ccd_substeps: Option<usize>,
    pub max_ccd_rotation_substeps: Option<usize>,
    pub sequential_impulse: Option<Physics3DSequentialImpulseConfig>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Physics3DRotationalCcdEnvelope {
    pub angular_travel: f64,
    pub sample_count: usize,
    pub max_angular_increment: f64,
    pub max_point_arc_travel: f64,
    pub target_increment_met: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum Physics3DCollisionStatus {
    MissingSupport,
    #[default]
    Ready,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum Physics3DStepStatus {
    InvalidStep,
    #[default]
    Ready,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u32)]
pub enum Physics3DJointStatus {
    InvalidBodies,
    #[default]
    Solvable,
    UnregisteredKind,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Physics3DCollisionExplanation {
    pub unsupported_kinds: Vec<String>,
    pub status: Physics3DCollisionStatus,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Physics3DStepExplanation {
    pub body_state_valid: bool,
    pub collider_state_valid: bool,
    pub contact_state_valid: bool,
    pub gravity_valid: bool,
    pub joint_state_valid: bool,
    pub solver_config_valid: bool,
    pub substeps_valid: bool,
    pub timestep_valid: bool,
    pub velocity_iterations_valid: bool,
    pub position_iterations_valid: bool,
    pub status: Physics3DStepStatus,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Physics3DJointExplanation {
    pub kind: String,
    pub index: usize,
    pub has_solver: bool,
    pub bodies_resolvable: bool,
    pub status: Physics3DJointStatus,
}

pub struct Physics3DJointFields {
    runtime: EntityRuntimeSlot,
    pub kind: String,
    pub body_a: i32,
    pub body_b: i32,
    pub local_anchor_ax: f64,
    pub local_anchor_ay: f64,
    pub local_anchor_az: f64,
    pub local_anchor_bx: f64,
    pub local_anchor_by: f64,
    pub local_anchor_bz: f64,
    pub collide_connected: bool,
    pub break_force: f64,
    pub break_torque: f64,
    pub broken: bool,
    pub impulse0: f64,
    pub impulse1: f64,
    pub impulse2: f64,
    pub impulse3: f64,
    pub impulse4: f64,
    pub impulse5: f64,
    pub r_ax: f64,
    pub r_ay: f64,
    pub r_az: f64,
    pub r_bx: f64,
    pub r_by: f64,
    pub r_bz: f64,
    pub(crate) owner: Option<Weak<AtomicBool>>,
    pub(crate) solve_state: Option<Vec<f64>>,
}

pub trait Physics3DJoint: Entity + Any + Send + Sync {
    fn fields(&self) -> &Physics3DJointFields;
    fn fields_mut(&mut self) -> &mut Physics3DJointFields;
    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
    fn kind_fields_are_finite(&self) -> bool {
        return true;
    }
}

pub type Physics3DJointPrepare =
    Arc<dyn Fn(&mut Physics3DWorld, &Physics3DJointRef, f64) + Send + Sync>;
pub type Physics3DJointSolve =
    Arc<dyn Fn(&mut Physics3DWorld, &Physics3DJointRef, f64) + Send + Sync>;
pub type Physics3DJointUnary = Arc<dyn Fn(&Physics3DJointRef) + Send + Sync>;
pub type Physics3DJointWarmStart =
    Arc<dyn Fn(&mut Physics3DWorld, &Physics3DJointRef) + Send + Sync>;
pub type Physics3DJointSwapEnds = Arc<dyn Fn(&Physics3DJointRef) -> bool + Send + Sync>;
pub type Physics3DJointWriteReaction =
    Arc<dyn Fn(&Physics3DJointRef, f64, &mut Physics3DJointReaction) -> bool + Send + Sync>;

#[derive(Clone)]
pub struct Physics3DJointSolver {
    pub prepare: Physics3DJointPrepare,
    pub solve: Physics3DJointSolve,
    pub uses_body_a: Option<bool>,
    pub keeps_bodies_awake: Option<bool>,
    pub swap_ends: Option<Physics3DJointSwapEnds>,
    pub write_reaction: Option<Physics3DJointWriteReaction>,
    pub warm_start: Option<Physics3DJointWarmStart>,
    pub scale_accumulated_impulses: Option<Arc<dyn Fn(&Physics3DJointRef, f64) + Send + Sync>>,
    pub clear_accumulated_impulses: Option<Physics3DJointUnary>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics3DJointFrames {
    pub local_rotation_ax: f64,
    pub local_rotation_ay: f64,
    pub local_rotation_az: f64,
    pub local_rotation_aw: f64,
    pub local_rotation_bx: f64,
    pub local_rotation_by: f64,
    pub local_rotation_bz: f64,
    pub local_rotation_bw: f64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DJointReaction {
    runtime: EntityRuntimeSlot,
    pub force_x: f64,
    pub force_y: f64,
    pub force_z: f64,
    pub torque_x: f64,
    pub torque_y: f64,
    pub torque_z: f64,
}

#[derive(Clone, Default)]
pub struct Physics3DJointEvents {
    pub broke: Vec<Physics3DJointRef>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DJointOptions {
    pub body_a: i32,
    pub body_b: i32,
    pub local_anchor_ax: Option<f64>,
    pub local_anchor_ay: Option<f64>,
    pub local_anchor_az: Option<f64>,
    pub local_anchor_bx: Option<f64>,
    pub local_anchor_by: Option<f64>,
    pub local_anchor_bz: Option<f64>,
    pub collide_connected: Option<bool>,
    pub break_force: Option<f64>,
    pub break_torque: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DJointFrameOptions {
    pub joint: Physics3DJointOptions,
    pub local_rotation_ax: Option<f64>,
    pub local_rotation_ay: Option<f64>,
    pub local_rotation_az: Option<f64>,
    pub local_rotation_aw: Option<f64>,
    pub local_rotation_bx: Option<f64>,
    pub local_rotation_by: Option<f64>,
    pub local_rotation_bz: Option<f64>,
    pub local_rotation_bw: Option<f64>,
}

pub struct Physics3DBallAndSocketJoint {
    pub joint: Physics3DJointFields,
}

pub struct Physics3DDistanceJoint {
    pub joint: Physics3DJointFields,
    pub length: f64,
    pub enable_spring: bool,
    pub frequency_hz: f64,
    pub damping_ratio: f64,
    pub enable_limit: bool,
    pub min_length: f64,
    pub max_length: f64,
    pub lower_limit_impulse: f64,
    pub upper_limit_impulse: f64,
}

pub struct Physics3DFixedJoint {
    pub joint: Physics3DJointFields,
    pub frames: Physics3DJointFrames,
}

pub struct Physics3DHingeJoint {
    pub joint: Physics3DJointFields,
    pub frames: Physics3DJointFrames,
    pub enable_limit: bool,
    pub lower_angle: f64,
    pub upper_angle: f64,
    pub enable_motor: bool,
    pub motor_speed: f64,
    pub max_motor_torque: f64,
    pub motor_impulse: f64,
    pub enable_limit_spring: bool,
    pub limit_frequency_hz: f64,
    pub limit_damping_ratio: f64,
    pub lower_limit_impulse: f64,
    pub upper_limit_impulse: f64,
}

pub struct Physics3DSliderJoint {
    pub joint: Physics3DJointFields,
    pub frames: Physics3DJointFrames,
    pub enable_limit: bool,
    pub lower_translation: f64,
    pub upper_translation: f64,
    pub enable_motor: bool,
    pub motor_speed: f64,
    pub max_motor_force: f64,
    pub motor_impulse: f64,
    pub enable_limit_spring: bool,
    pub limit_frequency_hz: f64,
    pub limit_damping_ratio: f64,
    pub lower_limit_impulse: f64,
    pub upper_limit_impulse: f64,
}

pub struct Physics3DConeTwistJoint {
    pub joint: Physics3DJointFields,
    pub frames: Physics3DJointFrames,
    pub enable_swing_limit: bool,
    pub swing_limit_y: f64,
    pub swing_limit_z: f64,
    pub enable_twist_limit: bool,
    pub lower_twist_angle: f64,
    pub upper_twist_angle: f64,
    pub enable_limit_spring: bool,
    pub limit_frequency_hz: f64,
    pub limit_damping_ratio: f64,
    pub swing_limit_impulse: f64,
    pub lower_twist_impulse: f64,
    pub upper_twist_impulse: f64,
}

pub struct Physics3DGeneric6DofJoint {
    pub joint: Physics3DJointFields,
    pub frames: Physics3DJointFrames,
    pub lower_linear_x: f64,
    pub lower_linear_y: f64,
    pub lower_linear_z: f64,
    pub upper_linear_x: f64,
    pub upper_linear_y: f64,
    pub upper_linear_z: f64,
    pub lower_angular_x: f64,
    pub lower_angular_y: f64,
    pub lower_angular_z: f64,
    pub upper_angular_x: f64,
    pub upper_angular_y: f64,
    pub upper_angular_z: f64,
    pub enable_limit_spring: bool,
    pub limit_frequency_hz: f64,
    pub limit_damping_ratio: f64,
    pub lower_limit_impulses: Vec<f64>,
    pub upper_limit_impulses: Vec<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DDistanceJointOptions {
    pub joint: Physics3DJointOptions,
    pub length: Option<f64>,
    pub enable_spring: Option<bool>,
    pub frequency_hz: Option<f64>,
    pub damping_ratio: Option<f64>,
    pub enable_limit: Option<bool>,
    pub min_length: Option<f64>,
    pub max_length: Option<f64>,
}

pub type Physics3DFixedJointOptions = Physics3DJointFrameOptions;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DHingeJointOptions {
    pub frame: Physics3DJointFrameOptions,
    pub enable_limit: Option<bool>,
    pub lower_angle: Option<f64>,
    pub upper_angle: Option<f64>,
    pub enable_motor: Option<bool>,
    pub motor_speed: Option<f64>,
    pub max_motor_torque: Option<f64>,
    pub enable_limit_spring: Option<bool>,
    pub limit_frequency_hz: Option<f64>,
    pub limit_damping_ratio: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DSliderJointOptions {
    pub frame: Physics3DJointFrameOptions,
    pub enable_limit: Option<bool>,
    pub lower_translation: Option<f64>,
    pub upper_translation: Option<f64>,
    pub enable_motor: Option<bool>,
    pub motor_speed: Option<f64>,
    pub max_motor_force: Option<f64>,
    pub enable_limit_spring: Option<bool>,
    pub limit_frequency_hz: Option<f64>,
    pub limit_damping_ratio: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DConeTwistJointOptions {
    pub frame: Physics3DJointFrameOptions,
    pub enable_swing_limit: Option<bool>,
    pub swing_limit_y: Option<f64>,
    pub swing_limit_z: Option<f64>,
    pub enable_twist_limit: Option<bool>,
    pub lower_twist_angle: Option<f64>,
    pub upper_twist_angle: Option<f64>,
    pub enable_limit_spring: Option<bool>,
    pub limit_frequency_hz: Option<f64>,
    pub limit_damping_ratio: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Physics3DGeneric6DofJointOptions {
    pub frame: Physics3DJointFrameOptions,
    pub lower_linear_x: Option<f64>,
    pub lower_linear_y: Option<f64>,
    pub lower_linear_z: Option<f64>,
    pub upper_linear_x: Option<f64>,
    pub upper_linear_y: Option<f64>,
    pub upper_linear_z: Option<f64>,
    pub lower_angular_x: Option<f64>,
    pub lower_angular_y: Option<f64>,
    pub lower_angular_z: Option<f64>,
    pub upper_angular_x: Option<f64>,
    pub upper_angular_y: Option<f64>,
    pub upper_angular_z: Option<f64>,
    pub enable_limit_spring: Option<bool>,
    pub limit_frequency_hz: Option<f64>,
    pub limit_damping_ratio: Option<f64>,
}

pub struct Physics3DWorld {
    runtime: EntityRuntimeSlot,
    pub version: usize,
    pub bodies: Vec<RigidBody3DRef>,
    pub body_by_index: HashMap<i32, RigidBody3DRef>,
    pub index: SpatialIndexBackend3D,
    pub contacts: Vec<Physics3DContactRef>,
    pub joints: Vec<Physics3DJointRef>,
    pub joint_solvers: HashMap<String, Physics3DJointSolver>,
    pub joint_collision_suppressions: HashMap<i32, HashMap<i32, usize>>,
    pub events: Physics3DContactEvents,
    pub joint_events: Physics3DJointEvents,
    pub contact_hooks: Physics3DContactHooks,
    pub solver: Physics3DSequentialImpulseState,
    pub config: Physics3DSolverConfig,
    pub island_parents: HashMap<i32, i32>,
    pub island_sleep_timers: HashMap<i32, f64>,
    pub solve_island_by_root: HashMap<i32, usize>,
    pub solve_island_roots: Vec<i32>,
    pub solve_island_body_starts: Vec<usize>,
    pub solve_island_body_counts: Vec<usize>,
    pub solve_island_contact_starts: Vec<usize>,
    pub solve_island_contact_counts: Vec<usize>,
    pub solve_island_joint_starts: Vec<usize>,
    pub solve_island_joint_counts: Vec<usize>,
    pub solve_island_body_indices: Vec<usize>,
    pub solve_island_contact_indices: Vec<usize>,
    pub solve_island_joint_indices: Vec<usize>,
    pub solve_island_cursors: Vec<usize>,
    pub gravity_x: f64,
    pub gravity_y: f64,
    pub gravity_z: f64,
    pub previous_timestep: f64,
    pub next_body_index: i32,
    pub(crate) token: Arc<AtomicBool>,
    pub(crate) stepping: bool,
    pub(crate) continuous_integrating: bool,
    pub(crate) broadphase_body_indices: HashSet<i32>,
}

#[derive(Clone)]
pub struct Physics3DQueryHit {
    pub body: RigidBody3DRef,
    pub collider: Physics3DColliderRef,
    pub collider_index: usize,
}

#[derive(Default)]
pub struct Physics3DQueryResult {
    runtime: EntityRuntimeSlot,
    pub hits: Vec<Physics3DQueryHit>,
    pub hit_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Physics3DQueryFilter {
    pub category_bits: u32,
    pub mask_bits: u32,
    pub include_sensors: bool,
    pub include_dynamic: bool,
    pub include_kinematic: bool,
    pub include_static: bool,
}

#[derive(Clone)]
pub struct Physics3DRayHit {
    pub body: RigidBody3DRef,
    pub collider: Physics3DColliderRef,
    pub collider_index: usize,
    pub fraction: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

#[derive(Default)]
pub struct Physics3DRayResult {
    runtime: EntityRuntimeSlot,
    pub hits: Vec<Physics3DRayHit>,
    pub hit_count: usize,
}

#[derive(Default)]
pub struct Physics3DShapeCastResult {
    runtime: EntityRuntimeSlot,
    pub body: Option<RigidBody3DRef>,
    pub collider: Option<Physics3DColliderRef>,
    pub collider_index: i32,
    pub hit: bool,
    pub fraction: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Physics3DDebugFeature {
    CenterOfMass,
    Collider,
    ContactNormal,
    Joint,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Physics3DDebugLine {
    pub feature: Physics3DDebugFeature,
    pub body_a: i32,
    pub body_b: i32,
    pub x0: f64,
    pub y0: f64,
    pub z0: f64,
    pub x1: f64,
    pub y1: f64,
    pub z1: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Physics3DDebugSphere {
    pub feature: Physics3DDebugFeature,
    pub body_a: i32,
    pub body_b: i32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub radius: f64,
}

#[derive(Default)]
pub struct Physics3DDebugGeometry {
    runtime: EntityRuntimeSlot,
    pub lines: Vec<Physics3DDebugLine>,
    pub line_count: usize,
    pub spheres: Vec<Physics3DDebugSphere>,
    pub sphere_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Physics3DDebugGeometryOptions {
    pub draw_centers_of_mass: bool,
    pub draw_colliders: bool,
    pub draw_contacts: bool,
    pub draw_joints: bool,
    pub center_of_mass_radius: f64,
    pub contact_normal_length: f64,
}

fn default_collider_shape() -> CollisionColliderShape3D {
    return CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(
        CollisionSphere3D::default(),
    ));
}

impl Default for Physics3DDebugGeometryOptions {
    fn default() -> Self {
        return Self {
            draw_centers_of_mass: true,
            draw_colliders: true,
            draw_contacts: true,
            draw_joints: true,
            center_of_mass_radius: 0.08,
            contact_normal_length: 0.5,
        };
    }
}

impl Default for Physics3DMaterial {
    fn default() -> Self {
        return Self {
            density: 1.0,
            friction: 0.2,
            restitution: 0.0,
        };
    }
}

impl Default for Physics3DCollisionFilter {
    fn default() -> Self {
        return Self {
            category_bits: 1,
            mask_bits: 0xffff,
            group_index: 0,
        };
    }
}

impl Default for Physics3DCollider {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            local: default_collider_shape(),
            world: default_collider_shape(),
            material: Physics3DMaterial::default(),
            filter: Physics3DCollisionFilter::default(),
            sensor: false,
            owner: None,
        };
    }
}

impl Default for RigidBody3D {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            index: -1,
            body_type: Physics3DBodyType::Dynamic,
            x: 0.0,
            y: 0.0,
            z: 0.0,
            orientation_x: 0.0,
            orientation_y: 0.0,
            orientation_z: 0.0,
            orientation_w: 1.0,
            velocity_x: 0.0,
            velocity_y: 0.0,
            velocity_z: 0.0,
            angular_velocity_x: 0.0,
            angular_velocity_y: 0.0,
            angular_velocity_z: 0.0,
            force_x: 0.0,
            force_y: 0.0,
            force_z: 0.0,
            torque_x: 0.0,
            torque_y: 0.0,
            torque_z: 0.0,
            mass: 0.0,
            inverse_mass: 0.0,
            inertia_xx: 0.0,
            inertia_yy: 0.0,
            inertia_zz: 0.0,
            inertia_xy: 0.0,
            inertia_xz: 0.0,
            inertia_yz: 0.0,
            inverse_inertia_xx: 0.0,
            inverse_inertia_yy: 0.0,
            inverse_inertia_zz: 0.0,
            inverse_inertia_xy: 0.0,
            inverse_inertia_xz: 0.0,
            inverse_inertia_yz: 0.0,
            inverse_inertia_world_xx: 0.0,
            inverse_inertia_world_yy: 0.0,
            inverse_inertia_world_zz: 0.0,
            inverse_inertia_world_xy: 0.0,
            inverse_inertia_world_xz: 0.0,
            inverse_inertia_world_yz: 0.0,
            center_x: 0.0,
            center_y: 0.0,
            center_z: 0.0,
            linear_damping: 0.0,
            angular_damping: 0.0,
            gravity_scale: 1.0,
            fixed_rotation: false,
            bullet: false,
            sleeping: false,
            sleep_enabled: true,
            sleep_timer: 0.0,
            colliders: Vec::new(),
            owner: None,
        };
    }
}

impl Default for Physics3DContact {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            body_a: 0,
            body_b: 0,
            collider_a: 0,
            collider_b: 0,
            normal_x: 0.0,
            normal_y: 0.0,
            normal_z: 0.0,
            point_count: 0,
            points: Vec::new(),
            friction: 0.0,
            restitution: 0.0,
            enabled: true,
            sensor: false,
            touching: false,
        };
    }
}

impl Default for Physics3DSequentialImpulseConfig {
    fn default() -> Self {
        return Self {
            velocity_iterations: 8,
            position_iterations: 3,
            penetration_slop: 0.005,
            position_correction: 0.2,
            restitution_threshold: 1.0,
            warm_starting: true,
        };
    }
}

impl Default for Physics3DSolverConfig {
    fn default() -> Self {
        return Self {
            allow_sleeping: true,
            sleep_linear_threshold: 0.01,
            sleep_angular_threshold: 0.02,
            time_to_sleep: 0.5,
            substeps: 1,
            continuous_collision: false,
            max_ccd_substeps: 4,
            max_ccd_rotation_substeps: 64,
            sequential_impulse: Physics3DSequentialImpulseConfig::default(),
        };
    }
}

impl Default for Physics3DJointFields {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            body_a: 0,
            body_b: 0,
            local_anchor_ax: 0.0,
            local_anchor_ay: 0.0,
            local_anchor_az: 0.0,
            local_anchor_bx: 0.0,
            local_anchor_by: 0.0,
            local_anchor_bz: 0.0,
            collide_connected: false,
            break_force: f64::INFINITY,
            break_torque: f64::INFINITY,
            broken: false,
            impulse0: 0.0,
            impulse1: 0.0,
            impulse2: 0.0,
            impulse3: 0.0,
            impulse4: 0.0,
            impulse5: 0.0,
            r_ax: 0.0,
            r_ay: 0.0,
            r_az: 0.0,
            r_bx: 0.0,
            r_by: 0.0,
            r_bz: 0.0,
            owner: None,
            solve_state: None,
        };
    }
}

impl Default for Physics3DJointFrames {
    fn default() -> Self {
        return Self {
            local_rotation_ax: 0.0,
            local_rotation_ay: 0.0,
            local_rotation_az: 0.0,
            local_rotation_aw: 1.0,
            local_rotation_bx: 0.0,
            local_rotation_by: 0.0,
            local_rotation_bz: 0.0,
            local_rotation_bw: 1.0,
        };
    }
}

macro_rules! impl_joint_type {
    ($ty:ty) => {
        impl Deref for $ty {
            type Target = Physics3DJointFields;
            fn deref(&self) -> &Self::Target {
                return &self.joint;
            }
        }
        impl DerefMut for $ty {
            fn deref_mut(&mut self) -> &mut Self::Target {
                return &mut self.joint;
            }
        }
        impl Entity for $ty {
            fn entity_runtime(&self) -> &EntityRuntimeSlot {
                return self.joint.entity_runtime();
            }
            fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
                return self.joint.entity_runtime_mut();
            }
        }
        impl Physics3DJoint for $ty {
            fn fields(&self) -> &Physics3DJointFields {
                return &self.joint;
            }
            fn fields_mut(&mut self) -> &mut Physics3DJointFields {
                return &mut self.joint;
            }
            fn as_any(&self) -> &dyn Any {
                return self;
            }
            fn as_any_mut(&mut self) -> &mut dyn Any {
                return self;
            }
        }
    };
}

impl Default for Physics3DBallAndSocketJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
        };
    }
}

impl Default for Physics3DDistanceJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            length: 1.0,
            enable_spring: false,
            frequency_hz: 0.0,
            damping_ratio: 0.0,
            enable_limit: false,
            min_length: 0.0,
            max_length: f64::INFINITY,
            lower_limit_impulse: 0.0,
            upper_limit_impulse: 0.0,
        };
    }
}

impl Default for Physics3DFixedJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            frames: Physics3DJointFrames::default(),
        };
    }
}

impl Default for Physics3DHingeJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            frames: Physics3DJointFrames::default(),
            enable_limit: false,
            lower_angle: 0.0,
            upper_angle: 0.0,
            enable_motor: false,
            motor_speed: 0.0,
            max_motor_torque: 0.0,
            motor_impulse: 0.0,
            enable_limit_spring: false,
            limit_frequency_hz: 0.0,
            limit_damping_ratio: 0.0,
            lower_limit_impulse: 0.0,
            upper_limit_impulse: 0.0,
        };
    }
}

impl Default for Physics3DSliderJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            frames: Physics3DJointFrames::default(),
            enable_limit: false,
            lower_translation: 0.0,
            upper_translation: 0.0,
            enable_motor: false,
            motor_speed: 0.0,
            max_motor_force: 0.0,
            motor_impulse: 0.0,
            enable_limit_spring: false,
            limit_frequency_hz: 0.0,
            limit_damping_ratio: 0.0,
            lower_limit_impulse: 0.0,
            upper_limit_impulse: 0.0,
        };
    }
}

impl Default for Physics3DConeTwistJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            frames: Physics3DJointFrames::default(),
            enable_swing_limit: false,
            swing_limit_y: 0.0,
            swing_limit_z: 0.0,
            enable_twist_limit: false,
            lower_twist_angle: 0.0,
            upper_twist_angle: 0.0,
            enable_limit_spring: false,
            limit_frequency_hz: 0.0,
            limit_damping_ratio: 0.0,
            swing_limit_impulse: 0.0,
            lower_twist_impulse: 0.0,
            upper_twist_impulse: 0.0,
        };
    }
}

impl Default for Physics3DGeneric6DofJoint {
    fn default() -> Self {
        return Self {
            joint: Physics3DJointFields::default(),
            frames: Physics3DJointFrames::default(),
            lower_linear_x: 0.0,
            lower_linear_y: 0.0,
            lower_linear_z: 0.0,
            upper_linear_x: 0.0,
            upper_linear_y: 0.0,
            upper_linear_z: 0.0,
            lower_angular_x: 0.0,
            lower_angular_y: 0.0,
            lower_angular_z: 0.0,
            upper_angular_x: 0.0,
            upper_angular_y: 0.0,
            upper_angular_z: 0.0,
            enable_limit_spring: false,
            limit_frequency_hz: 0.0,
            limit_damping_ratio: 0.0,
            lower_limit_impulses: vec![0.0; 6],
            upper_limit_impulses: vec![0.0; 6],
        };
    }
}

impl_joint_type!(Physics3DBallAndSocketJoint);
impl_joint_type!(Physics3DDistanceJoint);
impl_joint_type!(Physics3DFixedJoint);
impl_joint_type!(Physics3DHingeJoint);
impl_joint_type!(Physics3DSliderJoint);
impl_joint_type!(Physics3DConeTwistJoint);
impl_joint_type!(Physics3DGeneric6DofJoint);

impl Default for Physics3DQueryFilter {
    fn default() -> Self {
        return Self {
            category_bits: 0xffff,
            mask_bits: 0xffff,
            include_sensors: true,
            include_dynamic: true,
            include_kinematic: true,
            include_static: true,
        };
    }
}

impl Default for Physics3DWorld {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            version: 4,
            bodies: Vec::new(),
            body_by_index: HashMap::new(),
            index: create_uniform_grid_spatial_backend_3d(1.0),
            contacts: Vec::new(),
            joints: Vec::new(),
            joint_solvers: HashMap::new(),
            joint_collision_suppressions: HashMap::new(),
            events: Physics3DContactEvents::default(),
            joint_events: Physics3DJointEvents::default(),
            contact_hooks: Physics3DContactHooks::default(),
            solver: Physics3DSequentialImpulseState::default(),
            config: Physics3DSolverConfig::default(),
            island_parents: HashMap::new(),
            island_sleep_timers: HashMap::new(),
            solve_island_by_root: HashMap::new(),
            solve_island_roots: Vec::new(),
            solve_island_body_starts: Vec::new(),
            solve_island_body_counts: Vec::new(),
            solve_island_contact_starts: Vec::new(),
            solve_island_contact_counts: Vec::new(),
            solve_island_joint_starts: Vec::new(),
            solve_island_joint_counts: Vec::new(),
            solve_island_body_indices: Vec::new(),
            solve_island_contact_indices: Vec::new(),
            solve_island_joint_indices: Vec::new(),
            solve_island_cursors: Vec::new(),
            gravity_x: 0.0,
            gravity_y: -9.80665,
            gravity_z: 0.0,
            previous_timestep: 0.0,
            next_body_index: 0,
            token: Arc::new(AtomicBool::new(false)),
            stepping: false,
            continuous_integrating: false,
            broadphase_body_indices: HashSet::new(),
        };
    }
}

flight_entity::impl_entity!(Physics3DCollider);
flight_entity::impl_entity!(Physics3DMassData);
flight_entity::impl_entity!(RigidBody3D);
flight_entity::impl_entity!(Physics3DContactPoint);
flight_entity::impl_entity!(Physics3DContact);
flight_entity::impl_entity!(Physics3DContactConstraintPoint);
flight_entity::impl_entity!(Physics3DContactConstraint);
flight_entity::impl_entity!(Physics3DJointFields);
flight_entity::impl_entity!(Physics3DJointReaction);
flight_entity::impl_entity!(Physics3DWorld);
flight_entity::impl_entity!(Physics3DQueryResult);
flight_entity::impl_entity!(Physics3DRayResult);
flight_entity::impl_entity!(Physics3DShapeCastResult);
flight_entity::impl_entity!(Physics3DDebugGeometry);
