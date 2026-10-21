//! The built-in joint kinds and their sequential-impulse solvers (TS `joints.ts`). Each solver
//! reaches its kind's fields by narrowing the joint to its concrete struct; a joint of another
//! struct registered under a built-in kind is skipped by that kind's callbacks.

use std::sync::{Arc, LazyLock};

use flight_entity::Ref;

use crate::joint_rows::write_physics2d_soft_row_parameters;
use crate::material::{js_max, js_min};
use crate::solver::{Physics2DBodyPair, apply_physics2d_pair_impulse, lock_physics2d_body_pair};
use crate::types::*;
use crate::world::find_physics2d_body;

/// The kind of a distance joint (TS `Physics2DDistanceJointKind`).
pub const PHYSICS2D_DISTANCE_JOINT_KIND: &str = "Distance";
/// The kind of a gear joint (TS `Physics2DGearJointKind`).
pub const PHYSICS2D_GEAR_JOINT_KIND: &str = "Gear";
/// The kind of a mouse joint (TS `Physics2DMouseJointKind`).
pub const PHYSICS2D_MOUSE_JOINT_KIND: &str = "Mouse";
/// The kind of a prismatic joint (TS `Physics2DPrismaticJointKind`).
pub const PHYSICS2D_PRISMATIC_JOINT_KIND: &str = "Prismatic";
/// The kind of a pulley joint (TS `Physics2DPulleyJointKind`).
pub const PHYSICS2D_PULLEY_JOINT_KIND: &str = "Pulley";
/// The kind of a revolute joint (TS `Physics2DRevoluteJointKind`).
pub const PHYSICS2D_REVOLUTE_JOINT_KIND: &str = "Revolute";
/// The kind of a rope joint (TS `Physics2DRopeJointKind`).
pub const PHYSICS2D_ROPE_JOINT_KIND: &str = "Rope";
/// The kind of a wheel joint (TS `Physics2DWheelJointKind`).
pub const PHYSICS2D_WHEEL_JOINT_KIND: &str = "Wheel";
/// The kind of a weld joint (TS `Physics2DWeldJointKind`).
pub const PHYSICS2D_WELD_JOINT_KIND: &str = "Weld";

const BAUMGARTE: f32 = 0.2;
const DEFAULT_MOUSE_FREQUENCY_HZ: f32 = 5.0;
const EPSILON: f32 = 1e-9;

/// The distance joint solver (TS `physics2DDistanceJointSolver`).
pub static PHYSICS2D_DISTANCE_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            joint.joint_fields_mut().impulse0 = 0.0;
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DDistanceJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (axis_x, axis_y) = joint_anchor_separation(&mut p, &j.fields);
            let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
            let (normalized_x, normalized_y) = if length > EPSILON { (axis_x / length, axis_y / length) } else { (1.0, 0.0) };
            let inverse_mass = axis_inverse_effective_mass(&mut p, &j.fields, normalized_x, normalized_y);
            let separation = length - j.length;
            let mut row = [0.0; 3];
            write_physics2d_soft_row_parameters(
                &mut row,
                if inverse_mass > 0.0 { 1.0 / inverse_mass } else { 0.0 },
                j.frequency_hz,
                j.damping_ratio,
                dt,
                BAUMGARTE / dt,
            );
            let state = begin_joint_solve(&mut j.fields, 5);
            state[0] = row[0];
            state[1] = separation * row[1];
            state[2] = row[2];
            state[3] = normalized_x;
            state[4] = normalized_y;
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let (effective_mass, bias, gamma, axis_x, axis_y) = (state[0], state[1], state[2], state[3], state[4]);
            let velocity = axis_relative_velocity(&mut p, fields, axis_x, axis_y);
            let lambda = -effective_mass * (velocity + bias + gamma * fields.impulse0);
            fields.impulse0 += lambda;
            apply_joint_impulse(&mut p, fields, -lambda * axis_x, -lambda * axis_y);
        }),
        swap_ends: None,
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let impulse = fields.impulse0;
            apply_joint_impulse(&mut p, fields, -impulse * state[3], -impulse * state[4]);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            return write_reaction_from_impulses(
                out,
                fields.impulse0 * state[3],
                fields.impulse0 * state[4],
                0.0,
                inverse_timestep,
            );
        })),
    });
});

/// The gear joint solver (TS `physics2DGearJointSolver`).
pub static PHYSICS2D_GEAR_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            joint.joint_fields_mut().impulse0 = 0.0;
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DGearJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (r_ax, r_ay, r_bx, r_by) = (j.fields.r_ax, j.fields.r_ay, j.fields.r_bx, j.fields.r_by);
            let (coordinate_a, coordinate_b) = (j.coordinate_a, j.coordinate_b);
            let (axis_ax, axis_ay, axis_bx, axis_by) = (j.axis_ax, j.axis_ay, j.axis_bx, j.axis_by);
            let (ratio, constant) = (j.ratio, j.constant);
            let state = begin_joint_solve(&mut j.fields, 9);
            write_gear_jacobian(state, 0, coordinate_a, axis_ax, axis_ay, r_ax, r_ay);
            write_gear_jacobian(state, 3, coordinate_b, axis_bx, axis_by, r_bx, r_by);
            let mass_a = {
                let a = p.a();
                a.inverse_mass * (state[0] * state[0] + state[1] * state[1]) + a.inverse_inertia * state[2] * state[2]
            };
            let mass_b = {
                let b = p.b();
                b.inverse_mass * (state[3] * state[3] + state[4] * state[4]) + b.inverse_inertia * state[5] * state[5]
            };
            let denominator = mass_a + ratio * ratio * mass_b;
            let value_a = gear_coordinate(p.a(), r_ax, r_ay, coordinate_a, state[0], state[1]);
            let value_b = gear_coordinate(p.b(), r_bx, r_by, coordinate_b, state[3], state[4]);
            state[6] = if denominator > 0.0 { 1.0 / denominator } else { 0.0 };
            state[7] = (value_a + ratio * value_b - constant) * (BAUMGARTE / dt);
            state[8] = ratio;
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let velocity_a = {
                let a = p.a();
                a.velocity_x * state[0] + a.velocity_y * state[1] + a.angular_velocity * state[2]
            };
            let velocity_b = {
                let b = p.b();
                b.velocity_x * state[3] + b.velocity_y * state[4] + b.angular_velocity * state[5]
            };
            let lambda = -state[6] * (velocity_a + state[8] * velocity_b + state[7]);
            fields.impulse0 += lambda;
            apply_gear_impulse(&mut p, &state, lambda);
        }),
        swap_ends: Some(Arc::new(|joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DGearJoint>() else {
                return true;
            };
            if j.ratio.abs() < EPSILON {
                return false;
            }
            let ratio = j.ratio;
            std::mem::swap(&mut j.coordinate_a, &mut j.coordinate_b);
            std::mem::swap(&mut j.axis_ax, &mut j.axis_bx);
            std::mem::swap(&mut j.axis_ay, &mut j.axis_by);
            j.ratio = 1.0 / ratio;
            j.constant /= ratio;
            j.fields.impulse0 *= ratio;
            return true;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            apply_gear_impulse(&mut p, &state, fields.impulse0);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            let impulse = fields.impulse0 * state[8];
            return write_reaction_from_impulses(
                out,
                impulse * state[3],
                impulse * state[4],
                impulse * state[5],
                inverse_timestep,
            );
        })),
    });
});

