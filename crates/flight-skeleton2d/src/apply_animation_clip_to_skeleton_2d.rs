//! Poses a skeleton from an animation clip (TS `applyAnimationClipToSkeleton2D.ts`).

use flight_animation::contract::{AnimationChannel, AnimationClip};
use flight_entity::Unknown;

use crate::skeleton2d_animation_target::get_skeleton_2d_animation_target_binder;
use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::types::*;

/// Poses `pose` from `clip` at `time`, composing each channel onto `setup` through the binder its
/// target kind names. A channel whose target is foreign, unregistered, or out of range is skipped
/// (TS `applyAnimationClipToSkeleton2D`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry and guard state replace the source module globals
pub fn apply_animation_clip_to_skeleton_2d(
    clip: &AnimationClip,
    setup: &Skeleton2D,
    pose: &mut Skeleton2D,
    time: f32,
    registry: &Skeleton2DAnimationTargetBinderRegistry,
    guards: &Skeleton2DGuardState,
) {
    if std::ptr::eq(setup as *const Skeleton2D, pose as *const Skeleton2D) {
        panic!(
            "applyAnimationClipToSkeleton2D: setup and pose must be distinct skeletons — pass a cloneSkeleton2D(setup) as pose"
        );
    }
    let channels: &[AnimationChannel] = &clip.channels;
    for channel in channels {
        let Some(handle) = channel
            .target_ref
            .as_ref()
            .and_then(|handle| handle.downcast_ref::<Skeleton2DAnimationTargetHandle>())
        else {
            continue;
        };
        let Some(bind) = get_skeleton_2d_animation_target_binder(registry, &handle.kind) else {
            continue;
        };
        let target: &Unknown = &handle.target;
        bind(channel, setup, pose, target, time, guards);
    }
}
