//! Skeleton2D animation targets and the binder registry (TS `skeleton2dAnimationTarget.ts`).

use std::collections::HashMap;
use std::sync::Arc;

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, sample_animation_track,
};
use flight_entity::{Kind, Unknown, allocate_entity};

use crate::skeleton2d_guards::{Skeleton2DGuardState, report_skeleton_2d_coerced_interpolation};
use crate::types::*;

/// Wraps a target object in the dispatch envelope a channel's opaque `targetRef` carries, keeping the
/// target's shared `Arc` identity (Rust-only: the kind must travel beside the erased target).
// flight-lint: allow(conform-extra) Rust-only dispatch envelope: Any cannot recover a target kind from an opaque object
pub fn create_skeleton_2d_animation_target_handle(
    kind: &str,
    target: Unknown,
) -> Skeleton2DAnimationTargetHandle {
    return Skeleton2DAnimationTargetHandle {
        kind: String::from(kind),
        target,
    };
}

/// Allocates the caller-owned binder registry (Rust-only D5 constructor replacing the source's lazily
/// created module-global map). The bone and slot binders are pre-registered because posing a rig from a
/// clip is what this package is; every other family opts in explicitly.
// flight-lint: allow(conform-extra) D5: caller-owned binder registry replaces the source module-global map
pub fn create_skeleton_2d_animation_target_registry() -> Skeleton2DAnimationTargetBinderRegistry {
    let mut registry = Skeleton2DAnimationTargetBinderRegistry {
        entries: HashMap::new(),
        key_order: Vec::new(),
    };
    register_skeleton_2d_animation_target_binder(
        &mut registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_BONE,
        Arc::new(bind_skeleton_2d_bone_channel),
    );
    register_skeleton_2d_animation_target_binder(
        &mut registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_SLOT,
        Arc::new(bind_skeleton_2d_slot_channel),
    );
    return registry;
}

/// The binding target for a bone transform channel (TS `createSkeleton2DBoneAnimationTarget`).
pub fn create_skeleton_2d_bone_animation_target(
    bone_index: i32,
    path: &str,
) -> Skeleton2DAnimationTarget {
    let mut out: Skeleton2DAnimationTarget = allocate_entity();
    initialize_skeleton_2d_bone_animation_target(&mut out, bone_index, path);
    return out;
}

/// The binding target for a slot appearance channel (TS `createSkeleton2DSlotAnimationTarget`).
pub fn create_skeleton_2d_slot_animation_target(
    slot_index: i32,
    path: &str,
    attachments: Option<Arc<Vec<Option<Attachment2DRef>>>>,
) -> Skeleton2DSlotAnimationTarget {
    let mut out: Skeleton2DSlotAnimationTarget = allocate_entity();
    initialize_skeleton_2d_slot_animation_target(&mut out, slot_index, path, attachments);
    return out;
}

/// The construction initializer of `create_skeleton_2d_bone_animation_target`.
pub fn initialize_skeleton_2d_bone_animation_target(
    out: &mut Skeleton2DAnimationTarget,
    bone_index: i32,
    path: &str,
) {
    out.bone_index = bone_index;
    out.kind = String::from(SKELETON_2D_ANIMATION_TARGET_KIND_BONE);
    out.path = String::from(path);
}

/// The construction initializer of `create_skeleton_2d_slot_animation_target`.
pub fn initialize_skeleton_2d_slot_animation_target(
    out: &mut Skeleton2DSlotAnimationTarget,
    slot_index: i32,
    path: &str,
    attachments: Option<Arc<Vec<Option<Attachment2DRef>>>>,
) {
    out.attachments = attachments;
    out.kind = String::from(SKELETON_2D_ANIMATION_TARGET_KIND_SLOT);
    out.path = String::from(path);
    out.slot_index = slot_index;
}

