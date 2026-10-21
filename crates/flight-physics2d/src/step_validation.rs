//! Step preconditions (TS `stepValidation.ts`). The source's `typeof` and `Number.isSafeInteger`
//! checks always hold for typed Rust fields (D15), so only the numeric range checks remain.

use std::sync::Arc;

use flight_collision::CollisionShape2D;

use crate::types::*;

// flight-lint: allow(f64) D1: circle and polygon shape fields are the canonical f64 collision values
fn is_collision_shape_state_valid(shape: &CollisionShape2D) -> bool {
    return match shape {
        CollisionShape2D::Circle(shape) => {
            shape.x.is_finite()
                && shape.y.is_finite()
                && shape.radius.is_finite()
                && shape.radius > 0.0
        }
        CollisionShape2D::Aabb(shape) => {
            shape.min_x.is_finite()
                && shape.min_y.is_finite()
                && shape.max_x.is_finite()
                && shape.max_y.is_finite()
                && shape.max_x > shape.min_x
                && shape.max_y > shape.min_y
        }
        CollisionShape2D::Obb(shape) => {
            shape.x.is_finite()
                && shape.y.is_finite()
                && shape.half_w.is_finite()
                && shape.half_h.is_finite()
                && shape.rotation.is_finite()
                && shape.half_w > 0.0
                && shape.half_h > 0.0
        }
        CollisionShape2D::Capsule(shape) => {
            shape.x0.is_finite()
                && shape.y0.is_finite()
                && shape.x1.is_finite()
                && shape.y1.is_finite()
                && shape.radius.is_finite()
                && shape.radius > 0.0
        }
        CollisionShape2D::Polygon(shape) => {
            if shape.points.len() < 6 || (shape.points.len() & 1) != 0 {
                return false;
            }
            shape.points.iter().all(|coordinate| coordinate.is_finite())
        }
        CollisionShape2D::Segment(shape) => {
            shape.x0.is_finite()
                && shape.y0.is_finite()
                && shape.x1.is_finite()
                && shape.y1.is_finite()
        }
        CollisionShape2D::Point(shape) => shape.x.is_finite() && shape.y.is_finite(),
    };
}

/// Every body is finite, non-negative where required, and indexed under its own index (TS
/// `isPhysics2DBodyStateValid`).
pub fn is_physics2d_body_state_valid(world: &Physics2DWorld) -> bool {
    if world.next_body_index < 0 {
        return false;
    }
    for body in &world.bodies {
        let guard = body.read().unwrap();
        if !is_rigid_body2d_state_valid(&guard) {
            return false;
        }
        if !world
            .body_by_index
            .get(&guard.index)
            .is_some_and(|b| Arc::ptr_eq(b, body))
        {
            return false;
        }
    }
    return true;
}

fn is_physics2d_break_threshold_valid(threshold: f32) -> bool {
    return !threshold.is_nan() && threshold >= 0.0;
}

fn is_physics2d_collider_state_valid(collider: &Physics2DCollider) -> bool {
    return is_collision_shape_state_valid(&collider.local)
        && collider.material.density.is_finite()
        && collider.material.density >= 0.0
        && collider.material.friction.is_finite()
        && collider.material.friction >= 0.0
        && collider.material.restitution.is_finite()
        && collider.material.restitution >= 0.0;
}

/// Every contact is valid (TS `isPhysics2DContactStateValid`).
pub fn is_physics2d_contact_state_valid(world: &Physics2DWorld) -> bool {
    for contact in &world.contacts {
        if !is_physics2d_contact_valid(&contact.read().unwrap()) {
            return false;
        }
    }
    return true;
}

