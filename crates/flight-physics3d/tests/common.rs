use std::collections::HashMap;
use std::sync::Arc;

use flight_collision::{
    CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D, CollisionSphere3D,
    register_built_in_collision_face_queries3d, register_built_in_collision_pair_tests3d,
    register_built_in_collision_supports3d,
};
use flight_entity::Ref;
use flight_physics3d::contract::*;

pub fn add_body(world: &mut Physics3DWorld, body_type: Physics3DBodyType) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    add_physics_3d_body(world, &body);
    body
}

pub fn rigid_body(body_type: Physics3DBodyType) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    body.write().unwrap().body_type = body_type;
    body
}

pub fn physics_3d_contact(
    body_a: i32,
    body_b: i32,
    collider_a: Option<usize>,
    collider_b: Option<usize>,
) -> Physics3DContactRef {
    let contact = create_physics_3d_contact();
    let ordered = body_a <= body_b;
    {
        let mut contact = contact.write().unwrap();
        contact.body_a = if ordered { body_a } else { body_b };
        contact.body_b = if ordered { body_b } else { body_a };
        contact.collider_a = if ordered {
            collider_a.unwrap_or(0)
        } else {
            collider_b.unwrap_or(0)
        };
        contact.collider_b = if ordered {
            collider_b.unwrap_or(0)
        } else {
            collider_a.unwrap_or(0)
        };
    }
    contact
}

pub fn physics_3d_ball_and_socket_joint(
    options: &Physics3DJointOptions,
) -> Ref<Physics3DBallAndSocketJoint> {
    let joint = create_physics_3d_ball_and_socket_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, options);
    }
    joint
}

pub fn physics_3d_cone_twist_joint(
    options: &Physics3DConeTwistJointOptions,
) -> Ref<Physics3DConeTwistJoint> {
    let joint = create_physics_3d_cone_twist_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.frame.joint);
        apply_physics_3d_joint_frames(&mut joint.frames, &options.frame);
        joint.enable_swing_limit = options.enable_swing_limit.unwrap_or(true);
        joint.swing_limit_y = options.swing_limit_y.unwrap_or(std::f32::consts::PI / 4.0);
        joint.swing_limit_z = options.swing_limit_z.unwrap_or(std::f32::consts::PI / 4.0);
        joint.enable_twist_limit = options.enable_twist_limit.unwrap_or(false);
        joint.lower_twist_angle = options.lower_twist_angle.unwrap_or(0.0);
        joint.upper_twist_angle = options.upper_twist_angle.unwrap_or(0.0);
        joint.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        joint.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        joint.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
    }
    joint
}

pub fn physics_3d_distance_joint(
    options: &Physics3DDistanceJointOptions,
) -> Ref<Physics3DDistanceJoint> {
    let joint = create_physics_3d_distance_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.joint);
        joint.length = options.length.unwrap_or(0.0);
        joint.enable_spring = options.enable_spring.unwrap_or(false);
        joint.frequency_hz = options.frequency_hz.unwrap_or(0.0);
        joint.damping_ratio = options.damping_ratio.unwrap_or(0.0);
        joint.enable_limit = options.enable_limit.unwrap_or(false);
        joint.min_length = options.min_length.unwrap_or(0.0);
        joint.max_length = options.max_length.unwrap_or(f32::INFINITY);
    }
    joint
}

pub fn physics_3d_fixed_joint(options: &Physics3DFixedJointOptions) -> Ref<Physics3DFixedJoint> {
    let joint = create_physics_3d_fixed_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.joint);
        apply_physics_3d_joint_frames(&mut joint.frames, options);
    }
    joint
}

pub fn physics_3d_generic_6_dof_joint(
    options: &Physics3DGeneric6DofJointOptions,
) -> Ref<Physics3DGeneric6DofJoint> {
    let joint = create_physics_3d_generic_6_dof_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.frame.joint);
        apply_physics_3d_joint_frames(&mut joint.frames, &options.frame);
        joint.lower_linear_x = options.lower_linear_x.unwrap_or(1.0);
        joint.lower_linear_y = options.lower_linear_y.unwrap_or(1.0);
        joint.lower_linear_z = options.lower_linear_z.unwrap_or(1.0);
        joint.upper_linear_x = options.upper_linear_x.unwrap_or(-1.0);
        joint.upper_linear_y = options.upper_linear_y.unwrap_or(-1.0);
        joint.upper_linear_z = options.upper_linear_z.unwrap_or(-1.0);
        joint.lower_angular_x = options.lower_angular_x.unwrap_or(1.0);
        joint.lower_angular_y = options.lower_angular_y.unwrap_or(1.0);
        joint.lower_angular_z = options.lower_angular_z.unwrap_or(1.0);
        joint.upper_angular_x = options.upper_angular_x.unwrap_or(-1.0);
        joint.upper_angular_y = options.upper_angular_y.unwrap_or(-1.0);
        joint.upper_angular_z = options.upper_angular_z.unwrap_or(-1.0);
        joint.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        joint.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        joint.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
    }
    joint
}

