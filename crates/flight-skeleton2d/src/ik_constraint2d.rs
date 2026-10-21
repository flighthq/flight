//! Inverse-kinematics constraint solving (TS `ikConstraint2D.ts`).

use flight_math::RAD_TO_DEG;

use crate::skeleton2d::compute_skeleton_2d_bone_world_transform;
use crate::skeleton2d_constraint::{
    Skeleton2DConstraintRegistry, register_skeleton_2d_constraint_solver,
};
use crate::types::*;

/// Opts a bundle into IK (TS `registerSkeleton2DIkConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn register_skeleton_2d_ik_constraint_solver(registry: &mut Skeleton2DConstraintRegistry) {
    register_skeleton_2d_constraint_solver(
        registry,
        SKELETON_2D_IK_CONSTRAINT_KIND,
        std::sync::Arc::new(solve_skeleton_2d_ik_constraint),
    );
}

fn solve_chain1(
    skeleton: &mut Skeleton2D,
    bone_index: i32,
    target_x: f32,
    target_y: f32,
    ik: &Skeleton2DIkConstraint,
) {
    if bone_index < 0 || bone_index as usize >= skeleton.bones.len() {
        return;
    }
    let (bone_x, bone_y, shear_x) = {
        let bone = &skeleton.bones[bone_index as usize];
        (bone.x, bone.y, bone.shear_x)
    };
    let Some(local) = to_parent_space(skeleton, bone_index, target_x, target_y) else {
        return;
    };
    let dx = local.x - bone_x;
    let dy = local.y - bone_y;
    let rotation = dy.atan2(dx) * RAD_TO_DEG - shear_x;
    let mix = ik.mix;
    {
        let bone = &mut skeleton.bones[bone_index as usize];
        bone.rotation += wrap_angle(rotation - bone.rotation) * mix;
    }
    if ik.stretch || ik.compress {
        let reach = dx.hypot(dy);
        let bone = &mut skeleton.bones[bone_index as usize];
        let length = bone.length * bone.scale_x.abs();
        if length > 0.0 {
            let wanted = reach / length;
            if (wanted > 1.0 && ik.stretch) || (wanted < 1.0 && ik.compress) {
                let scale = 1.0 + (wanted - 1.0) * mix;
                bone.scale_x *= scale;
                bone.scale_y *= scale;
            }
        }
    }
    compute_skeleton_2d_bone_world_transform(skeleton, bone_index);
}

fn solve_chain2(
    skeleton: &mut Skeleton2D,
    parent_index: i32,
    child_index: i32,
    target_x: f32,
    target_y: f32,
    ik: &Skeleton2DIkConstraint,
) {
    if parent_index < 0
        || parent_index as usize >= skeleton.bones.len()
        || child_index < 0
        || child_index as usize >= skeleton.bones.len()
    {
        return;
    }
    let (parent_length, child_length, parent_x, parent_y, parent_shear) = {
        let parent = &skeleton.bones[parent_index as usize];
        let child = &skeleton.bones[child_index as usize];
        (
            parent.length * parent.scale_x.abs(),
            child.length * child.scale_x.abs(),
            parent.x,
            parent.y,
            parent.shear_x,
        )
    };
    if parent_length <= 0.0 || child_length <= 0.0 {
        return;
    }
    let Some(local) = to_parent_space(skeleton, parent_index, target_x, target_y) else {
        return;
    };
    let dx = local.x - parent_x;
    let dy = local.y - parent_y;
    let reach = dx.hypot(dy);
    if reach <= 0.0 {
        return;
    }
    let span = parent_length + child_length;
    let mix = ik.mix;
    let bend_angle = if reach >= span {
        if ik.stretch {
            let scale = 1.0 + (reach / span - 1.0) * mix;
            let parent = &mut skeleton.bones[parent_index as usize];
            parent.scale_x *= scale;
            parent.scale_y *= scale;
        }
        0.0
    } else {
        let cos_joint = (parent_length * parent_length + child_length * child_length
            - reach * reach)
            / (2.0 * parent_length * child_length);
        std::f32::consts::PI - cos_joint.clamp(-1.0, 1.0).acos()
    };
    let cos_parent = (parent_length * parent_length + reach * reach - child_length * child_length)
        / (2.0 * parent_length * reach);
    let parent_offset = if reach >= span {
        0.0
    } else {
        cos_parent.clamp(-1.0, 1.0).acos()
    };
    let direction = if ik.bend_positive { 1.0 } else { -1.0 };
    let aim = dy.atan2(dx);
    let parent_rotation = (aim + parent_offset * direction) * RAD_TO_DEG - parent_shear;
    {
        let parent = &mut skeleton.bones[parent_index as usize];
        parent.rotation += wrap_angle(parent_rotation - parent.rotation) * mix;
    }
    compute_skeleton_2d_bone_world_transform(skeleton, parent_index);
    let child_shear = skeleton.bones[child_index as usize].shear_x;
    let child_rotation = -bend_angle * direction * RAD_TO_DEG - child_shear;
    {
        let child = &mut skeleton.bones[child_index as usize];
        child.rotation += wrap_angle(child_rotation - child.rotation) * mix;
    }
    compute_skeleton_2d_bone_world_transform(skeleton, child_index);
}

// flight-lint: allow(contract-vocabulary) D16 open constraint dispatch takes the shared dyn Skeleton2DConstraint
/// Rotates a one- or two-bone chain so its tip reaches the target bone (TS
/// `solveSkeleton2DIkConstraint`).
pub fn solve_skeleton_2d_ik_constraint(
    skeleton: &mut Skeleton2D,
    constraint: &dyn Skeleton2DConstraint,
) {
    let ik = constraint
        .as_any()
        .downcast_ref::<Skeleton2DIkConstraint>()
        .expect("Skeleton2DIkConstraint solver received another kind");
    let target = ik.target_bone_index;
    if target < 0 || target as usize >= skeleton.bones.len() {
        return;
    }
    let target_x = skeleton.world_matrices[target as usize * SKELETON_2D_MATRIX_STRIDE + 4];
    let target_y = skeleton.world_matrices[target as usize * SKELETON_2D_MATRIX_STRIDE + 5];
    let chain = &ik.bone_indices;
    if chain.len() == 1 {
        solve_chain1(skeleton, chain[0], target_x, target_y, ik);
        return;
    }
    if chain.len() == 2 {
        solve_chain2(skeleton, chain[0], chain[1], target_x, target_y, ik);
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