/// The mouse joint solver (TS `physics2DMouseJointSolver`): it drives body B only and keeps it awake.
pub static PHYSICS2D_MOUSE_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            let fields = joint.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
        })),
        keeps_bodies_awake: Some(true),
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DMouseJoint>() else {
                return;
            };
            let Some(body_b) = find_physics2d_body(world, j.fields.body_b) else {
                return;
            };
            let body_b = body_b.read().unwrap();
            let cos = body_b.angle.cos();
            let sin = body_b.angle.sin();
            let local_anchor_x = j.fields.local_anchor_bx - body_b.center_x;
            let local_anchor_y = j.fields.local_anchor_by - body_b.center_y;
            j.fields.r_bx = local_anchor_x * cos - local_anchor_y * sin;
            j.fields.r_by = local_anchor_x * sin + local_anchor_y * cos;
            j.fields.r_ax = 0.0;
            j.fields.r_ay = 0.0;

            let mut row = [0.0; 3];
            write_physics2d_soft_row_parameters(
                &mut row,
                if body_b.inverse_mass > 0.0 { 1.0 / body_b.inverse_mass } else { 0.0 },
                if j.frequency_hz > 0.0 { j.frequency_hz } else { DEFAULT_MOUSE_FREQUENCY_HZ },
                j.damping_ratio,
                dt,
                0.0,
            );
            let bias_factor = row[1];
            let gamma = row[2];
            let (r_bx, r_by) = (j.fields.r_bx, j.fields.r_by);
            let k11 = body_b.inverse_mass + body_b.inverse_inertia * r_by * r_by + gamma;
            let k12 = -body_b.inverse_inertia * r_bx * r_by;
            let k22 = body_b.inverse_mass + body_b.inverse_inertia * r_bx * r_bx + gamma;
            let determinant = k11 * k22 - k12 * k12;
            let inverse_determinant = if determinant.abs() > EPSILON { 1.0 / determinant } else { 0.0 };
            let max_force = j.max_force;
            let state = begin_joint_solve(&mut j.fields, 6);
            state[0] = k22 * inverse_determinant;
            state[1] = -k12 * inverse_determinant;
            state[2] = k11 * inverse_determinant;
            state[3] = gamma;
            state[4] = bias_factor;
            state[5] = dt * max_force;
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DMouseJoint>() else {
                return;
            };
            let Some(state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some(body_b) = find_physics2d_body(world, j.fields.body_b) else {
                return;
            };
            let mut body_b = body_b.write().unwrap();
            let (mass_xx, mass_xy, mass_yy, gamma, bias_factor, max_impulse) =
                (state[0], state[1], state[2], state[3], state[4], state[5]);
            let fields = &mut j.fields;
            let anchor_x = body_b.x + fields.r_bx;
            let anchor_y = body_b.y + fields.r_by;
            let error_x = anchor_x - j.target_x;
            let error_y = anchor_y - j.target_y;
            let velocity_x = body_b.velocity_x - body_b.angular_velocity * fields.r_by;
            let velocity_y = body_b.velocity_y + body_b.angular_velocity * fields.r_bx;
            let constraint_x = velocity_x + bias_factor * error_x + gamma * fields.impulse0;
            let constraint_y = velocity_y + bias_factor * error_y + gamma * fields.impulse1;
            let mut impulse_x = -(mass_xx * constraint_x + mass_xy * constraint_y);
            let mut impulse_y = -(mass_xy * constraint_x + mass_yy * constraint_y);
            let previous_x = fields.impulse0;
            let previous_y = fields.impulse1;
            fields.impulse0 += impulse_x;
            fields.impulse1 += impulse_y;
            let magnitude = (fields.impulse0 * fields.impulse0 + fields.impulse1 * fields.impulse1).sqrt();
            if magnitude > max_impulse && magnitude > 0.0 {
                let scale = max_impulse / magnitude;
                fields.impulse0 *= scale;
                fields.impulse1 *= scale;
            }
            impulse_x = fields.impulse0 - previous_x;
            impulse_y = fields.impulse1 - previous_y;
            body_b.velocity_x += impulse_x * body_b.inverse_mass;
            body_b.velocity_y += impulse_y * body_b.inverse_mass;
            body_b.angular_velocity += body_b.inverse_inertia * (fields.r_bx * impulse_y - fields.r_by * impulse_x);
        }),
        swap_ends: Some(Arc::new(|_joint| {
            return false;
        })),
        uses_body_a: Some(false),
        warm_start: None,
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            if fields.solve_state.is_none() {
                return false;
            }
            return write_reaction_from_impulses(out, fields.impulse0, fields.impulse1, 0.0, inverse_timestep);
        })),
    });
});

