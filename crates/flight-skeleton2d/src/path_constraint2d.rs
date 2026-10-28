//! Path-following constraint solving (TS `pathConstraint2D.ts`).

use flight_geometry::create_vector2;
use flight_math::RAD_TO_DEG;
use flight_path::{Path, create_path, get_path_length, get_path_position_at_distance};

use crate::deform_path_attachment2d::deform_skeleton_2d_path_attachment;
use crate::skeleton2d::compute_skeleton_2d_bone_world_transform;
use crate::skeleton2d_constraint::{
    Skeleton2DConstraintRegistry, register_skeleton_2d_constraint_solver,
};
use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::types::*;

// flight-lint: allow(f64) arc-length distances stay in the flight-path f64 lane
fn clamp_distance(distance: f64, total: f64) -> f64 {
    return if distance < 0.0 {
        0.0
    } else if distance > total {
        total
    } else {
        distance
    };
}

fn clone_path_attachment(source: &PathAttachment2D) -> PathAttachment2D {
    let mut out = PathAttachment2D::default();
    out.commands = source.commands.clone();
    out.kind = source.kind.clone();
    out.name = source.name.clone();
    out.point_count = source.point_count;
    out.skin = source.skin.clone();
    out.vertices = source.vertices.clone();
    out.winding = source.winding;
    return out;
}

/// Opts a bundle into path constraints (TS `registerSkeleton2DPathConstraintSolver`).
// flight-lint: allow(conform-params) D5: caller-owned constraint registry replaces the source module-global Map
pub fn register_skeleton_2d_path_constraint_solver(registry: &mut Skeleton2DConstraintRegistry) {
    register_skeleton_2d_constraint_solver(
        registry,
        SKELETON_2D_PATH_CONSTRAINT_KIND,
        std::sync::Arc::new(solve_skeleton_2d_path_constraint),
    );
}

fn resolve_path_attachment(skeleton: &Skeleton2D, slot_index: i32) -> Option<PathAttachment2D> {
    let slots = skeleton.slots.as_ref()?;
    if slot_index < 0 || slot_index as usize >= slots.len() {
        return None;
    }
    let attachment = slots[slot_index as usize].attachment.as_ref()?;
    let guard = attachment.read().unwrap();
    if guard.kind() != PATH_ATTACHMENT_2D_KIND {
        return None;
    }
    let concrete = guard.as_any().downcast_ref::<PathAttachment2D>()?;
    return Some(clone_path_attachment(concrete));
}

// flight-lint: allow(f64) arc-length spacing is measured against the flight-path f64 total
fn resolve_spacing(constraint: &Skeleton2DPathConstraint, bone_length: f32, total: f64) -> f64 {
    if constraint.spacing_mode == SKELETON_2D_PATH_SPACING_MODE_PERCENT {
        return constraint.spacing as f64 * total;
    }
    if constraint.spacing_mode == SKELETON_2D_PATH_SPACING_MODE_LENGTH {
        return constraint.spacing as f64 * bone_length as f64;
    }
    return constraint.spacing as f64;
}