fn bind_skeleton_2d_bone_channel(
    channel: &AnimationChannel,
    setup: &Skeleton2D,
    pose: &mut Skeleton2D,
    target: &Unknown,
    time: f32,
    _guards: &Skeleton2DGuardState,
) {
    let Some(target) = target
        .as_ref()
        .and_then(|target| target.downcast_ref::<Skeleton2DAnimationTarget>())
    else {
        return;
    };
    let bone_index = target.bone_index;
    if bone_index < 0
        || bone_index as usize >= pose.bones.len()
        || bone_index as usize >= setup.bones.len()
    {
        return;
    }
    let mut scratch = vec![0.0f32; channel.track.components.max(4)];
    sample_animation_track(&mut scratch, &channel.track, time);
    let setup_bone = &setup.bones[bone_index as usize];
    let pose_bone = &mut pose.bones[bone_index as usize];
    let path = target.path.as_str();
    if path == SKELETON_2D_ANIMATION_PATH_TRANSLATION {
        pose_bone.x = setup_bone.x + scratch[0];
        pose_bone.y = setup_bone.y + scratch[1];
    } else if path == SKELETON_2D_ANIMATION_PATH_ROTATION {
        pose_bone.rotation = setup_bone.rotation + scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_SCALE {
        pose_bone.scale_x = setup_bone.scale_x * scratch[0];
        pose_bone.scale_y = setup_bone.scale_y * scratch[1];
    } else if path == SKELETON_2D_ANIMATION_PATH_SHEAR {
        pose_bone.shear_x = setup_bone.shear_x + scratch[0];
        pose_bone.shear_y = setup_bone.shear_y + scratch[1];
    } else if path == SKELETON_2D_ANIMATION_PATH_TRANSLATION_X {
        pose_bone.x = setup_bone.x + scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_TRANSLATION_Y {
        pose_bone.y = setup_bone.y + scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_SCALE_X {
        pose_bone.scale_x = setup_bone.scale_x * scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_SCALE_Y {
        pose_bone.scale_y = setup_bone.scale_y * scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_SHEAR_X {
        pose_bone.shear_x = setup_bone.shear_x + scratch[0];
    } else if path == SKELETON_2D_ANIMATION_PATH_SHEAR_Y {
        pose_bone.shear_y = setup_bone.shear_y + scratch[0];
    }
}

fn bind_skeleton_2d_slot_attachment(
    channel: &AnimationChannel,
    slot: &mut Slot2D,
    target: &Skeleton2DSlotAnimationTarget,
    time: f32,
    guards: &Skeleton2DGuardState,
) {
    let Some(table) = target.attachments.as_ref() else {
        return;
    };
    let keyframe = find_skeleton_2d_step_keyframe(&channel.track.times, time);
    if keyframe < 0 {
        return;
    }
    if channel.track.interpolation != AnimationInterpolation::Step {
        report_skeleton_2d_coerced_interpolation(
            guards,
            "Attachment",
            interpolation_name(channel.track.interpolation),
            SKELETON_2D_STEP_INTERPOLATION,
        );
    }
    let index = channel.track.values[keyframe as usize * channel.track.components].round() as i32;
    slot.attachment = if index >= 0 && (index as usize) < table.len() {
        table[index as usize].clone()
    } else {
        None
    };
}

fn bind_skeleton_2d_slot_channel(
    channel: &AnimationChannel,
    _setup: &Skeleton2D,
    pose: &mut Skeleton2D,
    target: &Unknown,
    time: f32,
    guards: &Skeleton2DGuardState,
) {
    let Some(target) = target
        .as_ref()
        .and_then(|target| target.downcast_ref::<Skeleton2DSlotAnimationTarget>())
    else {
        return;
    };
    let Some(slots) = pose.slots.as_mut() else {
        return;
    };
    let slot_index = target.slot_index;
    if slot_index < 0 || slot_index as usize >= slots.len() {
        return;
    }
    let slot = &mut slots[slot_index as usize];
    if target.path == SKELETON_2D_SLOT_ANIMATION_PATH_ATTACHMENT {
        bind_skeleton_2d_slot_attachment(channel, slot, target, time, guards);
        return;
    }
    if target.path != SKELETON_2D_SLOT_ANIMATION_PATH_COLOR {
        return;
    }
    let mut scratch = vec![0.0f32; channel.track.components.max(4)];
    sample_animation_track(&mut scratch, &channel.track, time);
    slot.color = Some(
        ((clamp_color_channel(scratch[0]) << 24)
            | (clamp_color_channel(scratch[1]) << 16)
            | (clamp_color_channel(scratch[2]) << 8)
            | clamp_color_channel(scratch[3])) as u32,
    );
}

fn clamp_color_channel(value: f32) -> u32 {
    if value <= 0.0 {
        return 0;
    }
    if value >= 1.0 {
        return 255;
    }
    return (value * 255.0).round() as u32;
}

/// The last keyframe at or before `time`, or `-1` when the track holds none
/// (TS `findSkeleton2DStepKeyframe`). Before the first keyframe the first value holds.
pub fn find_skeleton_2d_step_keyframe(times: &[f32], time: f32) -> i32 {
    let count = times.len();
    if count == 0 {
        return -1;
    }
    let mut index = count - 1;
    loop {
        if times[index] <= time {
            return index as i32;
        }
        if index == 0 {
            break;
        }
        index -= 1;
    }
    return 0;
}

/// The binder registered for `kind`, or `None` when nothing claims it
/// (TS `getSkeleton2DAnimationTargetBinder`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn get_skeleton_2d_animation_target_binder(
    registry: &Skeleton2DAnimationTargetBinderRegistry,
    kind: &str,
) -> Option<Skeleton2DAnimationTargetBinder> {
    return registry.entries.get(kind).cloned();
}

/// A sorted snapshot of every target kind with a binder
/// (TS `getSkeleton2DAnimationTargetBinderKinds`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn get_skeleton_2d_animation_target_binder_kinds(
    registry: &Skeleton2DAnimationTargetBinderRegistry,
) -> Vec<Kind> {
    let mut kinds = Vec::new();
    flight_registry::contract::get_kind_map_keys(&mut kinds, registry);
    return kinds;
}

fn interpolation_name(value: AnimationInterpolation) -> &'static str {
    return match value {
        AnimationInterpolation::Cubic => "Cubic",
        AnimationInterpolation::Linear => "Linear",
        AnimationInterpolation::Step => "Step",
    };
}

/// Claims a target kind for a binder; last write wins while keeping the original position
/// (TS `registerSkeleton2DAnimationTargetBinder`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn register_skeleton_2d_animation_target_binder(
    registry: &mut Skeleton2DAnimationTargetBinderRegistry,
    kind: &str,
    bind: Skeleton2DAnimationTargetBinder,
) {
    *registry = flight_registry::contract::with_kind_map_entry(registry, String::from(kind), bind);
}

/// Releases a target kind's binder (TS `unregisterSkeleton2DAnimationTargetBinder`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn unregister_skeleton_2d_animation_target_binder(
    registry: &mut Skeleton2DAnimationTargetBinderRegistry,
    kind: &str,
) {
    *registry = flight_registry::contract::without_kind_map_entry(registry, String::from(kind));
}