/// The prismatic joint solver (TS `physics2DPrismaticJointSolver`).
pub static PHYSICS2D_PRISMATIC_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            let fields = joint.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            fields.impulse2 = 0.0;
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() {
                j.motor_impulse = 0.0;
            }
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let frame = write_axis_frame(&mut p, &j.fields, j.local_axis_ax, j.local_axis_ay);
            let (inv_mass_a, inv_inertia_a, angle_a) = {
                let a = p.a();
                (a.inverse_mass, a.inverse_inertia, a.angle)
            };
            let (inv_mass_b, inv_inertia_b, angle_b) = {
                let b = p.b();
                (b.inverse_mass, b.inverse_inertia, b.angle)
            };
            let k11 = inv_mass_a + inv_mass_b + inv_inertia_a * frame.s1 * frame.s1 + inv_inertia_b * frame.s2 * frame.s2;
            let k12 = inv_inertia_a * frame.s1 + inv_inertia_b * frame.s2;
            let k22 = inv_inertia_a + inv_inertia_b;
            let axis_mass = inv_mass_a + inv_mass_b + inv_inertia_a * frame.a1 * frame.a1 + inv_inertia_b * frame.a2 * frame.a2;
            let reference_angle = j.reference_angle;
            let max_motor_force = j.max_motor_force;
            let state = begin_joint_solve(&mut j.fields, 19);
            write_frame_state(state, &frame);
            state[8] = k11;
            state[9] = k12;
            state[10] = k22;
            state[11] = if axis_mass > 0.0 { 1.0 / axis_mass } else { 0.0 };
            state[12] = (frame.distance_x * frame.perpendicular_x + frame.distance_y * frame.perpendicular_y) * (BAUMGARTE / dt);
            state[13] = (angle_b - angle_a - reference_angle) * (BAUMGARTE / dt);
            state[15] = js_max(0.0, dt * max_motor_force);
            state[16] = frame.distance_x * frame.axis_x + frame.distance_y * frame.axis_y;
            let prismatic_axis_mass = state[11];
            let mut row = [0.0; 3];
            write_physics2d_soft_row_parameters(
                &mut row,
                if j.enable_limit_spring { prismatic_axis_mass } else { 0.0 },
                if j.enable_limit_spring { j.limit_frequency_hz } else { 0.0 },
                j.limit_damping_ratio,
                dt,
                BAUMGARTE / dt,
            );
            let state = j.fields.solve_state.as_mut().unwrap();
            state[14] = row[1];
            state[17] = if j.enable_limit_spring { row[0] } else { prismatic_axis_mass };
            state[18] = row[2];
            let max_impulse = state[15];
            let translation = state[16];
            if j.enable_motor {
                j.motor_impulse = js_min(js_max(j.motor_impulse, -max_impulse), max_impulse);
            } else {
                j.motor_impulse = 0.0;
            }
            if !j.enable_limit {
                j.fields.impulse2 = 0.0;
            } else if (j.upper_translation - j.lower_translation).abs() >= EPSILON {
                if translation < j.lower_translation {
                    if j.fields.impulse2 < 0.0 {
                        j.fields.impulse2 = 0.0;
                    }
                } else if translation > j.upper_translation {
                    if j.fields.impulse2 > 0.0 {
                        j.fields.impulse2 = 0.0;
                    }
                } else {
                    j.fields.impulse2 = 0.0;
                }
            }
        }),
        scale_accumulated_impulses: Some(Arc::new(|joint, timestep_ratio| {
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() {
                j.motor_impulse *= timestep_ratio;
            }
        })),
        solve: Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() else {
                return;
            };
            let Some(state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let frame = read_frame_state(&state);
            let axis_mass = state[11];

            if j.enable_motor && axis_mass > 0.0 {
                let velocity = prismatic_axis_velocity(&mut p, frame.axis_x, frame.axis_y, frame.a1, frame.a2);
                let desired = -axis_mass * (velocity - j.motor_speed);
                let previous = j.motor_impulse;
                let max_impulse = state[15];
                j.motor_impulse = js_min(js_max(previous + desired, -max_impulse), max_impulse);
                apply_prismatic_impulse(&mut p, &frame, 0.0, 0.0, j.motor_impulse - previous);
            }

            if j.enable_limit && axis_mass > 0.0 {
                let translation = state[16];
                let velocity = prismatic_axis_velocity(&mut p, frame.axis_x, frame.axis_y, frame.a1, frame.a2);
                let previous = j.fields.impulse2;
                let bias = state[14];
                let limit_mass = state[17];
                let limit_gamma = state[18];
                let mut total = previous;
                if (j.upper_translation - j.lower_translation).abs() < EPSILON {
                    let error = translation - j.lower_translation;
                    total += -axis_mass * (velocity + error * state[14]);
                } else if translation < j.lower_translation {
                    let lower_previous = if previous < 0.0 { 0.0 } else { previous };
                    let error = translation - j.lower_translation;
                    total = js_max(
                        0.0,
                        lower_previous - limit_mass * (velocity + error * bias + limit_gamma * lower_previous),
                    );
                } else if translation > j.upper_translation {
                    let upper_previous = if previous > 0.0 { 0.0 } else { previous };
                    let error = translation - j.upper_translation;
                    total = js_min(
                        0.0,
                        upper_previous - limit_mass * (velocity + error * bias + limit_gamma * upper_previous),
                    );
                } else {
                    total = 0.0;
                }
                j.fields.impulse2 = total;
                apply_prismatic_impulse(&mut p, &frame, 0.0, 0.0, total - previous);
            }

            let (perpendicular_velocity, angular_velocity) = {
                let (vax, vay, wa) = {
                    let a = p.a();
                    (a.velocity_x, a.velocity_y, a.angular_velocity)
                };
                let (vbx, vby, wb) = {
                    let b = p.b();
                    (b.velocity_x, b.velocity_y, b.angular_velocity)
                };
                (
                    (vbx - vax) * frame.perpendicular_x + (vby - vay) * frame.perpendicular_y + frame.s2 * wb
                        - frame.s1 * wa,
                    wb - wa,
                )
            };
            let c1 = perpendicular_velocity + state[12];
            let c2 = angular_velocity + state[13];
            let determinant = state[8] * state[10] - state[9] * state[9];
            let perpendicular_impulse;
            let angular_impulse;
            if determinant.abs() > EPSILON {
                perpendicular_impulse = -(state[10] * c1 - state[9] * c2) / determinant;
                angular_impulse = -(-state[9] * c1 + state[8] * c2) / determinant;
            } else {
                perpendicular_impulse = if state[8] > 0.0 { -c1 / state[8] } else { 0.0 };
                angular_impulse = if state[10] > 0.0 { -c2 / state[10] } else { 0.0 };
            }
            j.fields.impulse0 += perpendicular_impulse;
            j.fields.impulse1 += angular_impulse;
            apply_prismatic_impulse(&mut p, &frame, perpendicular_impulse, angular_impulse, 0.0);
        }),
        swap_ends: Some(Arc::new(|joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() else {
                return true;
            };
            let axis_x = j.local_axis_ax;
            let axis_y = j.local_axis_ay;
            let cos = j.reference_angle.cos();
            let sin = j.reference_angle.sin();
            j.local_axis_ax = -(axis_x * cos + axis_y * sin);
            j.local_axis_ay = axis_x * sin - axis_y * cos;
            j.reference_angle = -j.reference_angle;
            j.fields.impulse1 = -j.fields.impulse1;
            return true;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPrismaticJoint>() else {
                return;
            };
            let Some(state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let frame = read_frame_state(&state);
            let axis = j.fields.impulse2 + j.motor_impulse;
            apply_prismatic_impulse(&mut p, &frame, j.fields.impulse0, j.fields.impulse1, axis);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            let motor = joint
                .as_any()
                .downcast_ref::<Physics2DPrismaticJoint>()
                .map_or(0.0, |j| j.motor_impulse);
            let axis_impulse = fields.impulse2 + motor;
            return write_reaction_from_impulses(
                out,
                fields.impulse0 * state[2] + axis_impulse * state[0],
                fields.impulse0 * state[3] + axis_impulse * state[1],
                fields.impulse1,
                inverse_timestep,
            );
        })),
    });
});