pub fn physics_3d_hinge_joint(options: &Physics3DHingeJointOptions) -> Ref<Physics3DHingeJoint> {
    let joint = create_physics_3d_hinge_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.frame.joint);
        apply_physics_3d_joint_frames(&mut joint.frames, &options.frame);
        joint.enable_limit = options.enable_limit.unwrap_or(false);
        joint.lower_angle = options.lower_angle.unwrap_or(0.0);
        joint.upper_angle = options.upper_angle.unwrap_or(0.0);
        joint.enable_motor = options.enable_motor.unwrap_or(false);
        joint.motor_speed = options.motor_speed.unwrap_or(0.0);
        joint.max_motor_torque = options.max_motor_torque.unwrap_or(0.0);
        joint.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        joint.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        joint.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
    }
    joint
}

pub fn physics_3d_slider_joint(options: &Physics3DSliderJointOptions) -> Ref<Physics3DSliderJoint> {
    let joint = create_physics_3d_slider_joint();
    {
        let mut joint = joint.write().unwrap();
        apply_physics_3d_joint_options(&mut joint.joint, &options.frame.joint);
        apply_physics_3d_joint_frames(&mut joint.frames, &options.frame);
        joint.enable_limit = options.enable_limit.unwrap_or(false);
        joint.lower_translation = options.lower_translation.unwrap_or(0.0);
        joint.upper_translation = options.upper_translation.unwrap_or(0.0);
        joint.enable_motor = options.enable_motor.unwrap_or(false);
        joint.motor_speed = options.motor_speed.unwrap_or(0.0);
        joint.max_motor_force = options.max_motor_force.unwrap_or(0.0);
        joint.enable_limit_spring = options.enable_limit_spring.unwrap_or(false);
        joint.limit_frequency_hz = options.limit_frequency_hz.unwrap_or(0.0);
        joint.limit_damping_ratio = options.limit_damping_ratio.unwrap_or(0.0);
    }
    joint
}

fn apply_physics_3d_joint_options(out: &mut Physics3DJointFields, options: &Physics3DJointOptions) {
    out.body_a = options.body_a;
    out.body_b = options.body_b;
    out.local_anchor_ax = options.local_anchor_ax.unwrap_or(0.0);
    out.local_anchor_ay = options.local_anchor_ay.unwrap_or(0.0);
    out.local_anchor_az = options.local_anchor_az.unwrap_or(0.0);
    out.local_anchor_bx = options.local_anchor_bx.unwrap_or(0.0);
    out.local_anchor_by = options.local_anchor_by.unwrap_or(0.0);
    out.local_anchor_bz = options.local_anchor_bz.unwrap_or(0.0);
    out.collide_connected = options.collide_connected.unwrap_or(false);
    out.break_force = options.break_force.unwrap_or(f32::INFINITY);
    out.break_torque = options.break_torque.unwrap_or(f32::INFINITY);
}

fn apply_physics_3d_joint_frames(
    out: &mut Physics3DJointFrames,
    options: &Physics3DJointFrameOptions,
) {
    out.local_rotation_ax = options.local_rotation_ax.unwrap_or(0.0);
    out.local_rotation_ay = options.local_rotation_ay.unwrap_or(0.0);
    out.local_rotation_az = options.local_rotation_az.unwrap_or(0.0);
    out.local_rotation_aw = options.local_rotation_aw.unwrap_or(1.0);
    out.local_rotation_bx = options.local_rotation_bx.unwrap_or(0.0);
    out.local_rotation_by = options.local_rotation_by.unwrap_or(0.0);
    out.local_rotation_bz = options.local_rotation_bz.unwrap_or(0.0);
    out.local_rotation_bw = options.local_rotation_bw.unwrap_or(1.0);
}

pub fn add_dynamic_pair(world: &mut Physics3DWorld) -> (RigidBody3DRef, RigidBody3DRef) {
    let a = add_body(world, Physics3DBodyType::Dynamic);
    let b = add_body(world, Physics3DBodyType::Dynamic);
    (a, b)
}

pub fn collider() -> Physics3DColliderRef {
    physics_3d_collider(&sphere_shape(1.0, 0.0, 0.0, 0.0), None, None, None)
}

