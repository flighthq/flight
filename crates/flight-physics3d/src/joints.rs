use std::sync::{Arc, LazyLock};

use crate::*;

pub static PHYSICS_3D_BALL_AND_SOCKET_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(|| point_solver(false));
pub static PHYSICS_3D_FIXED_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(|| point_solver(true));
pub static PHYSICS_3D_HINGE_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(hinge_solver);
pub static PHYSICS_3D_SLIDER_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(slider_solver);
pub static PHYSICS_3D_CONE_TWIST_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(cone_twist_solver);
pub static PHYSICS_3D_GENERIC_6_DOF_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(generic_6_dof_solver);
pub static PHYSICS_3D_DISTANCE_JOINT_SOLVER: LazyLock<Physics3DJointSolver> =
    LazyLock::new(distance_solver);

const FIXED_ANGULAR_MASS: usize = POINT_LENGTH;
const FIXED_ANGULAR_BIAS: usize = FIXED_ANGULAR_MASS + 6;
const FIXED_LENGTH: usize = FIXED_ANGULAR_BIAS + 3;

const HINGE_AXIS_ROW: usize = POINT_LENGTH;
const HINGE_LOCK_ROW0: usize = HINGE_AXIS_ROW + ROW_LENGTH;
const HINGE_LOCK_ROW1: usize = HINGE_LOCK_ROW0 + ROW_LENGTH;
const HINGE_AXIS_MASS: usize = HINGE_LOCK_ROW1 + ROW_LENGTH;
const HINGE_LOCK_MASS0: usize = HINGE_AXIS_MASS + 1;
const HINGE_LOCK_MASS1: usize = HINGE_LOCK_MASS0 + 1;
const HINGE_LOCK_ERROR0: usize = HINGE_LOCK_MASS1 + 1;
const HINGE_LOCK_ERROR1: usize = HINGE_LOCK_ERROR0 + 1;
const HINGE_ANGLE: usize = HINGE_LOCK_ERROR1 + 1;
const HINGE_LOCK_BIAS: usize = HINGE_ANGLE + 1;
const HINGE_LIMIT_BIAS: usize = HINGE_LOCK_BIAS + 1;
const HINGE_MAX_MOTOR: usize = HINGE_LIMIT_BIAS + 1;
const HINGE_LOWER_IMPULSE: usize = HINGE_MAX_MOTOR + 1;
const HINGE_UPPER_IMPULSE: usize = HINGE_LOWER_IMPULSE + 1;
const HINGE_LIMIT_MASS: usize = HINGE_UPPER_IMPULSE + 1;
const HINGE_LIMIT_GAMMA: usize = HINGE_LIMIT_MASS + 1;
const HINGE_LENGTH: usize = HINGE_LIMIT_GAMMA + 1;

const AXIS_EPSILON: f32 = 1e-9;
const CONE_SWING_ROW: usize = POINT_LENGTH;
const CONE_TWIST_ROW: usize = CONE_SWING_ROW + ROW_LENGTH;
const CONE_SWING_MASS: usize = CONE_TWIST_ROW + ROW_LENGTH;
const CONE_SWING_ERROR: usize = CONE_SWING_MASS + 1;
const CONE_SWING_ACTIVE: usize = CONE_SWING_ERROR + 1;
const CONE_TWIST_MASS: usize = CONE_SWING_ACTIVE + 1;
const CONE_TWIST_ANGLE: usize = CONE_TWIST_MASS + 1;
const CONE_LIMIT_BIAS: usize = CONE_TWIST_ANGLE + 1;
const CONE_SWING_IMPULSE: usize = CONE_LIMIT_BIAS + 1;
const CONE_LOWER_TWIST_IMPULSE: usize = CONE_SWING_IMPULSE + 1;
const CONE_UPPER_TWIST_IMPULSE: usize = CONE_LOWER_TWIST_IMPULSE + 1;
const CONE_SWING_SOFT_MASS: usize = CONE_UPPER_TWIST_IMPULSE + 1;
const CONE_SWING_GAMMA: usize = CONE_SWING_SOFT_MASS + 1;
const CONE_TWIST_SOFT_MASS: usize = CONE_SWING_GAMMA + 1;
const CONE_TWIST_GAMMA: usize = CONE_TWIST_SOFT_MASS + 1;
const CONE_LENGTH: usize = CONE_TWIST_GAMMA + 1;

const DOF_FREE: f32 = 0.0;
const DOF_LOCKED: f32 = 1.0;
const DOF_LIMITED: f32 = 2.0;
const DOF_ROWS: usize = 0;
const DOF_MASS: usize = DOF_ROWS + 6 * ROW_LENGTH;
const DOF_VALUE: usize = DOF_MASS + 6;
const DOF_MODE: usize = DOF_VALUE + 6;
const DOF_LOWER_IMPULSE: usize = DOF_MODE + 6;
const DOF_UPPER_IMPULSE: usize = DOF_LOWER_IMPULSE + 6;
const DOF_LOCK_BIAS: usize = DOF_UPPER_IMPULSE + 6;
const DOF_LIMIT_BIAS: usize = DOF_LOCK_BIAS + 1;
const DOF_LIMIT_MASS: usize = DOF_LIMIT_BIAS + 1;
const DOF_LIMIT_GAMMA: usize = DOF_LIMIT_MASS + 6;
const DOF_LENGTH: usize = DOF_LIMIT_GAMMA + 6;

const SLIDER_PERP_ROW0: usize = 0;
const SLIDER_PERP_ROW1: usize = SLIDER_PERP_ROW0 + ROW_LENGTH;
const SLIDER_AXIS_ROW: usize = SLIDER_PERP_ROW1 + ROW_LENGTH;
const SLIDER_ANGULAR_MASS: usize = SLIDER_AXIS_ROW + ROW_LENGTH;
const SLIDER_ANGULAR_BIAS: usize = SLIDER_ANGULAR_MASS + 6;
const SLIDER_PERP_MASS0: usize = SLIDER_ANGULAR_BIAS + 3;
const SLIDER_PERP_MASS1: usize = SLIDER_PERP_MASS0 + 1;
const SLIDER_PERP_ERROR0: usize = SLIDER_PERP_MASS1 + 1;
const SLIDER_PERP_ERROR1: usize = SLIDER_PERP_ERROR0 + 1;
const SLIDER_AXIS_MASS: usize = SLIDER_PERP_ERROR1 + 1;
const SLIDER_TRANSLATION: usize = SLIDER_AXIS_MASS + 1;
const SLIDER_LOCK_BIAS: usize = SLIDER_TRANSLATION + 1;
const SLIDER_LIMIT_BIAS: usize = SLIDER_LOCK_BIAS + 1;
const SLIDER_MAX_MOTOR: usize = SLIDER_LIMIT_BIAS + 1;
const SLIDER_LOWER_IMPULSE: usize = SLIDER_MAX_MOTOR + 1;
const SLIDER_UPPER_IMPULSE: usize = SLIDER_LOWER_IMPULSE + 1;
const SLIDER_LIMIT_MASS: usize = SLIDER_UPPER_IMPULSE + 1;
const SLIDER_LIMIT_GAMMA: usize = SLIDER_LIMIT_MASS + 1;
const SLIDER_LENGTH: usize = SLIDER_LIMIT_GAMMA + 1;