/// The pulley joint solver (TS `physics2DPulleyJointSolver`).
pub static PHYSICS2D_PULLEY_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            joint.joint_fields_mut().impulse0 = 0.0;
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPulleyJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (r_ax, r_ay, r_bx, r_by) = (j.fields.r_ax, j.fields.r_ay, j.fields.r_bx, j.fields.r_by);
            let (anchor_ax, anchor_ay, inv_mass_a, inv_inertia_a) = {
                let a = p.a();
                (a.x + r_ax, a.y + r_ay, a.inverse_mass, a.inverse_inertia)
            };
            let (anchor_bx, anchor_by, inv_mass_b, inv_inertia_b) = {
                let b = p.b();
                (b.x + r_bx, b.y + r_by, b.inverse_mass, b.inverse_inertia)
            };
            let delta_ax = anchor_ax - j.ground_anchor_ax;
            let delta_ay = anchor_ay - j.ground_anchor_ay;
            let delta_bx = anchor_bx - j.ground_anchor_bx;
            let delta_by = anchor_by - j.ground_anchor_by;
            let length_a = (delta_ax * delta_ax + delta_ay * delta_ay).sqrt();
            let length_b = (delta_bx * delta_bx + delta_by * delta_by).sqrt();
            let unit_ax = if length_a > EPSILON { delta_ax / length_a } else { 0.0 };
            let unit_ay = if length_a > EPSILON { delta_ay / length_a } else { 1.0 };
            let unit_bx = if length_b > EPSILON { delta_bx / length_b } else { 0.0 };
            let unit_by = if length_b > EPSILON { delta_by / length_b } else { 1.0 };
            let cross_a = r_ax * unit_ay - r_ay * unit_ax;
            let cross_b = r_bx * unit_by - r_by * unit_bx;
            let ratio = j.ratio;
            let ratio_squared = ratio * ratio;
            let denominator = inv_mass_a
                + inv_inertia_a * cross_a * cross_a
                + ratio_squared * (inv_mass_b + inv_inertia_b * cross_b * cross_b);
            let constant = j.constant;
            let state = begin_joint_solve(&mut j.fields, 7);
            state[0] = unit_ax;
            state[1] = unit_ay;
            state[2] = unit_bx;
            state[3] = unit_by;
            state[4] = if denominator > 0.0 { 1.0 / denominator } else { 0.0 };
            state[5] = (length_a + ratio * length_b - constant) * (BAUMGARTE / dt);
            state[6] = ratio;
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let velocity_a = pulley_anchor_velocity(p.a(), fields.r_ax, fields.r_ay, state[0], state[1]);
            let velocity_b = pulley_anchor_velocity(p.b(), fields.r_bx, fields.r_by, state[2], state[3]);
            let lambda = -state[4] * (velocity_a + state[6] * velocity_b + state[5]);
            fields.impulse0 += lambda;
            apply_pulley_impulse(&mut p, fields, &state, lambda);
        }),
        swap_ends: Some(Arc::new(|joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DPulleyJoint>() else {
                return true;
            };
            if j.ratio.abs() < EPSILON {
                return false;
            }
            let ratio = j.ratio;
            std::mem::swap(&mut j.ground_anchor_ax, &mut j.ground_anchor_bx);
            std::mem::swap(&mut j.ground_anchor_ay, &mut j.ground_anchor_by);
            j.ratio = 1.0 / ratio;
            j.constant /= ratio;
            j.fields.impulse0 *= ratio;
            return true;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let impulse = fields.impulse0;
            apply_pulley_impulse(&mut p, fields, &state, impulse);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            let impulse = fields.impulse0 * state[6];
            return write_reaction_from_impulses(out, impulse * state[2], impulse * state[3], 0.0, inverse_timestep);
        })),
    });
});

