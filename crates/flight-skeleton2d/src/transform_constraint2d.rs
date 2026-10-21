//! World-space transform-copy constraint solving (TS `transformConstraint2D.ts`).

use flight_math::RAD_TO_DEG;

use crate::skeleton2d::compute_skeleton_2d_bone_world_transform;
use crate::skeleton2d_constraint::{
    Skeleton2DConstraintRegistry, register_skeleton_2d_constraint_solver,
};
use crate::types::*;

/// Opts a bundle into transform constraints (TS `registerSkeleton2DTransformConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn register_skeleton_2d_transform_constraint_solver(
    registry: &mut Skeleton2DConstraintRegistry,
) {
    register_skeleton_2d_constraint_solver(
        registry,
        SKELETON_2D_TRANSFORM_CONSTRAINT_KIND,
        std::sync::Arc::new(solve_skeleton_2d_transform_constraint),
    );
}

// flight-lint: allow(contract-vocabulary) D16 open constraint dispatch takes the shared dyn Skeleton2DConstraint
/// Copies the target bone's world transform onto each constrained bone per channel (TS
/// `solveSkeleton2DTransformConstraint`).
pub fn solve_skeleton_2d_transform_constraint(
    skeleton: &mut Skeleton2D,
    constraint: &dyn Skeleton2DConstraint,
) {
    let transform = constraint
        .as_any()
        .downcast_ref::<Skeleton2DTransformConstraint>()
        .expect("Skeleton2DTransformConstraint solver received another kind");
    let target = transform.target_bone_index;
    if target < 0 || target as usize >= skeleton.bones.len() {
        return;
    }
    let t = target as usize * SKELETON_2D_MATRIX_STRIDE;
    let world = &skeleton.world_matrices;
    let target_rotation = world[t + 1].atan2(world[t]) * RAD_TO_DEG;
    let target_scale_x = world[t].hypot(world[t + 1]);
    let target_scale_y = world[t + 2].hypot(world[t + 3]);
    let target_shear_y = world[t + 3].atan2(world[t + 2]) * RAD_TO_DEG - 90.0 - target_rotation;
    let target_x = world[t + 4];
    let target_y = world[t + 5];
    let mix = transform.mix;
    let rotate_mix = transform.mix_rotate * mix;
    let scale_x_mix = transform.mix_scale_x * mix;
    let scale_y_mix = transform.mix_scale_y * mix;
    let shear_mix = transform.mix_shear_y * mix;
    let translate_x_mix = transform.mix_x * mix;
    let translate_y_mix = transform.mix_y * mix;
    for bone_index in &transform.bone_indices {
        let bone_index = *bone_index;
        if bone_index < 0 || bone_index as usize >= skeleton.bones.len() {
            continue;
        }
        let o = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
        {
            let world = &skeleton.world_matrices;
            let bone = &mut skeleton.bones[bone_index as usize];
            if rotate_mix != 0.0 {
                let current = world[o + 1].atan2(world[o]) * RAD_TO_DEG;
                let wanted = target_rotation + transform.offset_rotation;
                bone.rotation += wrap_angle(wanted - current) * rotate_mix;
            }
            if scale_x_mix != 0.0 {
                let current = world[o].hypot(world[o + 1]);
                if current > 0.0 {
                    bone.scale_x *= 1.0
                        + ((target_scale_x + transform.offset_scale_x) / current - 1.0)
                            * scale_x_mix;
                }
            }
            if scale_y_mix != 0.0 {
                let current = world[o + 2].hypot(world[o + 3]);
                if current > 0.0 {
                    bone.scale_y *= 1.0
                        + ((target_scale_y + transform.offset_scale_y) / current - 1.0)
                            * scale_y_mix;
                }
            }
            if shear_mix != 0.0 {
                let current_rotation = world[o + 1].atan2(world[o]) * RAD_TO_DEG;
                let current =
                    world[o + 3].atan2(world[o + 2]) * RAD_TO_DEG - 90.0 - current_rotation;
                bone.shear_y +=
                    wrap_angle(target_shear_y + transform.offset_shear_y - current) * shear_mix;
            }
        }
        if translate_x_mix != 0.0 || translate_y_mix != 0.0 {
            let (current_x, current_y) = (
                skeleton.world_matrices[o + 4],
                skeleton.world_matrices[o + 5],
            );
            let wanted_x =
                current_x + (target_x + transform.offset_x - current_x) * translate_x_mix;
            let wanted_y =
                current_y + (target_y + transform.offset_y - current_y) * translate_y_mix;
            if let Some(local) = to_parent_space(skeleton, bone_index, wanted_x, wanted_y) {
                let bone = &mut skeleton.bones[bone_index as usize];
                bone.x = local.x;
                bone.y = local.y;
            }
        }
        compute_skeleton_2d_bone_world_transform(skeleton, bone_index);
    }
}

fn to_parent_space(
    skeleton: &Skeleton2D,
    bone_index: i32,
    x: f32,
    y: f32,
) -> Option<flight_geometry::Vector2> {
    let parent_index = skeleton.bones[bone_index as usize].parent_index;
    if parent_index < 0 {
        return Some(flight_geometry::create_vector2(x, y));
    }
    let world = &skeleton.world_matrices;
    let p = parent_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let (a, b, c, d) = (world[p], world[p + 1], world[p + 2], world[p + 3]);
    let determinant = a * d - c * b;
    if determinant.abs() < MINIMUM_DETERMINANT {
        return None;
    }
    let wx = x - world[p + 4];
    let wy = y - world[p + 5];
    return Some(flight_geometry::create_vector2(
        (d * wx - c * wy) / determinant,
        (a * wy - b * wx) / determinant,
    ));
}

fn wrap_angle(degrees: f32) -> f32 {
    let mut value = degrees % 360.0;
    if value > 180.0 {
        value -= 360.0;
    } else if value < -180.0 {
        value += 360.0;
    }
    return value;
}

const MINIMUM_DETERMINANT: f32 = 1e-9;