const DISTANCE_ROW: usize = 0;
const DISTANCE_MASS: usize = DISTANCE_ROW + ROW_LENGTH;
const DISTANCE_BIAS: usize = DISTANCE_MASS + 1;
const DISTANCE_GAMMA: usize = DISTANCE_BIAS + 1;
const DISTANCE_LIMIT_MASS: usize = DISTANCE_GAMMA + 1;
const DISTANCE_LIMIT_BIAS: usize = DISTANCE_LIMIT_MASS + 1;
const DISTANCE_SEPARATION: usize = DISTANCE_LIMIT_BIAS + 1;
const DISTANCE_REST_ACTIVE: usize = DISTANCE_SEPARATION + 1;
const DISTANCE_LOWER_IMPULSE: usize = DISTANCE_REST_ACTIVE + 1;
const DISTANCE_UPPER_IMPULSE: usize = DISTANCE_LOWER_IMPULSE + 1;
const DISTANCE_LENGTH: usize = DISTANCE_UPPER_IMPULSE + 1;

fn cone_twist_solver() -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(|world, joint, dt| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                clear_joint_solve(&mut *joint.write().unwrap());
                return;
            };
            let (a, b) = (ar.read().unwrap(), br.read().unwrap());
            let mut value = joint.write().unwrap();
            let Some(cone) = value.as_any_mut().downcast_mut::<Physics3DConeTwistJoint>() else {
                return;
            };
            let mut state = vec![0.0; CONE_LENGTH];
            prepare_point_block(&a, &b, cone, &mut state, dt);
            let (mut rotation_a, mut rotation_b) = ([0.0; 4], [0.0; 4]);
            let (mut basis_a, mut basis_b) = ([0.0; 9], [0.0; 9]);
            read_frame_rotations(&mut rotation_a, &mut rotation_b, &a, &b, &cone.frames);
            read_frame_bases(&mut basis_a, &mut basis_b, &a, &b, &cone.frames);
            let swing_x = basis_a[1] * basis_b[2] - basis_a[2] * basis_b[1];
            let swing_y = basis_a[2] * basis_b[0] - basis_a[0] * basis_b[2];
            let swing_z = basis_a[0] * basis_b[1] - basis_a[1] * basis_b[0];
            let swing_length = (swing_x * swing_x + swing_y * swing_y + swing_z * swing_z).sqrt();
            let swing_active = swing_length > AXIS_EPSILON;
            state[CONE_SWING_ACTIVE] = if swing_active { 1.0 } else { 0.0 };
            if swing_active {
                write_angular_row(
                    &mut state,
                    CONE_SWING_ROW,
                    swing_x / swing_length,
                    swing_y / swing_length,
                    swing_z / swing_length,
                );
                state[CONE_SWING_MASS] = get_row_mass(&a, &b, &state, CONE_SWING_ROW);
                let swing = dot3(&basis_a, 0, &basis_b, 0).clamp(-1.0, 1.0).acos();
                state[CONE_SWING_ERROR] = get_cone_swing_limit(cone, &basis_a, &basis_b) - swing;
            }
            write_angular_row(
                &mut state,
                CONE_TWIST_ROW,
                basis_a[0],
                basis_a[1],
                basis_a[2],
            );
            state[CONE_TWIST_MASS] = get_row_mass(&a, &b, &state, CONE_TWIST_ROW);
            let mut relative = [0.0; 4];
            write_physics_3d_joint_relative_rotation(
                &mut relative,
                rotation_a[0],
                rotation_a[1],
                rotation_a[2],
                rotation_a[3],
                rotation_b[0],
                rotation_b[1],
                rotation_b[2],
                rotation_b[3],
            );
            state[CONE_TWIST_ANGLE] = 2.0 * relative[0].atan2(relative[3]);
            let swing_mass = state[CONE_SWING_MASS];
            write_limit_row_parameters(
                &mut state,
                CONE_SWING_SOFT_MASS,
                CONE_SWING_GAMMA,
                CONE_LIMIT_BIAS,
                swing_mass,
                cone.enable_limit_spring,
                cone.limit_frequency_hz,
                cone.limit_damping_ratio,
                dt,
            );
            let twist_mass = state[CONE_TWIST_MASS];
            write_limit_row_parameters(
                &mut state,
                CONE_TWIST_SOFT_MASS,
                CONE_TWIST_GAMMA,
                CONE_LIMIT_BIAS,
                twist_mass,
                cone.enable_limit_spring,
                cone.limit_frequency_hz,
                cone.limit_damping_ratio,
                dt,
            );
            if !cone.enable_swing_limit {
                cone.swing_limit_impulse = 0.0;
            }
            if !cone.enable_twist_limit {
                cone.lower_twist_impulse = 0.0;
                cone.upper_twist_impulse = 0.0;
            }
            state[CONE_SWING_IMPULSE] = cone.swing_limit_impulse;
            state[CONE_LOWER_TWIST_IMPULSE] = cone.lower_twist_impulse;
            state[CONE_UPPER_TWIST_IMPULSE] = cone.upper_twist_impulse;
            cone.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(|world, joint, _| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let mut value = joint.write().unwrap();
            let Some(cone) = value.as_any_mut().downcast_mut::<Physics3DConeTwistJoint>() else {
                return;
            };
            let Some(mut state) = cone.fields().solve_state.clone() else {
                return;
            };
            if cone.enable_swing_limit
                && state[CONE_SWING_ACTIVE] == 1.0
                && state[CONE_SWING_MASS] > 0.0
            {
                let mass = state[CONE_SWING_SOFT_MASS];
                let error = state[CONE_SWING_ERROR];
                let bias = state[CONE_LIMIT_BIAS];
                let gamma = state[CONE_SWING_GAMMA];
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    CONE_SWING_ROW,
                    mass,
                    error,
                    bias,
                    CONE_SWING_IMPULSE,
                    Some(gamma),
                );
                cone.swing_limit_impulse = state[CONE_SWING_IMPULSE];
            }
            if cone.enable_twist_limit && state[CONE_TWIST_MASS] > 0.0 {
                let twist = state[CONE_TWIST_ANGLE];
                let mass = state[CONE_TWIST_SOFT_MASS];
                let bias = state[CONE_LIMIT_BIAS];
                let gamma = state[CONE_TWIST_GAMMA];
                solve_lower_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    CONE_TWIST_ROW,
                    mass,
                    twist - cone.lower_twist_angle,
                    bias,
                    CONE_LOWER_TWIST_IMPULSE,
                    Some(gamma),
                );
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    CONE_TWIST_ROW,
                    mass,
                    cone.upper_twist_angle - twist,
                    bias,
                    CONE_UPPER_TWIST_IMPULSE,
                    Some(gamma),
                );
                cone.lower_twist_impulse = state[CONE_LOWER_TWIST_IMPULSE];
                cone.upper_twist_impulse = state[CONE_UPPER_TWIST_IMPULSE];
            }
            solve_point_block(&mut a, &mut b, cone, &state);
            cone.fields_mut().solve_state = Some(state);
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        swap_ends: Some(Arc::new(|_| false)),
        write_reaction: Some(Arc::new(|joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            let Some(cone) = value.as_any().downcast_ref::<Physics3DConeTwistJoint>() else {
                return false;
            };
            let Some(state) = cone.fields().solve_state.as_ref() else {
                return false;
            };
            clear_physics_3d_joint_reaction(out);
            let f = cone.fields();
            out.force_x = f.impulse0 * inverse_dt;
            out.force_y = f.impulse1 * inverse_dt;
            out.force_z = f.impulse2 * inverse_dt;
            if cone.enable_swing_limit && state[CONE_SWING_ACTIVE] == 1.0 {
                accumulate_physics_3d_joint_row_reaction(
                    out,
                    cone,
                    state,
                    CONE_SWING_ROW,
                    -cone.swing_limit_impulse * inverse_dt,
                );
            }
            if cone.enable_twist_limit {
                accumulate_physics_3d_joint_row_reaction(
                    out,
                    cone,
                    state,
                    CONE_TWIST_ROW,
                    (cone.lower_twist_impulse - cone.upper_twist_impulse) * inverse_dt,
                );
            }
            true
        })),
        warm_start: Some(Arc::new(|world, joint| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let value = joint.read().unwrap();
            let Some(cone) = value.as_any().downcast_ref::<Physics3DConeTwistJoint>() else {
                return;
            };
            let Some(state) = cone.fields().solve_state.as_ref() else {
                return;
            };
            warm_start_point_block(&mut a, &mut b, cone);
            if cone.enable_swing_limit && state[CONE_SWING_ACTIVE] == 1.0 {
                apply_row(
                    &mut a,
                    &mut b,
                    state,
                    CONE_SWING_ROW,
                    -cone.swing_limit_impulse,
                );
            }
            if cone.enable_twist_limit {
                apply_row(
                    &mut a,
                    &mut b,
                    state,
                    CONE_TWIST_ROW,
                    cone.lower_twist_impulse - cone.upper_twist_impulse,
                );
            }
        })),
        scale_accumulated_impulses: Some(Arc::new(|joint, ratio| {
            if let Some(cone) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DConeTwistJoint>()
            {
                cone.swing_limit_impulse *= ratio;
                cone.lower_twist_impulse *= ratio;
                cone.upper_twist_impulse *= ratio;
            }
        })),
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            if let Some(cone) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DConeTwistJoint>()
            {
                cone.impulse0 = 0.0;
                cone.impulse1 = 0.0;
                cone.impulse2 = 0.0;
                cone.swing_limit_impulse = 0.0;
                cone.lower_twist_impulse = 0.0;
                cone.upper_twist_impulse = 0.0;
            }
        })),
    }
}