/// The revolute joint solver (TS `physics2DRevoluteJointSolver`).
pub static PHYSICS2D_REVOLUTE_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            let fields = joint.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() {
                j.motor_impulse = 0.0;
            }
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (error_x, error_y) = joint_anchor_separation(&mut p, &j.fields);
            let inverse_inertia_sum = p.a().inverse_inertia + p.b().inverse_inertia;
            let angular_mass = if inverse_inertia_sum > 0.0 { 1.0 / inverse_inertia_sum } else { 0.0 };
            let max_motor_torque = j.max_motor_torque;
            let state = begin_joint_solve(&mut j.fields, 9);
            state[0] = error_x * (BAUMGARTE / dt);
            state[1] = error_y * (BAUMGARTE / dt);
            state[2] = angular_mass;
            state[3] = 0.0;
            state[4] = 0.0;
            state[5] = dt * max_motor_torque;
            let mut row = [0.0; 3];
            write_physics2d_soft_row_parameters(
                &mut row,
                if j.enable_limit_spring { angular_mass } else { 0.0 },
                if j.enable_limit_spring { j.limit_frequency_hz } else { 0.0 },
                j.limit_damping_ratio,
                dt,
                1.0 / dt,
            );
            let state = j.fields.solve_state.as_mut().unwrap();
            state[6] = row[1];
            state[7] = if j.enable_limit_spring { row[0] } else { angular_mass };
            state[8] = row[2];
        }),
        scale_accumulated_impulses: Some(Arc::new(|joint, timestep_ratio| {
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() {
                j.motor_impulse *= timestep_ratio;
            }
        })),
        solve: Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() else {
                return;
            };
            let Some(mut state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let angular_mass = state[2];
            if angular_mass > 0.0 {
                if j.enable_motor {
                    let max_motor_impulse = state[5];
                    let relative = p.b().angular_velocity - p.a().angular_velocity - j.motor_speed;
                    let desired = -angular_mass * relative;
                    let previous = j.motor_impulse;
                    let total = js_min(js_max(previous + desired, -max_motor_impulse), max_motor_impulse);
                    j.motor_impulse = total;
                    let applied = total - previous;
                    apply_angular_impulse(&mut p, applied);
                }

                if j.enable_limit {
                    let bias = state[6];
                    let limit_mass = state[7];
                    let limit_gamma = state[8];
                    let angle = p.b().angle - p.a().angle - j.reference_angle;
                    let lower_error = angle - j.lower_angle;
                    let lower_previous = state[3];
                    let lower_desired = -limit_mass
                        * (p.b().angular_velocity - p.a().angular_velocity
                            + lower_error * bias
                            + limit_gamma * lower_previous);
                    let lower_total = js_max(lower_previous + lower_desired, 0.0);
                    state[3] = lower_total;
                    apply_angular_impulse(&mut p, lower_total - lower_previous);

                    let upper_error = j.upper_angle - angle;
                    let upper_previous = state[4];
                    let upper_desired = -limit_mass
                        * (p.a().angular_velocity - p.b().angular_velocity
                            + upper_error * bias
                            + limit_gamma * upper_previous);
                    let upper_total = js_max(upper_previous + upper_desired, 0.0);
                    state[4] = upper_total;
                    apply_angular_impulse(&mut p, -(upper_total - upper_previous));
                }
            }
            if let Some(stored) = j.fields.solve_state.as_mut() {
                stored[3] = state[3];
                stored[4] = state[4];
            }
            solve_point_constraint(&mut p, &mut j.fields, state[0], state[1]);
        }),
        swap_ends: Some(Arc::new(|joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() else {
                return true;
            };
            let lower = j.lower_angle;
            j.lower_angle = -j.upper_angle;
            j.upper_angle = -lower;
            j.reference_angle = -j.reference_angle;
            j.motor_speed = -j.motor_speed;
            j.motor_impulse = -j.motor_impulse;
            return true;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields();
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let (impulse0, impulse1) = (fields.impulse0, fields.impulse1);
            apply_joint_impulse(&mut p, fields, -impulse0, -impulse1);
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRevoluteJoint>() else {
                return;
            };
            let motor_impulse = j.motor_impulse;
            if !j.enable_motor {
                j.motor_impulse = 0.0;
            } else if motor_impulse != 0.0 {
                apply_angular_impulse(&mut p, motor_impulse);
            }
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            let limit_impulse = state[3] - state[4];
            let motor = joint
                .as_any()
                .downcast_ref::<Physics2DRevoluteJoint>()
                .map_or(0.0, |j| j.motor_impulse);
            return write_reaction_from_impulses(
                out,
                fields.impulse0,
                fields.impulse1,
                motor + limit_impulse,
                inverse_timestep,
            );
        })),
    });
});

/// The rope joint solver (TS `physics2DRopeJointSolver`).
pub static PHYSICS2D_ROPE_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            joint.joint_fields_mut().impulse0 = 0.0;
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DRopeJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (axis_x, axis_y) = joint_anchor_separation(&mut p, &j.fields);
            let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
            let unit_x = if length > EPSILON { axis_x / length } else { 1.0 };
            let unit_y = if length > EPSILON { axis_y / length } else { 0.0 };
            let inverse_mass = axis_inverse_effective_mass(&mut p, &j.fields, unit_x, unit_y);
            let excess = length - j.max_length;
            let active = excess > 0.0;
            let state = begin_joint_solve(&mut j.fields, 5);
            state[0] = if active && inverse_mass > 0.0 { 1.0 / inverse_mass } else { 0.0 };
            state[1] = if active { excess * (BAUMGARTE / dt) } else { 0.0 };
            state[2] = 0.0;
            state[3] = unit_x;
            state[4] = unit_y;
            if !active {
                j.fields.impulse0 = 0.0;
            }
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            if state[0] == 0.0 {
                return;
            }
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let (effective_mass, bias, axis_x, axis_y) = (state[0], state[1], state[3], state[4]);
            let velocity = axis_relative_velocity(&mut p, fields, axis_x, axis_y);
            let mut lambda = -effective_mass * (velocity + bias);
            let previous = fields.impulse0;
            fields.impulse0 = js_min(0.0, previous + lambda);
            lambda = fields.impulse0 - previous;
            apply_joint_impulse(&mut p, fields, -lambda * axis_x, -lambda * axis_y);
        }),
        swap_ends: None,
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let impulse = fields.impulse0;
            apply_joint_impulse(&mut p, fields, -impulse * state[3], -impulse * state[4]);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            return write_reaction_from_impulses(
                out,
                fields.impulse0 * state[3],
                fields.impulse0 * state[4],
                0.0,
                inverse_timestep,
            );
        })),
    });
});