/// The solver body with the caller-owned guard state (D5) threaded explicitly.
// flight-lint: allow(conform-extra) Rust-only helper threading the caller-owned guard state into the path solve
// flight-lint: allow(conform-params) D5: the guard state is threaded rather than a module-global slot
// flight-lint: allow(f64) flight-path evaluates and samples in f64; arc-length distances stay in that lane (D1 path precedent)
pub fn solve_path_constraint_with(
    skeleton: &mut Skeleton2D,
    path_constraint: &Skeleton2DPathConstraint,
    guards: &Skeleton2DGuardState,
) {
    let Some(attachment) = resolve_path_attachment(skeleton, path_constraint.target_slot_index)
    else {
        return;
    };
    let slot_bone_index =
        skeleton.slots.as_ref().unwrap()[path_constraint.target_slot_index as usize].bone_index;
    let mut path: Path = create_path(flight_path::PathWinding::NonZero);
    deform_skeleton_2d_path_attachment(
        &mut path,
        &attachment,
        skeleton,
        slot_bone_index,
        None,
        guards,
    );
    let total = get_path_length(&path, None);
    if !(total > 0.0) {
        return;
    }
    let chain = &path_constraint.bone_indices;
    let count = chain.len();
    if count == 0 {
        return;
    }
    let mix = path_constraint.mix;
    let rotate_mix = path_constraint.mix_rotate * mix;
    let translate_x_mix = path_constraint.mix_x * mix;
    let translate_y_mix = path_constraint.mix_y * mix;
    let mut distance = if path_constraint.position_mode == SKELETON_2D_PATH_POSITION_MODE_PERCENT {
        path_constraint.position as f64 * total
    } else {
        path_constraint.position as f64
    };
    let mut positions = vec![0.0f32; count * 2];
    let mut tangents = vec![0.0f32; count * 2];
    for i in 0..count {
        let bone_index = chain[i];
        let bone_length = if bone_index >= 0 && (bone_index as usize) < skeleton.bones.len() {
            skeleton.bones[bone_index as usize].length
        } else {
            0.0
        };
        let mut point = create_vector2(0.0, 0.0);
        let mut tangent = create_vector2(0.0, 0.0);
        get_path_position_at_distance(
            &path,
            clamp_distance(distance, total),
            &mut point,
            &mut tangent,
            None,
        );
        positions[i * 2] = point.x;
        positions[i * 2 + 1] = point.y;
        tangents[i * 2] = tangent.x;
        tangents[i * 2 + 1] = tangent.y;
        distance += resolve_spacing(path_constraint, bone_length, total);
    }
    for i in 0..count {
        let bone_index = chain[i];
        if bone_index < 0 || bone_index as usize >= skeleton.bones.len() {
            continue;
        }
        let o = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
        if translate_x_mix != 0.0 || translate_y_mix != 0.0 {
            let current_x = skeleton.world_matrices[o + 4];
            let current_y = skeleton.world_matrices[o + 5];
            let wanted_x = current_x + (positions[i * 2] - current_x) * translate_x_mix;
            let wanted_y = current_y + (positions[i * 2 + 1] - current_y) * translate_y_mix;
            if let Some(local) = to_parent_space(skeleton, bone_index, wanted_x, wanted_y) {
                let bone = &mut skeleton.bones[bone_index as usize];
                bone.x = local.x;
                bone.y = local.y;
            }
            compute_skeleton_2d_bone_world_transform(skeleton, bone_index);
        }
        if rotate_mix != 0.0 {
            let (mut dir_x, mut dir_y) = if path_constraint.rotate_mode
                == SKELETON_2D_PATH_ROTATE_MODE_CHAIN
                && i + 1 < count
            {
                (
                    positions[(i + 1) * 2] - positions[i * 2],
                    positions[(i + 1) * 2 + 1] - positions[i * 2 + 1],
                )
            } else {
                (tangents[i * 2], tangents[i * 2 + 1])
            };
            if dir_x == 0.0 && dir_y == 0.0 {
                dir_x = tangents[i * 2];
                dir_y = tangents[i * 2 + 1];
            }
            let current =
                skeleton.world_matrices[o + 1].atan2(skeleton.world_matrices[o]) * RAD_TO_DEG;
            let wanted = dir_y.atan2(dir_x) * RAD_TO_DEG;
            let bone = &mut skeleton.bones[bone_index as usize];
            bone.rotation += wrap_angle(wanted - current) * rotate_mix;
            compute_skeleton_2d_bone_world_transform(skeleton, bone_index);
        }
    }
}

// flight-lint: allow(contract-vocabulary) D16 open constraint dispatch takes the shared dyn Skeleton2DConstraint
/// Lays a bone chain along the path attached to the constraint's target slot (TS
/// `solveSkeleton2DPathConstraint`).
pub fn solve_skeleton_2d_path_constraint(
    skeleton: &mut Skeleton2D,
    constraint: &dyn Skeleton2DConstraint,
) {
    let path_constraint = constraint
        .as_any()
        .downcast_ref::<Skeleton2DPathConstraint>()
        .expect("Skeleton2DPathConstraint solver received another kind");
    solve_path_constraint_with(skeleton, path_constraint, &Skeleton2DGuardState::default());
}

fn to_parent_space(
    skeleton: &Skeleton2D,
    bone_index: i32,
    x: f32,
    y: f32,
) -> Option<flight_geometry::Vector2> {
    let parent_index = skeleton.bones[bone_index as usize].parent_index;
    if parent_index < 0 {
        return Some(create_vector2(x, y));
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
    return Some(create_vector2(
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
