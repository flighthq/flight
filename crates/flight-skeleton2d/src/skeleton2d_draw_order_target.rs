//! Draw-order animation targets and their binder (TS `skeleton2dDrawOrderTarget.ts`).

use std::sync::{Arc, RwLock};

use flight_animation::contract::{
    AnimationChannel, AnimationInterpolation, create_animation_channel, create_animation_track,
};
use flight_entity::{Ref, Unknown, allocate_entity};
use flight_node::contract::{
    NodeOrderList, NodeRef, add_node_order_list_entry, clear_node_order_list,
};

use crate::skeleton2d_animation_target::{
    find_skeleton_2d_step_keyframe, register_skeleton_2d_animation_target_binder,
    unregister_skeleton_2d_animation_target_binder,
};
use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::skeleton2d_guards::report_skeleton_2d_coerced_interpolation;
use crate::types::*;

/// The binding target for a draw-order channel (TS `createSkeleton2DDrawOrderAnimationTarget`).
pub fn create_skeleton_2d_draw_order_animation_target(
    nodes: &[Option<NodeRef>],
    order_list: &Ref<NodeOrderList>,
) -> Skeleton2DDrawOrderAnimationTarget {
    let mut out: Skeleton2DDrawOrderAnimationTarget = allocate_entity();
    initialize_skeleton_2d_draw_order_animation_target(&mut out, nodes, order_list);
    return out;
}

/// Turns a timeline into the Step channel that drives it, or `None` for a timeline with no keyframes
/// or one whose orderings are not a whole number of per-keyframe orderings
/// (TS `createSkeleton2DDrawOrderChannel`).
pub fn create_skeleton_2d_draw_order_channel(
    timeline: &Skeleton2DDrawOrderTimeline,
    nodes: &[Option<NodeRef>],
    order_list: &Ref<NodeOrderList>,
) -> Option<AnimationChannel> {
    let keyframes = timeline.times.len();
    if keyframes == 0 {
        return None;
    }
    if timeline.orderings.len() % keyframes != 0 {
        return None;
    }
    let slot_count = timeline.orderings.len() / keyframes;
    if slot_count == 0 {
        return None;
    }
    let mut track = create_animation_track();
    track.components = slot_count;
    track.interpolation = AnimationInterpolation::Step;
    track.times = timeline.times.clone();
    track.values = timeline.orderings.clone();
    let target = create_skeleton_2d_draw_order_animation_target(nodes, order_list);
    let handle = Skeleton2DAnimationTargetHandle {
        kind: String::from(SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER),
        target: Some(Arc::new(target)),
    };
    let track = Arc::new(RwLock::new(track));
    return Some(create_animation_channel(&track, Some(Arc::new(handle))));
}

/// The construction initializer of `create_skeleton_2d_draw_order_animation_target`.
pub fn initialize_skeleton_2d_draw_order_animation_target(
    out: &mut Skeleton2DDrawOrderAnimationTarget,
    nodes: &[Option<NodeRef>],
    order_list: &Ref<NodeOrderList>,
) {
    out.kind = String::from(SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER);
    out.nodes = nodes.to_vec();
    out.order_list = order_list.clone();
}

// flight-lint: allow(f64) D1: NodeOrderList sort keys are JS numbers and are stored as f64
fn bind_skeleton_2d_draw_order_channel(
    channel: &AnimationChannel,
    _setup: &Skeleton2D,
    _pose: &mut Skeleton2D,
    target: &Unknown,
    time: f32,
    guards: &Skeleton2DGuardState,
) {
    let Some(target) = target
        .as_ref()
        .and_then(|target| target.downcast_ref::<Skeleton2DDrawOrderAnimationTarget>())
    else {
        return;
    };
    let track = channel.track.read().unwrap();
    let components = track.components;
    if components == 0 {
        return;
    }
    let keyframe = find_skeleton_2d_step_keyframe(&track.times, time);
    if keyframe < 0 {
        return;
    }
    let interpolation = track.interpolation;
    if interpolation != AnimationInterpolation::Step {
        report_skeleton_2d_coerced_interpolation(
            guards,
            "DrawOrder",
            interpolation_name(interpolation),
            SKELETON_2D_STEP_INTERPOLATION,
        );
    }
    let base = keyframe as usize * components;
    let count = components.min(target.nodes.len());
    let mut list = target.order_list.write().unwrap();
    clear_node_order_list(&mut list);
    for slot in 0..count {
        let Some(node) = target.nodes[slot].as_ref() else {
            continue;
        };
        add_node_order_list_entry(&mut list, node, track.values[base + slot] as f64);
    }
}

fn interpolation_name(value: AnimationInterpolation) -> &'static str {
    return match value {
        AnimationInterpolation::Cubic => "Cubic",
        AnimationInterpolation::Linear => "Linear",
        AnimationInterpolation::Step => "Step",
    };
}

/// Claims the draw-order kind for its binder; the family shakes out when unused
/// (TS `registerSkeleton2DDrawOrderAnimationBinder`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn register_skeleton_2d_draw_order_animation_binder(
    registry: &mut Skeleton2DAnimationTargetBinderRegistry,
) {
    register_skeleton_2d_animation_target_binder(
        registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER,
        Arc::new(bind_skeleton_2d_draw_order_channel),
    );
}

/// Releases the draw-order binder (TS `unregisterSkeleton2DDrawOrderAnimationBinder`).
// flight-lint: allow(conform-params) D5: caller-owned binder registry replaces the source module-global map
pub fn unregister_skeleton_2d_draw_order_animation_binder(
    registry: &mut Skeleton2DAnimationTargetBinderRegistry,
) {
    unregister_skeleton_2d_animation_target_binder(
        registry,
        SKELETON_2D_ANIMATION_TARGET_KIND_DRAW_ORDER,
    );
}