/// The wheel joint solver (TS `physics2DWheelJointSolver`).
pub static PHYSICS2D_WHEEL_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            let fields = joint.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            fields.impulse2 = 0.0;
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWheelJoint>() {
                j.motor_impulse = 0.0;
            }
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWheelJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let frame = write_axis_frame(&mut p, &j.fields, j.local_axis_ax, j.local_axis_ay);
            let (inv_mass_a, inv_inertia_a) = (p.a().inverse_mass, p.a().inverse_inertia);
            let (inv_mass_b, inv_inertia_b) = (p.b().inverse_mass, p.b().inverse_inertia);
            let lateral_denominator =
                inv_mass_a + inv_mass_b + inv_inertia_a * frame.s1 * frame.s1 + inv_inertia_b * frame.s2 * frame.s2;
            let axis_denominator =
                inv_mass_a + inv_mass_b + inv_inertia_a * frame.a1 * frame.a1 + inv_inertia_b * frame.a2 * frame.a2;
            let translation = frame.distance_x * frame.axis_x + frame.distance_y * frame.axis_y;

            let mut spring_mass = 0.0;
            let mut gamma = 0.0;
            let mut spring_bias = 0.0;
            if j.frequency_hz > 0.0 && axis_denominator > 0.0 {
                let mut row = [0.0; 3];
                write_physics2d_soft_row_parameters(
                    &mut row,
                    1.0 / axis_denominator,
                    j.frequency_hz,
                    j.damping_ratio,
                    dt,
                    0.0,
                );
                spring_mass = row[0];
                spring_bias = (translation - j.rest_translation) * row[1];
                gamma = row[2];
            } else {
                j.fields.impulse1 = 0.0;
            }

            let inverse_inertia = inv_inertia_a + inv_inertia_b;
            let max_motor_torque = j.max_motor_torque;
            let state = begin_joint_solve(&mut j.fields, 15);
            write_frame_state(state, &frame);
            state[8] = if lateral_denominator > 0.0 { 1.0 / lateral_denominator } else { 0.0 };
            state[9] = spring_mass;
            state[10] = gamma;
            state[11] = (frame.distance_x * frame.perpendicular_x + frame.distance_y * frame.perpendicular_y) * (BAUMGARTE / dt);
            state[12] = spring_bias;
            state[13] = if inverse_inertia > 0.0 { 1.0 / inverse_inertia } else { 0.0 };
            state[14] = js_max(0.0, dt * max_motor_torque);
            let max_impulse = state[14];
            if j.enable_motor {
                j.motor_impulse = js_min(js_max(j.motor_impulse, -max_impulse), max_impulse);
            } else {
                j.motor_impulse = 0.0;
            }
        }),
        scale_accumulated_impulses: Some(Arc::new(|joint, timestep_ratio| {
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWheelJoint>() {
                j.motor_impulse *= timestep_ratio;
            }
        })),
        solve: Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWheelJoint>() else {
                return;
            };
            let Some(state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let frame = read_frame_state(&state);

            if j.enable_motor && state[13] > 0.0 {
                let desired = -state[13] * (p.b().angular_velocity - p.a().angular_velocity - j.motor_speed);
                let previous = j.motor_impulse;
                j.motor_impulse = js_min(js_max(previous + desired, -state[14]), state[14]);
                let applied = j.motor_impulse - previous;
                apply_angular_impulse(&mut p, applied);
            }

            if state[9] > 0.0 {
                let velocity = prismatic_axis_velocity(&mut p, state[0], state[1], state[6], state[7]);
                let lambda = -state[9] * (velocity + state[12] + state[10] * j.fields.impulse1);
                j.fields.impulse1 += lambda;
                apply_prismatic_impulse(&mut p, &frame, 0.0, 0.0, lambda);
            }

            let lateral_velocity = {
                let (vax, vay, wa) = {
                    let a = p.a();
                    (a.velocity_x, a.velocity_y, a.angular_velocity)
                };
                let (vbx, vby, wb) = {
                    let b = p.b();
                    (b.velocity_x, b.velocity_y, b.angular_velocity)
                };
                (vbx - vax) * state[2] + (vby - vay) * state[3] + state[5] * wb - state[4] * wa
            };
            let lateral_impulse = -state[8] * (lateral_velocity + state[11]);
            j.fields.impulse0 += lateral_impulse;
            apply_prismatic_impulse(&mut p, &frame, lateral_impulse, 0.0, 0.0);
        }),
        swap_ends: Some(Arc::new(|_joint| {
            return false;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWheelJoint>() else {
                return;
            };
            let Some(state) = j.fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let frame = read_frame_state(&state);
            apply_prismatic_impulse(&mut p, &frame, j.fields.impulse0, 0.0, j.fields.impulse1);
            if j.motor_impulse != 0.0 {
                apply_angular_impulse(&mut p, j.motor_impulse);
            }
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            let Some(state) = &fields.solve_state else {
                return false;
            };
            let motor = joint
                .as_any()
                .downcast_ref::<Physics2DWheelJoint>()
                .map_or(0.0, |j| j.motor_impulse);
            return write_reaction_from_impulses(
                out,
                fields.impulse0 * state[2] + fields.impulse1 * state[0],
                fields.impulse0 * state[3] + fields.impulse1 * state[1],
                motor,
                inverse_timestep,
            );
        })),
    });
});

/// The weld joint solver (TS `physics2DWeldJointSolver`).
pub static PHYSICS2D_WELD_JOINT_SOLVER: LazyLock<Physics2DJointSolverRef> = LazyLock::new(|| {
    return Arc::new(Physics2DJointSolver {
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            let fields = joint.joint_fields_mut();
            fields.impulse0 = 0.0;
            fields.impulse1 = 0.0;
            fields.impulse2 = 0.0;
        })),
        keeps_bodies_awake: None,
        prepare: Arc::new(|world, joint, dt| {
            let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWeldJoint>() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, &j.fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            write_joint_anchors(&mut p, &mut j.fields);
            let (error_x, error_y) = joint_anchor_separation(&mut p, &j.fields);
            let angle_error = p.b().angle - p.a().angle - j.reference_angle;
            let angular_mass = p.a().inverse_inertia + p.b().inverse_inertia;
            let state = begin_joint_solve(&mut j.fields, 5);
            state[0] = error_x * (BAUMGARTE / dt);
            state[1] = error_y * (BAUMGARTE / dt);
            state[2] = angle_error * (BAUMGARTE / dt);
            state[3] = if angular_mass > 0.0 { 1.0 / angular_mass } else { 0.0 };
            state[4] = 0.0;
        }),
        scale_accumulated_impulses: None,
        solve: Arc::new(|world, joint| {
            let fields = joint.joint_fields_mut();
            let Some(state) = fields.solve_state.clone() else {
                return;
            };
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            let angular_velocity = p.b().angular_velocity - p.a().angular_velocity;
            let angular_lambda = -state[3] * (angular_velocity + state[2]);
            fields.impulse2 += angular_lambda;
            apply_angular_impulse(&mut p, angular_lambda);
            solve_point_constraint(&mut p, fields, state[0], state[1]);
        }),
        swap_ends: Some(Arc::new(|joint| {
            if let Some(j) = joint.as_any_mut().downcast_mut::<Physics2DWeldJoint>() {
                j.reference_angle = -j.reference_angle;
            }
            return true;
        })),
        uses_body_a: None,
        warm_start: Some(Arc::new(|world, joint| {
            let fields = joint.joint_fields();
            let Some((a, b)) = find_joint_bodies(world, fields) else {
                return;
            };
            let mut p = lock_physics2d_body_pair(&a, &b);
            apply_joint_impulse(&mut p, fields, -fields.impulse0, -fields.impulse1);
            apply_angular_impulse(&mut p, fields.impulse2);
        })),
        write_reaction: Some(Arc::new(|_world, joint, inverse_timestep, out| {
            let fields = joint.joint_fields();
            if fields.solve_state.is_none() {
                return false;
            }
            return write_reaction_from_impulses(
                out,
                fields.impulse0,
                fields.impulse1,
                fields.impulse2,
                inverse_timestep,
            );
        })),
    });
});