fn distance_solver() -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(|world, joint, dt| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                clear_joint_solve(&mut *joint.write().unwrap());
                return;
            };
            let (a, b) = (ar.read().unwrap(), br.read().unwrap());
            let mut value = joint.write().unwrap();
            let Some(distance) = value.as_any_mut().downcast_mut::<Physics3DDistanceJoint>() else {
                return;
            };
            write_physics_3d_joint_anchors(distance, &a, &b);
            let mut axis = [0.0; 3];
            write_physics_3d_joint_separation(&mut axis, &a, &b, distance);
            let separation = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
            if separation > 1e-9 {
                axis = [
                    axis[0] / separation,
                    axis[1] / separation,
                    axis[2] / separation,
                ]
            } else {
                axis = [1.0, 0.0, 0.0]
            }
            let f = distance.fields();
            let mut state = vec![0.0; DISTANCE_LENGTH];
            write_row(
                &mut state,
                DISTANCE_ROW,
                axis[0],
                axis[1],
                axis[2],
                f.r_ay * axis[2] - f.r_az * axis[1],
                f.r_az * axis[0] - f.r_ax * axis[2],
                f.r_ax * axis[1] - f.r_ay * axis[0],
                f.r_by * axis[2] - f.r_bz * axis[1],
                f.r_bz * axis[0] - f.r_bx * axis[2],
                f.r_bx * axis[1] - f.r_by * axis[0],
            );
            let mass = get_row_mass(&a, &b, &state, DISTANCE_ROW);
            state[DISTANCE_SEPARATION] = separation;
            state[DISTANCE_LIMIT_MASS] = mass;
            state[DISTANCE_LIMIT_BIAS] = 1.0 / dt;
            let rest = distance.enable_spring || !distance.enable_limit;
            state[DISTANCE_REST_ACTIVE] = if rest { 1.0 } else { 0.0 };
            let error = separation - distance.length;
            if rest && distance.enable_spring {
                let mut soft = [0.0; 3];
                write_physics_3d_soft_row_parameters(
                    &mut soft,
                    mass,
                    distance.frequency_hz,
                    distance.damping_ratio,
                    dt,
                    0.2 / dt,
                );
                state[DISTANCE_MASS] = soft[0];
                state[DISTANCE_BIAS] = error * soft[1];
                state[DISTANCE_GAMMA] = soft[2];
            } else {
                state[DISTANCE_MASS] = mass;
                state[DISTANCE_BIAS] = error * 0.2 / dt;
            }
            if !distance.enable_limit {
                distance.lower_limit_impulse = 0.0;
                distance.upper_limit_impulse = 0.0;
            }
            state[DISTANCE_LOWER_IMPULSE] = distance.lower_limit_impulse;
            state[DISTANCE_UPPER_IMPULSE] = distance.upper_limit_impulse;
            distance.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(|world, joint, _| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let mut value = joint.write().unwrap();
            let Some(distance) = value.as_any_mut().downcast_mut::<Physics3DDistanceJoint>() else {
                return;
            };
            let Some(mut state) = distance.fields().solve_state.clone() else {
                return;
            };
            if state[DISTANCE_REST_ACTIVE] == 1.0 {
                let velocity = get_row_velocity(&a, &b, &state, DISTANCE_ROW);
                let impulse = -state[DISTANCE_MASS]
                    * (velocity + state[DISTANCE_BIAS] + state[DISTANCE_GAMMA] * distance.impulse0);
                distance.impulse0 += impulse;
                apply_row(&mut a, &mut b, &state, DISTANCE_ROW, impulse);
            }
            if distance.enable_limit {
                let separation = state[DISTANCE_SEPARATION];
                let limit_mass = state[DISTANCE_LIMIT_MASS];
                let limit_bias = state[DISTANCE_LIMIT_BIAS];
                solve_lower_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    DISTANCE_ROW,
                    limit_mass,
                    separation - distance.min_length,
                    limit_bias,
                    DISTANCE_LOWER_IMPULSE,
                    None,
                );
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    DISTANCE_ROW,
                    limit_mass,
                    distance.max_length - separation,
                    limit_bias,
                    DISTANCE_UPPER_IMPULSE,
                    None,
                );
                distance.lower_limit_impulse = state[DISTANCE_LOWER_IMPULSE];
                distance.upper_limit_impulse = state[DISTANCE_UPPER_IMPULSE];
            }
            distance.fields_mut().solve_state = Some(state);
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        // Distance carries only unsigned scalars along a line, whose meaning is unchanged by exchanging
        // its ends. The row direction flips with the bodies, so neither limit accumulator is reversed.
        swap_ends: Some(Arc::new(|_| true)),
        write_reaction: Some(Arc::new(|joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            let Some(distance) = value.as_any().downcast_ref::<Physics3DDistanceJoint>() else {
                return false;
            };
            let Some(state) = distance.fields().solve_state.as_ref() else {
                return false;
            };
            clear_physics_3d_joint_reaction(out);
            let impulse =
                distance.impulse0 + distance.lower_limit_impulse - distance.upper_limit_impulse;
            accumulate_physics_3d_joint_row_reaction(
                out,
                distance,
                state,
                DISTANCE_ROW,
                impulse * inverse_dt,
            );
            true
        })),
        warm_start: Some(Arc::new(|world, joint| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let value = joint.read().unwrap();
            let Some(distance) = value.as_any().downcast_ref::<Physics3DDistanceJoint>() else {
                return;
            };
            let Some(state) = distance.fields().solve_state.as_ref() else {
                return;
            };
            apply_row(
                &mut a,
                &mut b,
                state,
                DISTANCE_ROW,
                distance.impulse0 + distance.lower_limit_impulse - distance.upper_limit_impulse,
            );
        })),
        scale_accumulated_impulses: Some(Arc::new(|joint, ratio| {
            if let Some(distance) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DDistanceJoint>()
            {
                distance.lower_limit_impulse *= ratio;
                distance.upper_limit_impulse *= ratio;
            }
        })),
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            if let Some(distance) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DDistanceJoint>()
            {
                distance.impulse0 = 0.0;
                distance.lower_limit_impulse = 0.0;
                distance.upper_limit_impulse = 0.0;
            }
        })),
    }
}

