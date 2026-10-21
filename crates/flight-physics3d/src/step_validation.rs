use std::sync::Arc;

use flight_collision::{
    CollisionColliderShape3D, CollisionShape3D, get_collision_heightfield_validation_status3d,
    get_collision_shape_validation_status3d, get_collision_triangle_mesh_validation_status3d,
};

use crate::*;

fn all_finite(values: &[f32]) -> bool {
    values.iter().all(|value| value.is_finite())
}

fn built_in_joint_fields_are_finite(joint: &dyn Physics3DJoint) -> bool {
    let any = joint.as_any();
    if any.is::<Physics3DBallAndSocketJoint>() {
        return true;
    }
    if let Some(joint) = any.downcast_ref::<Physics3DDistanceJoint>() {
        return all_finite(&[
            joint.length,
            joint.frequency_hz,
            joint.damping_ratio,
            joint.min_length,
            joint.lower_limit_impulse,
            joint.upper_limit_impulse,
        ]) && !joint.max_length.is_nan();
    }
    if let Some(joint) = any.downcast_ref::<Physics3DFixedJoint>() {
        return frames_are_finite(&joint.frames);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DHingeJoint>() {
        return frames_are_finite(&joint.frames)
            && all_finite(&[
                joint.lower_angle,
                joint.upper_angle,
                joint.motor_speed,
                joint.max_motor_torque,
                joint.motor_impulse,
                joint.limit_frequency_hz,
                joint.limit_damping_ratio,
                joint.lower_limit_impulse,
                joint.upper_limit_impulse,
            ]);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DSliderJoint>() {
        return frames_are_finite(&joint.frames)
            && all_finite(&[
                joint.lower_translation,
                joint.upper_translation,
                joint.motor_speed,
                joint.max_motor_force,
                joint.motor_impulse,
                joint.limit_frequency_hz,
                joint.limit_damping_ratio,
                joint.lower_limit_impulse,
                joint.upper_limit_impulse,
            ]);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DConeTwistJoint>() {
        return frames_are_finite(&joint.frames)
            && all_finite(&[
                joint.swing_limit_y,
                joint.swing_limit_z,
                joint.lower_twist_angle,
                joint.upper_twist_angle,
                joint.limit_frequency_hz,
                joint.limit_damping_ratio,
                joint.swing_limit_impulse,
                joint.lower_twist_impulse,
                joint.upper_twist_impulse,
            ]);
    }
    if let Some(joint) = any.downcast_ref::<Physics3DGeneric6DofJoint>() {
        return frames_are_finite(&joint.frames)
            && all_finite(&[
                joint.lower_linear_x,
                joint.lower_linear_y,
                joint.lower_linear_z,
                joint.upper_linear_x,
                joint.upper_linear_y,
                joint.upper_linear_z,
                joint.lower_angular_x,
                joint.lower_angular_y,
                joint.lower_angular_z,
                joint.upper_angular_x,
                joint.upper_angular_y,
                joint.upper_angular_z,
                joint.limit_frequency_hz,
                joint.limit_damping_ratio,
            ])
            && all_finite(&joint.lower_limit_impulses)
            && all_finite(&joint.upper_limit_impulses);
    }
    true
}

fn collider_shape_valid(shape: &CollisionColliderShape3D) -> bool {
    match shape {
        CollisionColliderShape3D::BuiltIn(shape) => {
            get_collision_shape_validation_status3d(shape).is_none()
        }
        CollisionColliderShape3D::TriangleMesh(mesh) => {
            get_collision_triangle_mesh_validation_status3d(&mesh.read().unwrap()).is_none()
        }
        CollisionColliderShape3D::Heightfield(heightfield) => {
            get_collision_heightfield_validation_status3d(&heightfield.read().unwrap()).is_none()
        }
    }
}

fn collider_world_shape_compatible(collider: &Physics3DCollider) -> bool {
    match (&collider.local, &collider.world) {
        (
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(_)),
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(_)),
        ) => true,
        (CollisionColliderShape3D::BuiltIn(a), CollisionColliderShape3D::BuiltIn(b)) => {
            std::mem::discriminant(a) == std::mem::discriminant(b)
        }
        (CollisionColliderShape3D::TriangleMesh(_), CollisionColliderShape3D::TriangleMesh(_))
        | (CollisionColliderShape3D::Heightfield(_), CollisionColliderShape3D::Heightfield(_)) => {
            true
        }
        _ => false,
    }
}

fn frames_are_finite(frames: &Physics3DJointFrames) -> bool {
    all_finite(&[
        frames.local_rotation_ax,
        frames.local_rotation_ay,
        frames.local_rotation_az,
        frames.local_rotation_aw,
        frames.local_rotation_bx,
        frames.local_rotation_by,
        frames.local_rotation_bz,
        frames.local_rotation_bw,
    ])
}

pub fn is_physics_3d_body_state_valid(world: &Physics3DWorld) -> bool {
    if world.next_body_index < 0 {
        return false;
    }
    world.bodies.iter().all(|body_ref| {
        let body = body_ref.read().unwrap();
        is_rigid_body_3d_state_valid(&body)
            && (body.body_type == Physics3DBodyType::Static
                || !body.colliders.iter().any(|collider| {
                    matches!(
                        collider.read().unwrap().local,
                        CollisionColliderShape3D::TriangleMesh(_)
                            | CollisionColliderShape3D::Heightfield(_)
                    )
                }))
            && world
                .body_by_index
                .get(&body.index)
                .is_some_and(|mapped| Arc::ptr_eq(mapped, body_ref))
    })
}

pub fn is_physics_3d_collider_state_valid(world: &Physics3DWorld) -> bool {
    world.bodies.iter().all(|body| {
        body.read()
            .unwrap()
            .colliders
            .iter()
            .all(|collider| is_physics_3d_collider_valid(&collider.read().unwrap()))
    })
}

fn is_physics_3d_collider_valid(collider: &Physics3DCollider) -> bool {
    collider_shape_valid(&collider.local)
        && collider_shape_valid(&collider.world)
        && collider_world_shape_compatible(collider)
        && collider.material.density.is_finite()
        && collider.material.density >= 0.0
        && collider.material.friction.is_finite()
        && collider.material.friction >= 0.0
        && collider.material.restitution.is_finite()
        && collider.material.restitution >= 0.0
}

pub fn is_physics_3d_contact_state_valid(world: &Physics3DWorld) -> bool {
    world
        .contacts
        .iter()
        .all(|contact| is_physics_3d_contact_valid(&contact.read().unwrap()))
}

pub fn is_physics_3d_contact_valid(contact: &Physics3DContact) -> bool {
    if contact.point_count > contact.points.len()
        || !all_finite(&[contact.normal_x, contact.normal_y, contact.normal_z])
        || !contact.friction.is_finite()
        || contact.friction < 0.0
        || !contact.restitution.is_finite()
        || contact.restitution < 0.0
    {
        return false;
    }
    contact.points[..contact.point_count].iter().all(|point| {
        all_finite(&[
            point.x,
            point.y,
            point.z,
            point.depth,
            point.r_ax,
            point.r_ay,
            point.r_az,
            point.r_bx,
            point.r_by,
            point.r_bz,
        ])
    })
}

pub fn is_physics_3d_gravity_valid(world: &Physics3DWorld) -> bool {
    all_finite(&[world.gravity_x, world.gravity_y, world.gravity_z])
}

pub fn is_physics_3d_joint_state_valid(world: &Physics3DWorld) -> bool {
    world.joints.iter().all(|joint| {
        let joint = joint.read().unwrap();
        is_physics_3d_joint_valid(&*joint)
    })
}

fn is_physics_3d_joint_valid(joint: &dyn Physics3DJoint) -> bool {
    let f = joint.fields();
    !f.kind.is_empty()
        && all_finite(&[
            f.local_anchor_ax,
            f.local_anchor_ay,
            f.local_anchor_az,
            f.local_anchor_bx,
            f.local_anchor_by,
            f.local_anchor_bz,
            f.impulse0,
            f.impulse1,
            f.impulse2,
            f.impulse3,
            f.impulse4,
            f.impulse5,
            f.r_ax,
            f.r_ay,
            f.r_az,
            f.r_bx,
            f.r_by,
            f.r_bz,
        ])
        && joint.kind_fields_are_finite()
        && built_in_joint_fields_are_finite(joint)
}

pub fn is_physics_3d_position_iterations_valid(_config: &Physics3DSolverConfig) -> bool {
    true
}

pub fn is_physics_3d_solver_config_valid(config: &Physics3DSolverConfig) -> bool {
    let sequential = &config.sequential_impulse;
    all_finite(&[
        config.sleep_linear_threshold,
        config.sleep_angular_threshold,
        config.time_to_sleep,
        sequential.penetration_slop,
        sequential.position_correction,
        sequential.restitution_threshold,
    ]) && config.sleep_linear_threshold >= 0.0
        && config.sleep_angular_threshold >= 0.0
        && config.time_to_sleep >= 0.0
        && sequential.penetration_slop >= 0.0
        && (0.0..=1.0).contains(&sequential.position_correction)
        && sequential.restitution_threshold >= 0.0
}

pub fn is_physics_3d_substeps_valid(config: &Physics3DSolverConfig) -> bool {
    config.substeps >= 1
}

pub fn is_physics_3d_timestep_valid(dt: f32) -> bool {
    dt.is_finite() && dt > 0.0
}

pub fn is_physics_3d_velocity_iterations_valid(_config: &Physics3DSolverConfig) -> bool {
    true
}

fn is_rigid_body_3d_state_valid(body: &RigidBody3D) -> bool {
    if body.index < 0
        || !body.sleep_timer.is_finite()
        || body.sleep_timer < 0.0
        || !body.linear_damping.is_finite()
        || body.linear_damping < 0.0
        || !body.angular_damping.is_finite()
        || body.angular_damping < 0.0
        || !body.gravity_scale.is_finite()
        || !body.mass.is_finite()
        || body.mass < 0.0
        || !body.inverse_mass.is_finite()
        || body.inverse_mass < 0.0
    {
        return false;
    }
    let orientation_length_squared = body.orientation_x * body.orientation_x
        + body.orientation_y * body.orientation_y
        + body.orientation_z * body.orientation_z
        + body.orientation_w * body.orientation_w;
    if !orientation_length_squared.is_finite() || (orientation_length_squared - 1.0).abs() > 1e-6 {
        return false;
    }
    all_finite(&[
        body.x,
        body.y,
        body.z,
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
        body.velocity_x,
        body.velocity_y,
        body.velocity_z,
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
        body.force_x,
        body.force_y,
        body.force_z,
        body.torque_x,
        body.torque_y,
        body.torque_z,
        body.center_x,
        body.center_y,
        body.center_z,
        body.inertia_xx,
        body.inertia_yy,
        body.inertia_zz,
        body.inertia_xy,
        body.inertia_xz,
        body.inertia_yz,
        body.inverse_inertia_xx,
        body.inverse_inertia_yy,
        body.inverse_inertia_zz,
        body.inverse_inertia_xy,
        body.inverse_inertia_xz,
        body.inverse_inertia_yz,
        body.inverse_inertia_world_xx,
        body.inverse_inertia_world_yy,
        body.inverse_inertia_world_zz,
        body.inverse_inertia_world_xy,
        body.inverse_inertia_world_xz,
        body.inverse_inertia_world_yz,
    ])
}