// The axis frame the prismatic and wheel rows share: the world axis and its perpendicular, the
// anchor separation and the four lever terms.
struct AxisFrame {
    a1: f32,
    a2: f32,
    axis_x: f32,
    axis_y: f32,
    distance_x: f32,
    distance_y: f32,
    perpendicular_x: f32,
    perpendicular_y: f32,
    s1: f32,
    s2: f32,
}

fn apply_angular_impulse(p: &mut Physics2DBodyPair<'_>, impulse: f32) {
    let a = p.a();
    a.angular_velocity -= a.inverse_inertia * impulse;
    let b = p.b();
    b.angular_velocity += b.inverse_inertia * impulse;
}

fn apply_gear_impulse(p: &mut Physics2DBodyPair<'_>, state: &[f32], impulse: f32) {
    let a = p.a();
    a.velocity_x += a.inverse_mass * state[0] * impulse;
    a.velocity_y += a.inverse_mass * state[1] * impulse;
    a.angular_velocity += a.inverse_inertia * state[2] * impulse;
    let impulse_b = impulse * state[8];
    let b = p.b();
    b.velocity_x += b.inverse_mass * state[3] * impulse_b;
    b.velocity_y += b.inverse_mass * state[4] * impulse_b;
    b.angular_velocity += b.inverse_inertia * state[5] * impulse_b;
}

fn apply_joint_impulse(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields, impulse_x: f32, impulse_y: f32) {
    apply_physics2d_pair_impulse(p, fields.r_ax, fields.r_ay, fields.r_bx, fields.r_by, impulse_x, impulse_y);
}

fn apply_prismatic_impulse(
    p: &mut Physics2DBodyPair<'_>,
    frame: &AxisFrame,
    perpendicular_impulse: f32,
    angular_impulse: f32,
    axis_impulse: f32,
) {
    let impulse_x = perpendicular_impulse * frame.perpendicular_x + axis_impulse * frame.axis_x;
    let impulse_y = perpendicular_impulse * frame.perpendicular_y + axis_impulse * frame.axis_y;
    let a = p.a();
    a.velocity_x -= a.inverse_mass * impulse_x;
    a.velocity_y -= a.inverse_mass * impulse_y;
    a.angular_velocity -= a.inverse_inertia * (perpendicular_impulse * frame.s1 + axis_impulse * frame.a1 + angular_impulse);
    let b = p.b();
    b.velocity_x += b.inverse_mass * impulse_x;
    b.velocity_y += b.inverse_mass * impulse_y;
    b.angular_velocity += b.inverse_inertia * (perpendicular_impulse * frame.s2 + axis_impulse * frame.a2 + angular_impulse);
}

fn apply_pulley_impulse(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields, state: &[f32], impulse: f32) {
    let (unit_ax, unit_ay, unit_bx, unit_by, ratio) = (state[0], state[1], state[2], state[3], state[6]);
    let impulse_ax = impulse * unit_ax;
    let impulse_ay = impulse * unit_ay;
    let impulse_b = impulse * ratio;
    let impulse_bx = impulse_b * unit_bx;
    let impulse_by = impulse_b * unit_by;
    let a = p.a();
    a.velocity_x += a.inverse_mass * impulse_ax;
    a.velocity_y += a.inverse_mass * impulse_ay;
    a.angular_velocity += a.inverse_inertia * (fields.r_ax * impulse_ay - fields.r_ay * impulse_ax);
    let b = p.b();
    b.velocity_x += b.inverse_mass * impulse_bx;
    b.velocity_y += b.inverse_mass * impulse_by;
    b.angular_velocity += b.inverse_inertia * (fields.r_bx * impulse_by - fields.r_by * impulse_bx);
}

fn axis_inverse_effective_mass(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields, axis_x: f32, axis_y: f32) -> f32 {
    let cross_a = fields.r_ax * axis_y - fields.r_ay * axis_x;
    let cross_b = fields.r_bx * axis_y - fields.r_by * axis_x;
    let (inv_mass_a, inv_inertia_a) = (p.a().inverse_mass, p.a().inverse_inertia);
    let (inv_mass_b, inv_inertia_b) = (p.b().inverse_mass, p.b().inverse_inertia);
    return inv_mass_a + inv_mass_b + inv_inertia_a * cross_a * cross_a + inv_inertia_b * cross_b * cross_b;
}

fn axis_relative_velocity(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields, axis_x: f32, axis_y: f32) -> f32 {
    let (vax, vay) = {
        let a = p.a();
        (a.velocity_x - a.angular_velocity * fields.r_ay, a.velocity_y + a.angular_velocity * fields.r_ax)
    };
    let (vbx, vby) = {
        let b = p.b();
        (b.velocity_x - b.angular_velocity * fields.r_by, b.velocity_y + b.angular_velocity * fields.r_bx)
    };
    return (vbx - vax) * axis_x + (vby - vay) * axis_y;
}

fn begin_joint_solve(fields: &mut Physics2DJointFields, length: usize) -> &mut Vec<f32> {
    let state = fields.solve_state.get_or_insert_with(Vec::new);
    // A grown slot is the source's `undefined`, which arithmetic reads as NaN.
    state.resize(length, f32::NAN);
    return state;
}

fn find_joint_bodies(world: &Physics2DWorld, fields: &Physics2DJointFields) -> Option<(Ref<RigidBody2D>, Ref<RigidBody2D>)> {
    let a = find_physics2d_body(world, fields.body_a)?;
    let b = find_physics2d_body(world, fields.body_b)?;
    return Some((a, b));
}

fn gear_coordinate(body: &RigidBody2D, r_x: f32, r_y: f32, kind: Physics2DGearCoordinateKind, axis_x: f32, axis_y: f32) -> f32 {
    if kind == Physics2DGearCoordinateKind::Angular {
        return body.angle;
    }
    return (body.x + r_x) * axis_x + (body.y + r_y) * axis_y;
}

fn joint_anchor_separation(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields) -> (f32, f32) {
    let (ax, ay) = (p.a().x + fields.r_ax, p.a().y + fields.r_ay);
    let (bx, by) = (p.b().x + fields.r_bx, p.b().y + fields.r_by);
    return (bx - ax, by - ay);
}