fn dot3(a: &[f32], a_offset: usize, b: &[f32], b_offset: usize) -> f32 {
    a[a_offset] * b[b_offset]
        + a[a_offset + 1] * b[b_offset + 1]
        + a[a_offset + 2] * b[b_offset + 2]
}

fn generic_6_dof_solver() -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(|world, joint, dt| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                clear_joint_solve(&mut *joint.write().unwrap());
                return;
            };
            let (a, b) = (ar.read().unwrap(), br.read().unwrap());
            let mut value = joint.write().unwrap();
            let Some(dof) = value
                .as_any_mut()
                .downcast_mut::<Physics3DGeneric6DofJoint>()
            else {
                return;
            };
            dof.lower_limit_impulses.resize(6, 0.0);
            dof.upper_limit_impulses.resize(6, 0.0);
            let mut state = vec![0.0; DOF_LENGTH];
            write_physics_3d_joint_anchors(dof, &a, &b);
            let mut separation = [0.0; 3];
            write_physics_3d_joint_separation(&mut separation, &a, &b, dof);
            let (mut rotation_a, mut rotation_b) = ([0.0; 4], [0.0; 4]);
            let (mut basis_a, mut basis_b) = ([0.0; 9], [0.0; 9]);
            read_frame_rotations(&mut rotation_a, &mut rotation_b, &a, &b, &dof.frames);
            read_frame_bases(&mut basis_a, &mut basis_b, &a, &b, &dof.frames);
            let mut rotation_error = [0.0; 3];
            write_physics_3d_joint_rotation_error(
                &mut rotation_error,
                rotation_a[0],
                rotation_a[1],
                rotation_a[2],
                rotation_a[3],
                rotation_b[0],
                rotation_b[1],
                rotation_b[2],
                rotation_b[3],
            );
            let (lower, upper) = read_dof_bounds(dof);
            for axis in 0..6 {
                let row_offset = DOF_ROWS + axis * ROW_LENGTH;
                let basis_offset = (axis % 3) * 3;
                let mode = if lower[axis] > upper[axis] {
                    DOF_FREE
                } else if lower[axis] == upper[axis] {
                    DOF_LOCKED
                } else {
                    DOF_LIMITED
                };
                state[DOF_MODE + axis] = mode;
                if mode != DOF_LIMITED {
                    dof.lower_limit_impulses[axis] = 0.0;
                    dof.upper_limit_impulses[axis] = 0.0;
                }
                state[DOF_LOWER_IMPULSE + axis] = dof.lower_limit_impulses[axis];
                state[DOF_UPPER_IMPULSE + axis] = dof.upper_limit_impulses[axis];
                if mode == DOF_FREE {
                    continue;
                }
                if axis < 3 {
                    write_linear_axis_row(
                        &mut state,
                        row_offset,
                        dof,
                        &basis_a,
                        basis_offset,
                        &separation,
                    );
                    state[DOF_VALUE + axis] = dot3(&separation, 0, &basis_a, basis_offset);
                } else {
                    write_angular_row(
                        &mut state,
                        row_offset,
                        basis_a[basis_offset],
                        basis_a[basis_offset + 1],
                        basis_a[basis_offset + 2],
                    );
                    state[DOF_VALUE + axis] = dot3(&rotation_error, 0, &basis_a, basis_offset);
                }
                state[DOF_MASS + axis] = get_row_mass(&a, &b, &state, row_offset);
            }
            state[DOF_LOCK_BIAS] = 0.2 / dt;
            for axis in 0..6 {
                if state[DOF_MODE + axis] != DOF_LIMITED {
                    continue;
                }
                let row_mass = state[DOF_MASS + axis];
                write_limit_row_parameters(
                    &mut state,
                    DOF_LIMIT_MASS + axis,
                    DOF_LIMIT_GAMMA + axis,
                    DOF_LIMIT_BIAS,
                    row_mass,
                    dof.enable_limit_spring,
                    dof.limit_frequency_hz,
                    dof.limit_damping_ratio,
                    dt,
                );
            }
            dof.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(|world, joint, _| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let mut value = joint.write().unwrap();
            let Some(dof) = value
                .as_any_mut()
                .downcast_mut::<Physics3DGeneric6DofJoint>()
            else {
                return;
            };
            let Some(mut state) = dof.fields().solve_state.clone() else {
                return;
            };
            let (lower, upper) = read_dof_bounds(dof);
            for axis in 0..6 {
                let mode = state[DOF_MODE + axis];
                if mode == DOF_FREE || state[DOF_MASS + axis] <= 0.0 {
                    continue;
                }
                let row_offset = DOF_ROWS + axis * ROW_LENGTH;
                let coordinate = state[DOF_VALUE + axis];
                if mode == DOF_LOCKED {
                    solve_equality_row(
                        &mut a,
                        &mut b,
                        dof,
                        axis,
                        &state,
                        row_offset,
                        state[DOF_MASS + axis],
                        coordinate - lower[axis],
                        state[DOF_LOCK_BIAS],
                    );
                    continue;
                }
                let mass = state[DOF_LIMIT_MASS + axis];
                let bias = state[DOF_LIMIT_BIAS];
                let gamma = state[DOF_LIMIT_GAMMA + axis];
                solve_lower_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    row_offset,
                    mass,
                    coordinate - lower[axis],
                    bias,
                    DOF_LOWER_IMPULSE + axis,
                    Some(gamma),
                );
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    row_offset,
                    mass,
                    upper[axis] - coordinate,
                    bias,
                    DOF_UPPER_IMPULSE + axis,
                    Some(gamma),
                );
                dof.lower_limit_impulses[axis] = state[DOF_LOWER_IMPULSE + axis];
                dof.upper_limit_impulses[axis] = state[DOF_UPPER_IMPULSE + axis];
            }
            dof.fields_mut().solve_state = Some(state);
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        swap_ends: Some(Arc::new(|_| false)),
        write_reaction: Some(Arc::new(|joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            let Some(dof) = value.as_any().downcast_ref::<Physics3DGeneric6DofJoint>() else {
                return false;
            };
            let Some(state) = dof.fields().solve_state.as_ref() else {
                return false;
            };
            clear_physics_3d_joint_reaction(out);
            for axis in 0..6 {
                let mode = state[DOF_MODE + axis];
                let row_offset = DOF_ROWS + axis * ROW_LENGTH;
                let impulse = if mode == DOF_LOCKED {
                    read_joint_impulse(dof, axis)
                } else if mode == DOF_LIMITED {
                    dof.lower_limit_impulses[axis] - dof.upper_limit_impulses[axis]
                } else {
                    continue;
                };
                accumulate_physics_3d_joint_row_reaction(
                    out,
                    dof,
                    state,
                    row_offset,
                    impulse * inverse_dt,
                );
            }
            true
        })),
        warm_start: Some(Arc::new(|world, joint| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let value = joint.read().unwrap();
            let Some(dof) = value.as_any().downcast_ref::<Physics3DGeneric6DofJoint>() else {
                return;
            };
            let Some(state) = dof.fields().solve_state.as_ref() else {
                return;
            };
            for axis in 0..6 {
                let mode = state[DOF_MODE + axis];
                let row_offset = DOF_ROWS + axis * ROW_LENGTH;
                let impulse = if mode == DOF_LOCKED {
                    read_joint_impulse(dof, axis)
                } else if mode == DOF_LIMITED {
                    dof.lower_limit_impulses[axis] - dof.upper_limit_impulses[axis]
                } else {
                    continue;
                };
                apply_row(&mut a, &mut b, state, row_offset, impulse);
            }
        })),
        scale_accumulated_impulses: Some(Arc::new(|joint, ratio| {
            if let Some(dof) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DGeneric6DofJoint>()
            {
                for axis in 0..6 {
                    dof.lower_limit_impulses[axis] *= ratio;
                    dof.upper_limit_impulses[axis] *= ratio;
                }
            }
        })),
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            if let Some(dof) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DGeneric6DofJoint>()
            {
                dof.lower_limit_impulses.fill(0.0);
                dof.upper_limit_impulses.fill(0.0);
                dof.impulse0 = 0.0;
                dof.impulse1 = 0.0;
                dof.impulse2 = 0.0;
                dof.impulse3 = 0.0;
                dof.impulse4 = 0.0;
                dof.impulse5 = 0.0;
            }
        })),
    }
}