/// A contact's counts, surface values and every live point are finite and in range (TS
/// `isPhysics2DContactValid`).
pub fn is_physics2d_contact_valid(contact: &Physics2DContact) -> bool {
    if contact.point_count > contact.points.len()
        || !contact.normal_x.is_finite()
        || !contact.normal_y.is_finite()
        || !contact.friction.is_finite()
        || contact.friction < 0.0
        || !contact.restitution.is_finite()
        || contact.restitution < 0.0
    {
        return false;
    }
    for point in &contact.points[..contact.point_count] {
        let values = [
            point.x,
            point.y,
            point.depth,
            point.r_ax,
            point.r_ay,
            point.r_bx,
            point.r_by,
            point.normal_impulse,
            point.tangent_impulse,
            point.normal_mass,
            point.tangent_mass,
            point.bias,
        ];
        if values.iter().any(|value| !value.is_finite()) {
            return false;
        }
    }
    return true;
}

/// Gravity is finite (TS `isPhysics2DGravityValid`).
pub fn is_physics2d_gravity_valid(world: &Physics2DWorld) -> bool {
    return world.gravity_x.is_finite() && world.gravity_y.is_finite();
}

/// Every joint is valid (TS `isPhysics2DJointStateValid`).
pub fn is_physics2d_joint_state_valid(world: &Physics2DWorld) -> bool {
    for joint in &world.joints {
        if !is_physics2d_joint_valid(&*joint.read().unwrap()) {
            return false;
        }
    }
    return true;
}

fn is_physics2d_joint_valid(joint: &dyn Physics2DJoint) -> bool {
    let fields = joint.joint_fields();
    if fields.kind.is_empty() {
        return false;
    }
    if !is_physics2d_break_threshold_valid(fields.break_force)
        || !is_physics2d_break_threshold_valid(fields.break_torque)
    {
        return false;
    }
    let mut finite = true;
    joint.for_each_number_field(&mut |value| {
        if !value.is_finite() {
            finite = false;
        }
    });
    return finite;
}

/// The previous timestep is unset or a finite positive interval (TS
/// `isPhysics2DPreviousTimestepValid`).
pub fn is_physics2d_previous_timestep_valid(world: &Physics2DWorld) -> bool {
    return world.previous_timestep == 0.0
        || (world.previous_timestep.is_finite() && world.previous_timestep > 0.0);
}

/// Every solver knob is finite and in range (TS `isPhysics2DSolverConfigValid`). The iteration
/// counts are checked by the step itself.
pub fn is_physics2d_solver_config_valid(config: &Physics2DSolverConfig) -> bool {
    return config.sleep_linear_threshold.is_finite()
        && config.sleep_linear_threshold >= 0.0
        && config.sleep_angular_threshold.is_finite()
        && config.sleep_angular_threshold >= 0.0
        && config.time_to_sleep.is_finite()
        && config.time_to_sleep >= 0.0
        && config.penetration_slop.is_finite()
        && config.penetration_slop >= 0.0
        && config.position_correction.is_finite()
        && config.position_correction >= 0.0
        && config.position_correction <= 1.0
        && config.restitution_threshold.is_finite()
        && config.restitution_threshold >= 0.0
        && config.max_ccd_substeps >= 0
        && config.max_ccd_rotation_substeps >= 0;
}

/// A timestep is finite and positive (TS `isPhysics2DTimestepValid`).
pub fn is_physics2d_timestep_valid(dt: f32) -> bool {
    return dt.is_finite() && dt > 0.0;
}

fn is_rigid_body2d_state_valid(body: &RigidBody2D) -> bool {
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
        || !body.inertia.is_finite()
        || body.inertia < 0.0
        || !body.inverse_inertia.is_finite()
        || body.inverse_inertia < 0.0
    {
        return false;
    }
    let finite = [
        body.x,
        body.y,
        body.angle,
        body.velocity_x,
        body.velocity_y,
        body.angular_velocity,
        body.force_x,
        body.force_y,
        body.torque,
        body.center_x,
        body.center_y,
    ];
    if finite.iter().any(|value| !value.is_finite()) {
        return false;
    }
    for collider in &body.colliders {
        if !is_physics2d_collider_state_valid(&collider.read().unwrap()) {
            return false;
        }
    }
    return true;
}