fn prismatic_axis_velocity(p: &mut Physics2DBodyPair<'_>, axis_x: f32, axis_y: f32, a1: f32, a2: f32) -> f32 {
    let (vax, vay, wa) = {
        let a = p.a();
        (a.velocity_x, a.velocity_y, a.angular_velocity)
    };
    let (vbx, vby, wb) = {
        let b = p.b();
        (b.velocity_x, b.velocity_y, b.angular_velocity)
    };
    return (vbx - vax) * axis_x + (vby - vay) * axis_y + a2 * wb - a1 * wa;
}

fn pulley_anchor_velocity(body: &RigidBody2D, r_x: f32, r_y: f32, unit_x: f32, unit_y: f32) -> f32 {
    let velocity_x = body.velocity_x - body.angular_velocity * r_y;
    let velocity_y = body.velocity_y + body.angular_velocity * r_x;
    return velocity_x * unit_x + velocity_y * unit_y;
}

fn read_frame_state(state: &[f32]) -> AxisFrame {
    return AxisFrame {
        axis_x: state[0],
        axis_y: state[1],
        perpendicular_x: state[2],
        perpendicular_y: state[3],
        s1: state[4],
        s2: state[5],
        a1: state[6],
        a2: state[7],
        distance_x: 0.0,
        distance_y: 0.0,
    };
}

fn solve_point_constraint(p: &mut Physics2DBodyPair<'_>, fields: &mut Physics2DJointFields, bias_x: f32, bias_y: f32) {
    let inverse_mass_x = axis_inverse_effective_mass(p, fields, 1.0, 0.0);
    let velocity_x = axis_relative_velocity(p, fields, 1.0, 0.0);
    let lambda_x = if inverse_mass_x > 0.0 { -(velocity_x + bias_x) / inverse_mass_x } else { 0.0 };
    fields.impulse0 += lambda_x;
    apply_joint_impulse(p, fields, -lambda_x, 0.0);

    let inverse_mass_y = axis_inverse_effective_mass(p, fields, 0.0, 1.0);
    let velocity_y = axis_relative_velocity(p, fields, 0.0, 1.0);
    let lambda_y = if inverse_mass_y > 0.0 { -(velocity_y + bias_y) / inverse_mass_y } else { 0.0 };
    fields.impulse1 += lambda_y;
    apply_joint_impulse(p, fields, 0.0, -lambda_y);
}

fn write_axis_frame(p: &mut Physics2DBodyPair<'_>, fields: &Physics2DJointFields, local_axis_ax: f32, local_axis_ay: f32) -> AxisFrame {
    let local_length = (local_axis_ax * local_axis_ax + local_axis_ay * local_axis_ay).sqrt();
    let local_axis_x = if local_length > EPSILON { local_axis_ax / local_length } else { 1.0 };
    let local_axis_y = if local_length > EPSILON { local_axis_ay / local_length } else { 0.0 };
    let angle_a = p.a().angle;
    let cos = angle_a.cos();
    let sin = angle_a.sin();
    let axis_x = local_axis_x * cos - local_axis_y * sin;
    let axis_y = local_axis_x * sin + local_axis_y * cos;
    let perpendicular_x = -axis_y;
    let perpendicular_y = axis_x;
    let (distance_x, distance_y) = joint_anchor_separation(p, fields);
    let s1 = (distance_x + fields.r_ax) * perpendicular_y - (distance_y + fields.r_ay) * perpendicular_x;
    let s2 = fields.r_bx * perpendicular_y - fields.r_by * perpendicular_x;
    let a1 = (distance_x + fields.r_ax) * axis_y - (distance_y + fields.r_ay) * axis_x;
    let a2 = fields.r_bx * axis_y - fields.r_by * axis_x;
    return AxisFrame {
        a1,
        a2,
        axis_x,
        axis_y,
        distance_x,
        distance_y,
        perpendicular_x,
        perpendicular_y,
        s1,
        s2,
    };
}

fn write_frame_state(state: &mut [f32], frame: &AxisFrame) {
    state[0] = frame.axis_x;
    state[1] = frame.axis_y;
    state[2] = frame.perpendicular_x;
    state[3] = frame.perpendicular_y;
    state[4] = frame.s1;
    state[5] = frame.s2;
    state[6] = frame.a1;
    state[7] = frame.a2;
}

fn write_gear_jacobian(
    state: &mut [f32],
    offset: usize,
    kind: Physics2DGearCoordinateKind,
    axis_x: f32,
    axis_y: f32,
    r_x: f32,
    r_y: f32,
) {
    if kind == Physics2DGearCoordinateKind::Angular {
        state[offset] = 0.0;
        state[offset + 1] = 0.0;
        state[offset + 2] = 1.0;
        return;
    }
    let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
    let unit_x = if length > EPSILON { axis_x / length } else { 1.0 };
    let unit_y = if length > EPSILON { axis_y / length } else { 0.0 };
    state[offset] = unit_x;
    state[offset + 1] = unit_y;
    state[offset + 2] = r_x * unit_y - r_y * unit_x;
}

fn write_joint_anchors(p: &mut Physics2DBodyPair<'_>, fields: &mut Physics2DJointFields) {
    let (cos_a, sin_a, center_ax, center_ay) = {
        let a = p.a();
        (a.angle.cos(), a.angle.sin(), a.center_x, a.center_y)
    };
    let (cos_b, sin_b, center_bx, center_by) = {
        let b = p.b();
        (b.angle.cos(), b.angle.sin(), b.center_x, b.center_y)
    };
    fields.r_ax = (fields.local_anchor_ax - center_ax) * cos_a - (fields.local_anchor_ay - center_ay) * sin_a;
    fields.r_ay = (fields.local_anchor_ax - center_ax) * sin_a + (fields.local_anchor_ay - center_ay) * cos_a;
    fields.r_bx = (fields.local_anchor_bx - center_bx) * cos_b - (fields.local_anchor_by - center_by) * sin_b;
    fields.r_by = (fields.local_anchor_bx - center_bx) * sin_b + (fields.local_anchor_by - center_by) * cos_b;
}

fn write_reaction_from_impulses(
    out: &mut Physics2DJointReaction,
    linear_x: f32,
    linear_y: f32,
    angular: f32,
    inverse_timestep: f32,
) -> bool {
    out.force_x = linear_x * inverse_timestep;
    out.force_y = linear_y * inverse_timestep;
    out.torque = angular * inverse_timestep;
    return true;
}