fn get_cone_swing_limit(
    cone: &Physics3DConeTwistJoint,
    basis_a: &[f32; 9],
    basis_b: &[f32; 9],
) -> f32 {
    if cone.swing_limit_y <= 0.0 || cone.swing_limit_z <= 0.0 {
        return cone.swing_limit_y.min(cone.swing_limit_z);
    }
    let toward_y = dot3(basis_b, 0, basis_a, 3);
    let toward_z = dot3(basis_b, 0, basis_a, 6);
    let tilt = (toward_y * toward_y + toward_z * toward_z).sqrt();
    if tilt <= AXIS_EPSILON {
        return cone.swing_limit_y.min(cone.swing_limit_z);
    }
    let unit_y = toward_y / tilt / cone.swing_limit_y;
    let unit_z = toward_z / tilt / cone.swing_limit_z;
    1.0 / (unit_y * unit_y + unit_z * unit_z).sqrt()
}

fn get_signed_axis_angle(basis_a: &[f32; 9], basis_b: &[f32; 9]) -> f32 {
    let cross_x = basis_a[4] * basis_b[5] - basis_a[5] * basis_b[4];
    let cross_y = basis_a[5] * basis_b[3] - basis_a[3] * basis_b[5];
    let cross_z = basis_a[3] * basis_b[4] - basis_a[4] * basis_b[3];
    let sine = cross_x * basis_a[0] + cross_y * basis_a[1] + cross_z * basis_a[2];
    sine.atan2(dot3(basis_a, 3, basis_b, 3))
}

fn hinge_solver() -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(|world, joint, dt| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                clear_joint_solve(&mut *joint.write().unwrap());
                return;
            };
            let (a, b) = (ar.read().unwrap(), br.read().unwrap());
            let mut value = joint.write().unwrap();
            let Some(hinge) = value.as_any_mut().downcast_mut::<Physics3DHingeJoint>() else {
                return;
            };
            let mut state = vec![0.0; HINGE_LENGTH];
            prepare_point_block(&a, &b, hinge, &mut state, dt);
            let (mut rotation_a, mut rotation_b) = ([0.0; 4], [0.0; 4]);
            let (mut basis_a, mut basis_b) = ([0.0; 9], [0.0; 9]);
            read_frame_rotations(&mut rotation_a, &mut rotation_b, &a, &b, &hinge.frames);
            read_frame_bases(&mut basis_a, &mut basis_b, &a, &b, &hinge.frames);
            write_angular_row(
                &mut state,
                HINGE_AXIS_ROW,
                basis_a[0],
                basis_a[1],
                basis_a[2],
            );
            write_angular_row(
                &mut state,
                HINGE_LOCK_ROW0,
                basis_a[3],
                basis_a[4],
                basis_a[5],
            );
            write_angular_row(
                &mut state,
                HINGE_LOCK_ROW1,
                basis_a[6],
                basis_a[7],
                basis_a[8],
            );
            state[HINGE_AXIS_MASS] = get_row_mass(&a, &b, &state, HINGE_AXIS_ROW);
            state[HINGE_LOCK_MASS0] = get_row_mass(&a, &b, &state, HINGE_LOCK_ROW0);
            state[HINGE_LOCK_MASS1] = get_row_mass(&a, &b, &state, HINGE_LOCK_ROW1);
            let mut error = [0.0; 3];
            write_physics_3d_joint_rotation_error(
                &mut error,
                rotation_a[0],
                rotation_a[1],
                rotation_a[2],
                rotation_a[3],
                rotation_b[0],
                rotation_b[1],
                rotation_b[2],
                rotation_b[3],
            );
            state[HINGE_LOCK_ERROR0] = dot3(&error, 0, &basis_a, 3);
            state[HINGE_LOCK_ERROR1] = dot3(&error, 0, &basis_a, 6);
            state[HINGE_ANGLE] = get_signed_axis_angle(&basis_a, &basis_b);
            state[HINGE_LOCK_BIAS] = 0.2 / dt;
            let axis_mass = state[HINGE_AXIS_MASS];
            write_limit_row_parameters(
                &mut state,
                HINGE_LIMIT_MASS,
                HINGE_LIMIT_GAMMA,
                HINGE_LIMIT_BIAS,
                axis_mass,
                hinge.enable_limit_spring,
                hinge.limit_frequency_hz,
                hinge.limit_damping_ratio,
                dt,
            );
            state[HINGE_MAX_MOTOR] = (dt * hinge.max_motor_torque).max(0.0);
            if !hinge.enable_limit {
                hinge.lower_limit_impulse = 0.0;
                hinge.upper_limit_impulse = 0.0;
            }
            state[HINGE_LOWER_IMPULSE] = hinge.lower_limit_impulse;
            state[HINGE_UPPER_IMPULSE] = hinge.upper_limit_impulse;
            if hinge.enable_motor {
                hinge.motor_impulse = hinge
                    .motor_impulse
                    .clamp(-state[HINGE_MAX_MOTOR], state[HINGE_MAX_MOTOR]);
            } else {
                hinge.motor_impulse = 0.0;
            }
            hinge.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(|world, joint, _| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let mut value = joint.write().unwrap();
            let Some(hinge) = value.as_any_mut().downcast_mut::<Physics3DHingeJoint>() else {
                return;
            };
            let Some(mut state) = hinge.fields().solve_state.clone() else {
                return;
            };
            if hinge.enable_motor && state[HINGE_AXIS_MASS] > 0.0 {
                hinge.motor_impulse = solve_motor_row(
                    &mut a,
                    &mut b,
                    &state,
                    HINGE_AXIS_ROW,
                    state[HINGE_AXIS_MASS],
                    hinge.motor_speed,
                    state[HINGE_MAX_MOTOR],
                    hinge.motor_impulse,
                );
            }
            if hinge.enable_limit && state[HINGE_AXIS_MASS] > 0.0 {
                let angle = state[HINGE_ANGLE];
                let mass = state[HINGE_LIMIT_MASS];
                let bias = state[HINGE_LIMIT_BIAS];
                let gamma = state[HINGE_LIMIT_GAMMA];
                solve_lower_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    HINGE_AXIS_ROW,
                    mass,
                    angle - hinge.lower_angle,
                    bias,
                    HINGE_LOWER_IMPULSE,
                    Some(gamma),
                );
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    HINGE_AXIS_ROW,
                    mass,
                    hinge.upper_angle - angle,
                    bias,
                    HINGE_UPPER_IMPULSE,
                    Some(gamma),
                );
                hinge.lower_limit_impulse = state[HINGE_LOWER_IMPULSE];
                hinge.upper_limit_impulse = state[HINGE_UPPER_IMPULSE];
            }
            solve_equality_row(
                &mut a,
                &mut b,
                hinge,
                3,
                &state,
                HINGE_LOCK_ROW0,
                state[HINGE_LOCK_MASS0],
                state[HINGE_LOCK_ERROR0],
                state[HINGE_LOCK_BIAS],
            );
            solve_equality_row(
                &mut a,
                &mut b,
                hinge,
                4,
                &state,
                HINGE_LOCK_ROW1,
                state[HINGE_LOCK_MASS1],
                state[HINGE_LOCK_ERROR1],
                state[HINGE_LOCK_BIAS],
            );
            solve_point_block(&mut a, &mut b, hinge, &state);
            hinge.fields_mut().solve_state = Some(state);
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        swap_ends: Some(Arc::new(swap_hinge_joint)),
        write_reaction: Some(Arc::new(|joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            let Some(hinge) = value.as_any().downcast_ref::<Physics3DHingeJoint>() else {
                return false;
            };
            let Some(state) = hinge.fields().solve_state.as_ref() else {
                return false;
            };
            clear_physics_3d_joint_reaction(out);
            let f = hinge.fields();
            out.force_x = f.impulse0 * inverse_dt;
            out.force_y = f.impulse1 * inverse_dt;
            out.force_z = f.impulse2 * inverse_dt;
            accumulate_physics_3d_joint_row_reaction(
                out,
                hinge,
                state,
                HINGE_LOCK_ROW0,
                f.impulse3 * inverse_dt,
            );
            accumulate_physics_3d_joint_row_reaction(
                out,
                hinge,
                state,
                HINGE_LOCK_ROW1,
                f.impulse4 * inverse_dt,
            );
            let mut axial = if hinge.enable_motor {
                hinge.motor_impulse
            } else {
                0.0
            };
            if hinge.enable_limit {
                axial += hinge.lower_limit_impulse - hinge.upper_limit_impulse;
            }
            accumulate_physics_3d_joint_row_reaction(
                out,
                hinge,
                state,
                HINGE_AXIS_ROW,
                axial * inverse_dt,
            );
            true
        })),
        warm_start: Some(Arc::new(|world, joint| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let value = joint.read().unwrap();
            let Some(hinge) = value.as_any().downcast_ref::<Physics3DHingeJoint>() else {
                return;
            };
            let Some(state) = hinge.fields().solve_state.as_ref() else {
                return;
            };
            warm_start_point_block(&mut a, &mut b, hinge);
            apply_row(&mut a, &mut b, state, HINGE_LOCK_ROW0, hinge.impulse3);
            apply_row(&mut a, &mut b, state, HINGE_LOCK_ROW1, hinge.impulse4);
            if hinge.enable_motor {
                apply_row(&mut a, &mut b, state, HINGE_AXIS_ROW, hinge.motor_impulse);
            }
            if hinge.enable_limit {
                apply_row(
                    &mut a,
                    &mut b,
                    state,
                    HINGE_AXIS_ROW,
                    hinge.lower_limit_impulse - hinge.upper_limit_impulse,
                );
            }
        })),
        scale_accumulated_impulses: Some(Arc::new(|joint, ratio| {
            if let Some(hinge) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DHingeJoint>()
            {
                hinge.motor_impulse *= ratio;
                hinge.lower_limit_impulse *= ratio;
                hinge.upper_limit_impulse *= ratio;
            }
        })),
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            if let Some(hinge) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DHingeJoint>()
            {
                hinge.impulse0 = 0.0;
                hinge.impulse1 = 0.0;
                hinge.impulse2 = 0.0;
                hinge.impulse3 = 0.0;
                hinge.impulse4 = 0.0;
                hinge.motor_impulse = 0.0;
                hinge.lower_limit_impulse = 0.0;
                hinge.upper_limit_impulse = 0.0;
            }
        })),
    }
}

