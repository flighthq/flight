use flight_collision::CollisionShape2D;
use flight_entity::Ref;
use flight_physics2d::*;
use flight_spatial::SpatialIndexBackend2D;

// The type's construction defaults, for struct-update syntax in tests.
pub fn defaults<T: Default>() -> T {
    let make: fn() -> T = T::default;
    return make();
}

pub fn physics2d_collider(
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

pub fn physics2d_distance_joint(
    options: &Physics2DDistanceJointOptions,
) -> Ref<Physics2DDistanceJoint> {
    let out = create_physics2d_distance_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
        out.damping_ratio = options.damping_ratio.unwrap_or(0.0);
        out.frequency_hz = options.frequency_hz.unwrap_or(0.0);
        out.length = options.length;
    }
    return out;
}

pub fn physics2d_gear_joint(options: &Physics2DGearJointOptions) -> Ref<Physics2DGearJoint> {
    let out = create_physics2d_gear_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
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

pub fn physics2d_mouse_joint(options: &Physics2DMouseJointOptions) -> Ref<Physics2DMouseJoint> {
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

pub fn physics2d_prismatic_joint(
    options: &Physics2DPrismaticJointOptions,
) -> Ref<Physics2DPrismaticJoint> {
    let out = create_physics2d_prismatic_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
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

pub fn physics2d_pulley_joint(
    options: &Physics2DPulleyJointOptions,
) -> Ref<Physics2DPulleyJoint> {
    let out = create_physics2d_pulley_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
        out.constant = options.constant;
        out.ground_anchor_ax = options.ground_anchor_ax;
        out.ground_anchor_ay = options.ground_anchor_ay;
        out.ground_anchor_bx = options.ground_anchor_bx;
        out.ground_anchor_by = options.ground_anchor_by;
        out.ratio = options.ratio.unwrap_or(1.0);
    }
    return out;
}

pub fn physics2d_revolute_joint(
    options: &Physics2DRevoluteJointOptions,
) -> Ref<Physics2DRevoluteJoint> {
    let out = create_physics2d_revolute_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
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

pub fn physics2d_rope_joint(options: &Physics2DRopeJointOptions) -> Ref<Physics2DRopeJoint> {
    let out = create_physics2d_rope_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
        out.max_length = options.max_length;
    }
    return out;
}

pub fn physics2d_weld_joint(options: &Physics2DWeldJointOptions) -> Ref<Physics2DWeldJoint> {
    let out = create_physics2d_weld_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
        out.reference_angle = options.reference_angle.unwrap_or(0.0);
    }
    return out;
}

pub fn physics2d_wheel_joint(options: &Physics2DWheelJointOptions) -> Ref<Physics2DWheelJoint> {
    let out = create_physics2d_wheel_joint();
    {
        let mut out = out.write().unwrap();
        apply_joint_options(&mut out, &options.base);
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

pub fn physics2d_world(
    gravity_x: Option<f32>,
    gravity_y: Option<f32>,
    index: Option<SpatialIndexBackend2D>,
) -> Physics2DWorld {
    let mut out = create_physics2d_world();
    out.gravity_x = gravity_x.unwrap_or(0.0);
    out.gravity_y = gravity_y.unwrap_or(-9.81);
    if let Some(index) = index {
        out.index = index;
    }
    return out;
}

pub fn rigid_body2d(
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

fn apply_joint_options(out: &mut Physics2DJointFields, options: &Physics2DJointOptions) {
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
