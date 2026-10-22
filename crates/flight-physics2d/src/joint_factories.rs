//! Built-in joint construction (TS `jointFactories.ts`). Each factory allocates the kind's entity
//! and fills the shared base fields before its own.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::joints::*;
use crate::types::*;

/// Allocates a distance joint (TS `createPhysics2DDistanceJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_distance_joint() -> Ref<Physics2DDistanceJoint> {
    let mut out: Physics2DDistanceJoint = allocate_entity();
    initialize_physics2d_distance_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a gear joint (TS `createPhysics2DGearJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_gear_joint() -> Ref<Physics2DGearJoint> {
    let mut out: Physics2DGearJoint = allocate_entity();
    initialize_physics2d_gear_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a mouse joint (TS `createPhysics2DMouseJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_mouse_joint() -> Ref<Physics2DMouseJoint> {
    let mut out: Physics2DMouseJoint = allocate_entity();
    initialize_physics2d_mouse_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a prismatic joint (TS `createPhysics2DPrismaticJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_prismatic_joint() -> Ref<Physics2DPrismaticJoint> {
    let mut out: Physics2DPrismaticJoint = allocate_entity();
    initialize_physics2d_prismatic_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a pulley joint (TS `createPhysics2DPulleyJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_pulley_joint() -> Ref<Physics2DPulleyJoint> {
    let mut out: Physics2DPulleyJoint = allocate_entity();
    initialize_physics2d_pulley_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a revolute joint (TS `createPhysics2DRevoluteJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_revolute_joint() -> Ref<Physics2DRevoluteJoint> {
    let mut out: Physics2DRevoluteJoint = allocate_entity();
    initialize_physics2d_revolute_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a rope joint (TS `createPhysics2DRopeJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_rope_joint() -> Ref<Physics2DRopeJoint> {
    let mut out: Physics2DRopeJoint = allocate_entity();
    initialize_physics2d_rope_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a weld joint (TS `createPhysics2DWeldJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_weld_joint() -> Ref<Physics2DWeldJoint> {
    let mut out: Physics2DWeldJoint = allocate_entity();
    initialize_physics2d_weld_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Allocates a wheel joint (TS `createPhysics2DWheelJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn create_physics2d_wheel_joint() -> Ref<Physics2DWheelJoint> {
    let mut out: Physics2DWheelJoint = allocate_entity();
    initialize_physics2d_wheel_joint(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_physics2d_distance_joint` (TS
/// `initializePhysics2DDistanceJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_distance_joint(out: &mut Physics2DDistanceJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_DISTANCE_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.length = 0.0;
    out.frequency_hz = 0.0;
    out.damping_ratio = 0.0;
}

/// The construction initializer of `create_physics2d_gear_joint` (TS
/// `initializePhysics2DGearJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_gear_joint(out: &mut Physics2DGearJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_GEAR_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.coordinate_a = Physics2DGearCoordinateKind::Angular;
    out.coordinate_b = Physics2DGearCoordinateKind::Angular;
    out.axis_ax = 1.0;
    out.axis_ay = 0.0;
    out.axis_bx = 1.0;
    out.axis_by = 0.0;
    out.ratio = 1.0;
    out.constant = 0.0;
}

/// The construction initializer of `create_physics2d_mouse_joint` (TS
/// `initializePhysics2DMouseJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_mouse_joint(out: &mut Physics2DMouseJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_MOUSE_JOINT_KIND.to_string();
    fields.body_a = 0;
    fields.body_b = 0;
    fields.local_anchor_ax = 0.0;
    fields.local_anchor_ay = 0.0;
    fields.local_anchor_bx = 0.0;
    fields.local_anchor_by = 0.0;
    fields.collide_connected = false;
    fields.break_force = f32::INFINITY;
    fields.break_torque = f32::INFINITY;
    fields.impulse0 = 0.0;
    fields.impulse1 = 0.0;
    fields.impulse2 = 0.0;
    fields.r_ax = 0.0;
    fields.r_ay = 0.0;
    fields.r_bx = 0.0;
    fields.r_by = 0.0;
    out.target_x = 0.0;
    out.target_y = 0.0;
    out.max_force = 0.0;
    out.frequency_hz = 5.0;
    out.damping_ratio = 0.7;
}

/// The construction initializer of `create_physics2d_prismatic_joint` (TS
/// `initializePhysics2DPrismaticJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_prismatic_joint(out: &mut Physics2DPrismaticJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_PRISMATIC_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.local_axis_ax = 1.0;
    out.local_axis_ay = 0.0;
    out.reference_angle = 0.0;
    out.enable_motor = false;
    out.motor_speed = 0.0;
    out.max_motor_force = 0.0;
    out.motor_impulse = 0.0;
    out.enable_limit = false;
    out.lower_translation = 0.0;
    out.upper_translation = 0.0;
    out.enable_limit_spring = false;
    out.limit_frequency_hz = 0.0;
    out.limit_damping_ratio = 0.0;
}

/// The construction initializer of `create_physics2d_pulley_joint` (TS
/// `initializePhysics2DPulleyJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_pulley_joint(out: &mut Physics2DPulleyJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_PULLEY_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.ground_anchor_ax = 0.0;
    out.ground_anchor_ay = 0.0;
    out.ground_anchor_bx = 0.0;
    out.ground_anchor_by = 0.0;
    out.ratio = 1.0;
    out.constant = 0.0;
}

/// The construction initializer of `create_physics2d_revolute_joint` (TS
/// `initializePhysics2DRevoluteJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_revolute_joint(out: &mut Physics2DRevoluteJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_REVOLUTE_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.enable_motor = false;
    out.motor_speed = 0.0;
    out.max_motor_torque = 0.0;
    out.motor_impulse = 0.0;
    out.enable_limit = false;
    out.lower_angle = 0.0;
    out.upper_angle = 0.0;
    out.reference_angle = 0.0;
    out.enable_limit_spring = false;
    out.limit_frequency_hz = 0.0;
    out.limit_damping_ratio = 0.0;
}

/// The construction initializer of `create_physics2d_rope_joint` (TS
/// `initializePhysics2DRopeJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_rope_joint(out: &mut Physics2DRopeJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_ROPE_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.max_length = 0.0;
}

/// The construction initializer of `create_physics2d_weld_joint` (TS
/// `initializePhysics2DWeldJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_weld_joint(out: &mut Physics2DWeldJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_WELD_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.reference_angle = 0.0;
}

/// The construction initializer of `create_physics2d_wheel_joint` (TS
/// `initializePhysics2DWheelJoint`).
// flight-lint: allow(conform-params) D23 Entity construction is zero-argument; callers assign authored joint fields
pub fn initialize_physics2d_wheel_joint(out: &mut Physics2DWheelJoint) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_WHEEL_JOINT_KIND.to_string();
    init_joint_base(fields);
    out.local_axis_ax = 0.0;
    out.local_axis_ay = 1.0;
    out.rest_translation = 0.0;
    out.frequency_hz = 0.0;
    out.damping_ratio = 0.0;
    out.enable_motor = false;
    out.motor_speed = 0.0;
    out.max_motor_torque = 0.0;
    out.motor_impulse = 0.0;
}

fn init_joint_base(out: &mut Physics2DJointFields) {
    out.body_a = 0;
    out.body_b = 0;
    out.local_anchor_ax = 0.0;
    out.local_anchor_ay = 0.0;
    out.local_anchor_bx = 0.0;
    out.local_anchor_by = 0.0;
    out.collide_connected = false;
    out.break_force = f32::INFINITY;
    out.break_torque = f32::INFINITY;
    out.impulse0 = 0.0;
    out.impulse1 = 0.0;
    out.impulse2 = 0.0;
    out.r_ax = 0.0;
    out.r_ay = 0.0;
    out.r_bx = 0.0;
    out.r_by = 0.0;
}

fn joint_fields_of<T: Physics2DJoint>(joint: &mut T) -> &mut Physics2DJointFields {
    return joint.joint_fields_mut();
}