fn joint_bodies(
    world: &Physics3DWorld,
    joint: &Physics3DJointRef,
) -> Option<(RigidBody3DRef, RigidBody3DRef)> {
    let value = joint.read().unwrap();
    let f = value.fields();
    let body_a = world.body_by_index.get(&f.body_a)?.clone();
    let body_b = world.body_by_index.get(&f.body_b)?.clone();
    (!Arc::ptr_eq(&body_a, &body_b)).then_some((body_a, body_b))
}

fn joint_frames(joint: &dyn Physics3DJoint) -> Option<Physics3DJointFrames> {
    let any = joint.as_any();
    if let Some(v) = any.downcast_ref::<Physics3DFixedJoint>() {
        Some(v.frames)
    } else if let Some(v) = any.downcast_ref::<Physics3DHingeJoint>() {
        Some(v.frames)
    } else if let Some(v) = any.downcast_ref::<Physics3DSliderJoint>() {
        Some(v.frames)
    } else if let Some(v) = any.downcast_ref::<Physics3DConeTwistJoint>() {
        Some(v.frames)
    } else {
        any.downcast_ref::<Physics3DGeneric6DofJoint>()
            .map(|v| v.frames)
    }
}

fn point_solver(lock_rotation: bool) -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(move |world, joint, dt| {
            let (body_a, body_b) = match joint_bodies(world, joint) {
                Some(pair) => pair,
                None => {
                    clear_joint_solve(&mut *joint.write().unwrap());
                    return;
                }
            };
            let (a, b) = (body_a.read().unwrap(), body_b.read().unwrap());
            let mut value = joint.write().unwrap();
            let mut state = vec![
                0.0;
                if lock_rotation {
                    FIXED_LENGTH
                } else {
                    POINT_LENGTH
                }
            ];
            prepare_point_block(&a, &b, &mut *value, &mut state, dt);
            if lock_rotation {
                if let Some(frames) = joint_frames(&*value) {
                    let (mut qa, mut qb) = ([0.0; 4], [0.0; 4]);
                    read_frame_rotations(&mut qa, &mut qb, &a, &b, &frames);
                    prepare_angular_block(
                        &mut state,
                        FIXED_ANGULAR_MASS,
                        FIXED_ANGULAR_BIAS,
                        &a,
                        &b,
                        &qa,
                        &qb,
                        dt,
                    );
                }
            }
            value.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(move |world, joint, _| {
            let Some((body_a, body_b)) = joint_bodies(world, joint) else {
                return;
            };
            let Some(state) = joint.read().unwrap().fields().solve_state.clone() else {
                return;
            };
            let (mut a, mut b) = (body_a.write().unwrap(), body_b.write().unwrap());
            let mut value = joint.write().unwrap();
            solve_point_block(&mut a, &mut b, &mut *value, &state);
            if lock_rotation && state.len() >= FIXED_LENGTH {
                solve_angular_block(
                    &mut a,
                    &mut b,
                    &mut *value,
                    &state,
                    FIXED_ANGULAR_MASS,
                    FIXED_ANGULAR_BIAS,
                );
            }
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        swap_ends: if lock_rotation {
            Some(Arc::new(swap_frame_joint))
        } else {
            None
        },
        write_reaction: Some(Arc::new(move |joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            if value.fields().solve_state.is_none() {
                return false;
            }
            clear_physics_3d_joint_reaction(out);
            let f = value.fields();
            out.force_x = f.impulse0 * inverse_dt;
            out.force_y = f.impulse1 * inverse_dt;
            out.force_z = f.impulse2 * inverse_dt;
            if lock_rotation {
                out.torque_x = f.impulse3 * inverse_dt;
                out.torque_y = f.impulse4 * inverse_dt;
                out.torque_z = f.impulse5 * inverse_dt;
            }
            true
        })),
        warm_start: Some(Arc::new(move |world, joint| {
            let Some((body_a, body_b)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (body_a.write().unwrap(), body_b.write().unwrap());
            let value = joint.read().unwrap();
            warm_start_point_block(&mut a, &mut b, &*value);
            if lock_rotation {
                warm_start_angular_block(&mut a, &mut b, &*value);
            }
        })),
        scale_accumulated_impulses: None,
        clear_accumulated_impulses: Some(Arc::new(move |joint| {
            let mut value = joint.write().unwrap();
            let f = value.fields_mut();
            f.impulse0 = 0.0;
            f.impulse1 = 0.0;
            f.impulse2 = 0.0;
            if lock_rotation {
                f.impulse3 = 0.0;
                f.impulse4 = 0.0;
                f.impulse5 = 0.0;
            }
        })),
    }
}

fn read_dof_bounds(dof: &Physics3DGeneric6DofJoint) -> ([f32; 6], [f32; 6]) {
    (
        [
            dof.lower_linear_x,
            dof.lower_linear_y,
            dof.lower_linear_z,
            dof.lower_angular_x,
            dof.lower_angular_y,
            dof.lower_angular_z,
        ],
        [
            dof.upper_linear_x,
            dof.upper_linear_y,
            dof.upper_linear_z,
            dof.upper_angular_x,
            dof.upper_angular_y,
            dof.upper_angular_z,
        ],
    )
}

fn slider_solver() -> Physics3DJointSolver {
    Physics3DJointSolver {
        prepare: Arc::new(|world, joint, dt| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                clear_joint_solve(&mut *joint.write().unwrap());
                return;
            };
            let (a, b) = (ar.read().unwrap(), br.read().unwrap());
            let mut value = joint.write().unwrap();
            let Some(slider) = value.as_any_mut().downcast_mut::<Physics3DSliderJoint>() else {
                return;
            };
            let mut state = vec![0.0; SLIDER_LENGTH];
            write_physics_3d_joint_anchors(slider, &a, &b);
            let mut separation = [0.0; 3];
            write_physics_3d_joint_separation(&mut separation, &a, &b, slider);
            let (mut rotation_a, mut rotation_b) = ([0.0; 4], [0.0; 4]);
            let (mut basis_a, mut basis_b) = ([0.0; 9], [0.0; 9]);
            read_frame_rotations(&mut rotation_a, &mut rotation_b, &a, &b, &slider.frames);
            read_frame_bases(&mut basis_a, &mut basis_b, &a, &b, &slider.frames);
            write_linear_axis_row(
                &mut state,
                SLIDER_AXIS_ROW,
                slider,
                &basis_a,
                0,
                &separation,
            );
            write_linear_axis_row(
                &mut state,
                SLIDER_PERP_ROW0,
                slider,
                &basis_a,
                3,
                &separation,
            );
            write_linear_axis_row(
                &mut state,
                SLIDER_PERP_ROW1,
                slider,
                &basis_a,
                6,
                &separation,
            );
            state[SLIDER_AXIS_MASS] = get_row_mass(&a, &b, &state, SLIDER_AXIS_ROW);
            state[SLIDER_PERP_MASS0] = get_row_mass(&a, &b, &state, SLIDER_PERP_ROW0);
            state[SLIDER_PERP_MASS1] = get_row_mass(&a, &b, &state, SLIDER_PERP_ROW1);
            state[SLIDER_TRANSLATION] = dot3(&separation, 0, &basis_a, 0);
            state[SLIDER_PERP_ERROR0] = dot3(&separation, 0, &basis_a, 3);
            state[SLIDER_PERP_ERROR1] = dot3(&separation, 0, &basis_a, 6);
            prepare_angular_block(
                &mut state,
                SLIDER_ANGULAR_MASS,
                SLIDER_ANGULAR_BIAS,
                &a,
                &b,
                &rotation_a,
                &rotation_b,
                dt,
            );
            state[SLIDER_LOCK_BIAS] = 0.2 / dt;
            let axis_mass = state[SLIDER_AXIS_MASS];
            write_limit_row_parameters(
                &mut state,
                SLIDER_LIMIT_MASS,
                SLIDER_LIMIT_GAMMA,
                SLIDER_LIMIT_BIAS,
                axis_mass,
                slider.enable_limit_spring,
                slider.limit_frequency_hz,
                slider.limit_damping_ratio,
                dt,
            );
            state[SLIDER_MAX_MOTOR] = (dt * slider.max_motor_force).max(0.0);
            if !slider.enable_limit {
                slider.lower_limit_impulse = 0.0;
                slider.upper_limit_impulse = 0.0;
            }
            state[SLIDER_LOWER_IMPULSE] = slider.lower_limit_impulse;
            state[SLIDER_UPPER_IMPULSE] = slider.upper_limit_impulse;
            if slider.enable_motor {
                slider.motor_impulse = slider
                    .motor_impulse
                    .clamp(-state[SLIDER_MAX_MOTOR], state[SLIDER_MAX_MOTOR]);
            } else {
                slider.motor_impulse = 0.0;
            }
            slider.fields_mut().solve_state = Some(state);
        }),
        solve: Arc::new(|world, joint, _| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let mut value = joint.write().unwrap();
            let Some(slider) = value.as_any_mut().downcast_mut::<Physics3DSliderJoint>() else {
                return;
            };
            let Some(mut state) = slider.fields().solve_state.clone() else {
                return;
            };
            if slider.enable_motor && state[SLIDER_AXIS_MASS] > 0.0 {
                slider.motor_impulse = solve_motor_row(
                    &mut a,
                    &mut b,
                    &state,
                    SLIDER_AXIS_ROW,
                    state[SLIDER_AXIS_MASS],
                    slider.motor_speed,
                    state[SLIDER_MAX_MOTOR],
                    slider.motor_impulse,
                );
            }
            if slider.enable_limit && state[SLIDER_AXIS_MASS] > 0.0 {
                let translation = state[SLIDER_TRANSLATION];
                let mass = state[SLIDER_LIMIT_MASS];
                let bias = state[SLIDER_LIMIT_BIAS];
                let gamma = state[SLIDER_LIMIT_GAMMA];
                solve_lower_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    SLIDER_AXIS_ROW,
                    mass,
                    translation - slider.lower_translation,
                    bias,
                    SLIDER_LOWER_IMPULSE,
                    Some(gamma),
                );
                solve_upper_limit_row(
                    &mut a,
                    &mut b,
                    &mut state,
                    SLIDER_AXIS_ROW,
                    mass,
                    slider.upper_translation - translation,
                    bias,
                    SLIDER_UPPER_IMPULSE,
                    Some(gamma),
                );
                slider.lower_limit_impulse = state[SLIDER_LOWER_IMPULSE];
                slider.upper_limit_impulse = state[SLIDER_UPPER_IMPULSE];
            }
            solve_angular_block(
                &mut a,
                &mut b,
                slider,
                &state,
                SLIDER_ANGULAR_MASS,
                SLIDER_ANGULAR_BIAS,
            );
            solve_equality_row(
                &mut a,
                &mut b,
                slider,
                0,
                &state,
                SLIDER_PERP_ROW0,
                state[SLIDER_PERP_MASS0],
                state[SLIDER_PERP_ERROR0],
                state[SLIDER_LOCK_BIAS],
            );
            solve_equality_row(
                &mut a,
                &mut b,
                slider,
                1,
                &state,
                SLIDER_PERP_ROW1,
                state[SLIDER_PERP_MASS1],
                state[SLIDER_PERP_ERROR1],
                state[SLIDER_LOCK_BIAS],
            );
            slider.fields_mut().solve_state = Some(state);
        }),
        uses_body_a: None,
        keeps_bodies_awake: None,
        swap_ends: Some(Arc::new(swap_slider_joint)),
        write_reaction: Some(Arc::new(|joint, inverse_dt, out| {
            let value = joint.read().unwrap();
            let Some(slider) = value.as_any().downcast_ref::<Physics3DSliderJoint>() else {
                return false;
            };
            let Some(state) = slider.fields().solve_state.as_ref() else {
                return false;
            };
            clear_physics_3d_joint_reaction(out);
            accumulate_physics_3d_joint_row_reaction(
                out,
                slider,
                state,
                SLIDER_PERP_ROW0,
                slider.impulse0 * inverse_dt,
            );
            accumulate_physics_3d_joint_row_reaction(
                out,
                slider,
                state,
                SLIDER_PERP_ROW1,
                slider.impulse1 * inverse_dt,
            );
            let mut axial = if slider.enable_motor {
                slider.motor_impulse
            } else {
                0.0
            };
            if slider.enable_limit {
                axial += slider.lower_limit_impulse - slider.upper_limit_impulse;
            }
            accumulate_physics_3d_joint_row_reaction(
                out,
                slider,
                state,
                SLIDER_AXIS_ROW,
                axial * inverse_dt,
            );
            out.torque_x = slider.impulse3 * inverse_dt;
            out.torque_y = slider.impulse4 * inverse_dt;
            out.torque_z = slider.impulse5 * inverse_dt;
            true
        })),
        warm_start: Some(Arc::new(|world, joint| {
            let Some((ar, br)) = joint_bodies(world, joint) else {
                return;
            };
            let (mut a, mut b) = (ar.write().unwrap(), br.write().unwrap());
            let value = joint.read().unwrap();
            let Some(slider) = value.as_any().downcast_ref::<Physics3DSliderJoint>() else {
                return;
            };
            let Some(state) = slider.fields().solve_state.as_ref() else {
                return;
            };
            warm_start_angular_block(&mut a, &mut b, slider);
            apply_row(&mut a, &mut b, state, SLIDER_PERP_ROW0, slider.impulse0);
            apply_row(&mut a, &mut b, state, SLIDER_PERP_ROW1, slider.impulse1);
            if slider.enable_motor {
                apply_row(&mut a, &mut b, state, SLIDER_AXIS_ROW, slider.motor_impulse);
            }
            if slider.enable_limit {
                apply_row(
                    &mut a,
                    &mut b,
                    state,
                    SLIDER_AXIS_ROW,
                    slider.lower_limit_impulse - slider.upper_limit_impulse,
                );
            }
        })),
        scale_accumulated_impulses: Some(Arc::new(|joint, ratio| {
            if let Some(slider) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DSliderJoint>()
            {
                slider.motor_impulse *= ratio;
                slider.lower_limit_impulse *= ratio;
                slider.upper_limit_impulse *= ratio;
            }
        })),
        clear_accumulated_impulses: Some(Arc::new(|joint| {
            if let Some(slider) = joint
                .write()
                .unwrap()
                .as_any_mut()
                .downcast_mut::<Physics3DSliderJoint>()
            {
                slider.impulse0 = 0.0;
                slider.impulse1 = 0.0;
                slider.impulse3 = 0.0;
                slider.impulse4 = 0.0;
                slider.impulse5 = 0.0;
                slider.motor_impulse = 0.0;
                slider.lower_limit_impulse = 0.0;
                slider.upper_limit_impulse = 0.0;
            }
        })),
    }
}

