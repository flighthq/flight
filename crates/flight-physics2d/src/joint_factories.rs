//! Built-in joint construction (TS `jointFactories.ts`). Each factory allocates the kind's entity
//! and fills the shared base fields before its own.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};

use crate::joints::*;
use crate::types::*;

/// Allocates a distance joint (TS `createPhysics2DDistanceJoint`).
pub fn create_physics2d_distance_joint(
    options: &Physics2DDistanceJointOptions,
) -> Ref<Physics2DDistanceJoint> {
    let mut out: Physics2DDistanceJoint = allocate_entity();
    initialize_physics2d_distance_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a gear joint (TS `createPhysics2DGearJoint`).
pub fn create_physics2d_gear_joint(options: &Physics2DGearJointOptions) -> Ref<Physics2DGearJoint> {
    let mut out: Physics2DGearJoint = allocate_entity();
    initialize_physics2d_gear_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a mouse joint (TS `createPhysics2DMouseJoint`).
pub fn create_physics2d_mouse_joint(
    options: &Physics2DMouseJointOptions,
) -> Ref<Physics2DMouseJoint> {
    let mut out: Physics2DMouseJoint = allocate_entity();
    initialize_physics2d_mouse_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a prismatic joint (TS `createPhysics2DPrismaticJoint`).
pub fn create_physics2d_prismatic_joint(
    options: &Physics2DPrismaticJointOptions,
) -> Ref<Physics2DPrismaticJoint> {
    let mut out: Physics2DPrismaticJoint = allocate_entity();
    initialize_physics2d_prismatic_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a pulley joint (TS `createPhysics2DPulleyJoint`).
pub fn create_physics2d_pulley_joint(
    options: &Physics2DPulleyJointOptions,
) -> Ref<Physics2DPulleyJoint> {
    let mut out: Physics2DPulleyJoint = allocate_entity();
    initialize_physics2d_pulley_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a revolute joint (TS `createPhysics2DRevoluteJoint`).
pub fn create_physics2d_revolute_joint(
    options: &Physics2DRevoluteJointOptions,
) -> Ref<Physics2DRevoluteJoint> {
    let mut out: Physics2DRevoluteJoint = allocate_entity();
    initialize_physics2d_revolute_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a rope joint (TS `createPhysics2DRopeJoint`).
pub fn create_physics2d_rope_joint(options: &Physics2DRopeJointOptions) -> Ref<Physics2DRopeJoint> {
    let mut out: Physics2DRopeJoint = allocate_entity();
    initialize_physics2d_rope_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a weld joint (TS `createPhysics2DWeldJoint`).
pub fn create_physics2d_weld_joint(options: &Physics2DWeldJointOptions) -> Ref<Physics2DWeldJoint> {
    let mut out: Physics2DWeldJoint = allocate_entity();
    initialize_physics2d_weld_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// Allocates a wheel joint (TS `createPhysics2DWheelJoint`).
pub fn create_physics2d_wheel_joint(
    options: &Physics2DWheelJointOptions,
) -> Ref<Physics2DWheelJoint> {
    let mut out: Physics2DWheelJoint = allocate_entity();
    initialize_physics2d_wheel_joint(&mut out, options);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_physics2d_distance_joint` (TS
/// `initializePhysics2DDistanceJoint`).
pub fn initialize_physics2d_distance_joint(
    out: &mut Physics2DDistanceJoint,
    options: &Physics2DDistanceJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_DISTANCE_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.length = options.length;
    out.frequency_hz = options.frequency_hz.unwrap_or(0.0);
    out.damping_ratio = options.damping_ratio.unwrap_or(0.0);
}

/// The construction initializer of `create_physics2d_gear_joint` (TS
/// `initializePhysics2DGearJoint`).
pub fn initialize_physics2d_gear_joint(
    out: &mut Physics2DGearJoint,
    options: &Physics2DGearJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_GEAR_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.coordinate_a = options.coordinate_a;
    out.coordinate_b = options.coordinate_b;
    out.axis_ax = options.axis_ax.unwrap_or(1.0);
    out.axis_ay = options.axis_ay.unwrap_or(0.0);
    out.axis_bx = options.axis_bx.unwrap_or(1.0);
    out.axis_by = options.axis_by.unwrap_or(0.0);
    out.ratio = options.ratio.unwrap_or(1.0);
    out.constant = options.constant;
}

/// The construction initializer of `create_physics2d_mouse_joint` (TS
/// `initializePhysics2DMouseJoint`).
pub fn initialize_physics2d_mouse_joint(
    out: &mut Physics2DMouseJoint,
    options: &Physics2DMouseJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_MOUSE_JOINT_KIND.to_string();
    fields.body_a = options.body;
    fields.body_b = options.body;
    fields.local_anchor_ax = 0.0;
    fields.local_anchor_ay = 0.0;
    fields.local_anchor_bx = options.local_anchor_x.unwrap_or(0.0);
    fields.local_anchor_by = options.local_anchor_y.unwrap_or(0.0);
    fields.collide_connected = false;
    fields.break_force = options.break_force.unwrap_or(f32::INFINITY);
    fields.break_torque = options.break_torque.unwrap_or(f32::INFINITY);
    fields.impulse0 = 0.0;
    fields.impulse1 = 0.0;
    fields.impulse2 = 0.0;
    fields.r_ax = 0.0;
    fields.r_ay = 0.0;
    fields.r_bx = 0.0;
    fields.r_by = 0.0;
    out.target_x = options.target_x;
    out.target_y = options.target_y;
    out.max_force = options.max_force;
    out.frequency_hz = options.frequency_hz.unwrap_or(5.0);
    out.damping_ratio = options.damping_ratio.unwrap_or(0.7);
}

/// The construction initializer of `create_physics2d_prismatic_joint` (TS
/// `initializePhysics2DPrismaticJoint`).
pub fn initialize_physics2d_prismatic_joint(
    out: &mut Physics2DPrismaticJoint,
    options: &Physics2DPrismaticJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_PRISMATIC_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.local_axis_ax = options.local_axis_ax.unwrap_or(1.0);
    out.local_axis_ay = options.local_axis_ay.unwrap_or(0.0);
    out.reference_angle = options.reference_angle.unwrap_or(0.0);
    out.enable_motor = options.enable_motor.unwrap_or(false);
    out.motor_speed = options.motor_speed.unwrap_or(0.0);
    out.max_motor_force = options.max_motor_force.unwrap_or(0.0);
    out.motor_impulse = 0.0;
    out.enable_limit = options.enable_limit.unwrap_or(false);
    out.lower_translation = options.lower_translation.unwrap_or(0.0);
    out.upper_translation = options.upper_translation.unwrap_or(0.0);
    out.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
    out.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
    out.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
}

/// The construction initializer of `create_physics2d_pulley_joint` (TS
/// `initializePhysics2DPulleyJoint`).
pub fn initialize_physics2d_pulley_joint(
    out: &mut Physics2DPulleyJoint,
    options: &Physics2DPulleyJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_PULLEY_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.ground_anchor_ax = options.ground_anchor_ax;
    out.ground_anchor_ay = options.ground_anchor_ay;
    out.ground_anchor_bx = options.ground_anchor_bx;
    out.ground_anchor_by = options.ground_anchor_by;
    out.ratio = options.ratio.unwrap_or(1.0);
    out.constant = options.constant;
}

/// The construction initializer of `create_physics2d_revolute_joint` (TS
/// `initializePhysics2DRevoluteJoint`).
pub fn initialize_physics2d_revolute_joint(
    out: &mut Physics2DRevoluteJoint,
    options: &Physics2DRevoluteJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_REVOLUTE_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.enable_motor = options.enable_motor.unwrap_or(false);
    out.motor_speed = options.motor_speed.unwrap_or(0.0);
    out.max_motor_torque = options.max_motor_torque.unwrap_or(0.0);
    out.motor_impulse = 0.0;
    out.enable_limit = options.enable_limit.unwrap_or(false);
    out.lower_angle = options.lower_angle.unwrap_or(0.0);
    out.upper_angle = options.upper_angle.unwrap_or(0.0);
    out.reference_angle = options.reference_angle.unwrap_or(0.0);
    out.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
    out.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
    out.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
}

/// The construction initializer of `create_physics2d_rope_joint` (TS
/// `initializePhysics2DRopeJoint`).
pub fn initialize_physics2d_rope_joint(
    out: &mut Physics2DRopeJoint,
    options: &Physics2DRopeJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_ROPE_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.max_length = options.max_length;
}

/// The construction initializer of `create_physics2d_weld_joint` (TS
/// `initializePhysics2DWeldJoint`).
pub fn initialize_physics2d_weld_joint(
    out: &mut Physics2DWeldJoint,
    options: &Physics2DWeldJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_WELD_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.reference_angle = options.reference_angle.unwrap_or(0.0);
}

/// The construction initializer of `create_physics2d_wheel_joint` (TS
/// `initializePhysics2DWheelJoint`).
pub fn initialize_physics2d_wheel_joint(
    out: &mut Physics2DWheelJoint,
    options: &Physics2DWheelJointOptions,
) {
    let fields = joint_fields_of(out);
    fields.kind = PHYSICS2D_WHEEL_JOINT_KIND.to_string();
    init_joint_base(fields, &options.base);
    out.local_axis_ax = options.local_axis_ax.unwrap_or(0.0);
    out.local_axis_ay = options.local_axis_ay.unwrap_or(1.0);
    out.rest_translation = options.rest_translation.unwrap_or(0.0);
    out.frequency_hz = options.frequency_hz.unwrap_or(0.0);
    out.damping_ratio = options.damping_ratio.unwrap_or(0.0);
    out.enable_motor = options.enable_motor.unwrap_or(false);
    out.motor_speed = options.motor_speed.unwrap_or(0.0);
    out.max_motor_torque = options.max_motor_torque.unwrap_or(0.0);
    out.motor_impulse = 0.0;
}

fn init_joint_base(out: &mut Physics2DJointFields, options: &Physics2DJointOptions) {
    out.body_a = options.body_a;
    out.body_b = options.body_b;
    out.local_anchor_ax = options.local_anchor_ax.unwrap_or(0.0);
    out.local_anchor_ay = options.local_anchor_ay.unwrap_or(0.0);
    out.local_anchor_bx = options.local_anchor_bx.unwrap_or(0.0);
    out.local_anchor_by = options.local_anchor_by.unwrap_or(0.0);
    out.collide_connected = options.collide_connected.unwrap_or(false);
    out.break_force = options.break_force.unwrap_or(f32::INFINITY);
    out.break_torque = options.break_torque.unwrap_or(f32::INFINITY);
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