pub fn physics_3d_collider(
    local: &CollisionColliderShape3D,
    material: Option<&Physics3DMaterial>,
    filter: Option<&Physics3DCollisionFilter>,
    sensor: Option<bool>,
) -> Physics3DColliderRef {
    let owned_local = match local {
        CollisionColliderShape3D::BuiltIn(shape) => {
            CollisionColliderShape3D::BuiltIn(shape.clone())
        }
        CollisionColliderShape3D::TriangleMesh(shape) => CollisionColliderShape3D::TriangleMesh(
            Arc::new(std::sync::RwLock::new(shape.read().unwrap().clone())),
        ),
        CollisionColliderShape3D::Heightfield(shape) => CollisionColliderShape3D::Heightfield(
            Arc::new(std::sync::RwLock::new(shape.read().unwrap().clone())),
        ),
    };
    let world = create_physics_3d_collider_world_shape(&owned_local);
    let collider = create_physics_3d_collider();
    {
        let mut collider = collider.write().unwrap();
        collider.filter = filter.copied().unwrap_or_default();
        collider.local = owned_local;
        collider.material = material.copied().unwrap_or_default();
        collider.sensor = sensor.unwrap_or(false);
        collider.world = world;
    }
    collider
}

pub fn frame_options(body_a: i32, body_b: i32) -> Physics3DJointFrameOptions {
    Physics3DJointFrameOptions {
        joint: joint_options(body_a, body_b),
        local_rotation_ax: None,
        local_rotation_ay: None,
        local_rotation_az: None,
        local_rotation_aw: None,
        local_rotation_bx: None,
        local_rotation_by: None,
        local_rotation_bz: None,
        local_rotation_bw: None,
    }
}

pub fn joint_options(body_a: i32, body_b: i32) -> Physics3DJointOptions {
    Physics3DJointOptions {
        body_a,
        body_b,
        local_anchor_ax: None,
        local_anchor_ay: None,
        local_anchor_az: None,
        local_anchor_bx: None,
        local_anchor_by: None,
        local_anchor_bz: None,
        collide_connected: None,
        break_force: None,
        break_torque: None,
    }
}

pub fn cone_options(body_a: i32, body_b: i32) -> Physics3DConeTwistJointOptions {
    Physics3DConeTwistJointOptions {
        frame: frame_options(body_a, body_b),
        enable_swing_limit: None,
        swing_limit_y: None,
        swing_limit_z: None,
        enable_twist_limit: None,
        lower_twist_angle: None,
        upper_twist_angle: None,
        enable_limit_spring: None,
        limit_frequency_hz: None,
        limit_damping_ratio: None,
    }
}

pub fn distance_options(body_a: i32, body_b: i32) -> Physics3DDistanceJointOptions {
    Physics3DDistanceJointOptions {
        joint: joint_options(body_a, body_b),
        length: None,
        enable_spring: None,
        frequency_hz: None,
        damping_ratio: None,
        enable_limit: None,
        min_length: None,
        max_length: None,
    }
}

pub fn dof_options(body_a: i32, body_b: i32) -> Physics3DGeneric6DofJointOptions {
    Physics3DGeneric6DofJointOptions {
        frame: frame_options(body_a, body_b),
        lower_linear_x: None,
        lower_linear_y: None,
        lower_linear_z: None,
        upper_linear_x: None,
        upper_linear_y: None,
        upper_linear_z: None,
        lower_angular_x: None,
        lower_angular_y: None,
        lower_angular_z: None,
        upper_angular_x: None,
        upper_angular_y: None,
        upper_angular_z: None,
        enable_limit_spring: None,
        limit_frequency_hz: None,
        limit_damping_ratio: None,
    }
}

pub fn hinge_options(body_a: i32, body_b: i32) -> Physics3DHingeJointOptions {
    Physics3DHingeJointOptions {
        frame: frame_options(body_a, body_b),
        enable_limit: None,
        lower_angle: None,
        upper_angle: None,
        enable_motor: None,
        motor_speed: None,
        max_motor_torque: None,
        enable_limit_spring: None,
        limit_frequency_hz: None,
        limit_damping_ratio: None,
    }
}

pub fn registry() -> CollisionRegistry3D {
    CollisionRegistry3D {
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        face_queries: HashMap::new(),
        test_guard: None,
    }
}

pub fn registered_registry() -> CollisionRegistry3D {
    let mut registry = registry();
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_pair_tests3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    registry
}

pub fn sphere_shape(radius: f32, x: f32, y: f32, z: f32) -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(CollisionSphere3D {
        x,
        y,
        z,
        radius,
    }))
}

pub fn slider_options(body_a: i32, body_b: i32) -> Physics3DSliderJointOptions {
    Physics3DSliderJointOptions {
        frame: frame_options(body_a, body_b),
        enable_limit: None,
        lower_translation: None,
        upper_translation: None,
        enable_motor: None,
        motor_speed: None,
        max_motor_force: None,
        enable_limit_spring: None,
        limit_frequency_hz: None,
        limit_damping_ratio: None,
    }
}

pub fn world() -> Physics3DWorld {
    create_physics_3d_world()
}