fn swap_frame_joint(joint: &Physics3DJointRef) -> bool {
    let mut value = joint.write().unwrap();
    let any = value.as_any_mut();
    if let Some(v) = any.downcast_mut::<Physics3DFixedJoint>() {
        swap_physics_3d_joint_frames(&mut v.frames);
    }
    true
}

fn swap_hinge_joint(joint: &Physics3DJointRef) -> bool {
    let mut value = joint.write().unwrap();
    let Some(hinge) = value.as_any_mut().downcast_mut::<Physics3DHingeJoint>() else {
        return false;
    };
    swap_physics_3d_joint_frames(&mut hinge.frames);
    let lower = hinge.lower_angle;
    hinge.lower_angle = -hinge.upper_angle;
    hinge.upper_angle = -lower;
    hinge.motor_speed = -hinge.motor_speed;
    hinge.motor_impulse = -hinge.motor_impulse;
    std::mem::swap(
        &mut hinge.lower_limit_impulse,
        &mut hinge.upper_limit_impulse,
    );
    true
}

fn swap_slider_joint(joint: &Physics3DJointRef) -> bool {
    let mut value = joint.write().unwrap();
    let Some(slider) = value.as_any_mut().downcast_mut::<Physics3DSliderJoint>() else {
        return false;
    };
    swap_physics_3d_joint_frames(&mut slider.frames);
    let lower = slider.lower_translation;
    slider.lower_translation = -slider.upper_translation;
    slider.upper_translation = -lower;
    slider.motor_speed = -slider.motor_speed;
    slider.motor_impulse = -slider.motor_impulse;
    std::mem::swap(
        &mut slider.lower_limit_impulse,
        &mut slider.upper_limit_impulse,
    );
    true
}

fn write_limit_row_parameters(
    state: &mut [f32],
    mass_slot: usize,
    gamma_slot: usize,
    bias_slot: usize,
    row_mass: f32,
    soft: bool,
    frequency_hz: f32,
    damping_ratio: f32,
    dt: f32,
) {
    if soft && frequency_hz > 0.0 {
        let mut parameters = [0.0; 3];
        write_physics_3d_soft_row_parameters(
            &mut parameters,
            row_mass,
            frequency_hz,
            damping_ratio,
            dt,
            1.0 / dt,
        );
        state[mass_slot] = parameters[0];
        state[bias_slot] = parameters[1];
        state[gamma_slot] = parameters[2];
    } else {
        state[mass_slot] = row_mass;
        state[bias_slot] = 1.0 / dt;
        state[gamma_slot] = 0.0;
    }
}

fn write_linear_axis_row(
    state: &mut [f32],
    offset: usize,
    joint: &dyn Physics3DJoint,
    basis: &[f32; 9],
    basis_offset: usize,
    separation: &[f32; 3],
) {
    let direction_x = basis[basis_offset];
    let direction_y = basis[basis_offset + 1];
    let direction_z = basis[basis_offset + 2];
    let f = joint.fields();
    let arm_ax = f.r_ax + separation[0];
    let arm_ay = f.r_ay + separation[1];
    let arm_az = f.r_az + separation[2];
    write_row(
        state,
        offset,
        direction_x,
        direction_y,
        direction_z,
        arm_ay * direction_z - arm_az * direction_y,
        arm_az * direction_x - arm_ax * direction_z,
        arm_ax * direction_y - arm_ay * direction_x,
        f.r_by * direction_z - f.r_bz * direction_y,
        f.r_bz * direction_x - f.r_bx * direction_z,
        f.r_bx * direction_y - f.r_by * direction_x,
    );
}
