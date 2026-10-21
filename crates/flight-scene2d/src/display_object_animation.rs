//! 2D display animation binding (TS `displayObjectAnimation.ts`): channels whose opaque target is
//! a `Node2DAnimationTarget` drive that node's transform and appearance fields.

use flight_animation::{AnimationClip, sample_animation_clip};
use flight_node::{NodeRef, invalidate_node_appearance, invalidate_node_local_transform};

use crate::types::*;

/// Samples a target-free clip at `time` and applies every channel whose target is a
/// `Node2DAnimationTarget`; other targets are ignored (TS `applyAnimationClipToNode2D`). Transform
/// paths invalidate the local transform; alpha and visibility invalidate appearance.
pub fn apply_animation_clip_to_node2d(clip: &AnimationClip, time: f32) {
    let mut scratch = [0.0_f32; 4];
    sample_animation_clip(&mut scratch, clip, time, &mut |sample, channel, _| {
        let Some(target) = channel
            .target_ref
            .as_ref()
            .and_then(|target| target.downcast_ref::<Node2DAnimationTarget>())
        else {
            return;
        };
        let transform = {
            let mut node = target.node.write().unwrap();
            let fields = node.node2d_fields_mut();
            match target.path {
                Node2DAnimationPath::Alpha => {
                    fields.alpha = sample[0];
                    false
                }
                Node2DAnimationPath::Pivot => {
                    fields.pivot_x = sample[0];
                    fields.pivot_y = sample[1];
                    true
                }
                Node2DAnimationPath::PivotX => {
                    fields.pivot_x = sample[0];
                    true
                }
                Node2DAnimationPath::PivotY => {
                    fields.pivot_y = sample[0];
                    true
                }
                Node2DAnimationPath::Position => {
                    fields.x = sample[0];
                    fields.y = sample[1];
                    true
                }
                Node2DAnimationPath::Rotation => {
                    fields.rotation = sample[0];
                    true
                }
                Node2DAnimationPath::Scale => {
                    fields.scale_x = sample[0];
                    fields.scale_y = sample[1];
                    true
                }
                Node2DAnimationPath::ScaleX => {
                    fields.scale_x = sample[0];
                    true
                }
                Node2DAnimationPath::ScaleY => {
                    fields.scale_y = sample[0];
                    true
                }
                Node2DAnimationPath::Skew => {
                    fields.skew_x = sample[0];
                    fields.skew_y = sample[1];
                    true
                }
                Node2DAnimationPath::SkewX => {
                    fields.skew_x = sample[0];
                    true
                }
                Node2DAnimationPath::SkewY => {
                    fields.skew_y = sample[0];
                    true
                }
                Node2DAnimationPath::Visible => {
                    fields.visible = sample[0] >= 0.5;
                    false
                }
                Node2DAnimationPath::X => {
                    fields.x = sample[0];
                    true
                }
                Node2DAnimationPath::Y => {
                    fields.y = sample[0];
                    true
                }
            }
        };
        let node: NodeRef = target.node.clone();
        if transform {
            invalidate_node_local_transform(&node);
        } else {
            invalidate_node_appearance(&node);
        }
    });
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Node2DAnimationPath string union; the TS package exports no get_/parse_ free functions
pub fn get_node2d_animation_path_string(value: Node2DAnimationPath) -> &'static str {
    return match value {
        Node2DAnimationPath::Alpha => "Alpha",
        Node2DAnimationPath::Pivot => "Pivot",
        Node2DAnimationPath::PivotX => "PivotX",
        Node2DAnimationPath::PivotY => "PivotY",
        Node2DAnimationPath::Position => "Position",
        Node2DAnimationPath::Rotation => "Rotation",
        Node2DAnimationPath::Scale => "Scale",
        Node2DAnimationPath::ScaleX => "ScaleX",
        Node2DAnimationPath::ScaleY => "ScaleY",
        Node2DAnimationPath::Skew => "Skew",
        Node2DAnimationPath::SkewX => "SkewX",
        Node2DAnimationPath::SkewY => "SkewY",
        Node2DAnimationPath::Visible => "Visible",
        Node2DAnimationPath::X => "X",
        Node2DAnimationPath::Y => "Y",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Node2DAnimationPath string union; the TS package exports no get_/parse_ free functions
pub fn parse_node2d_animation_path(value: &str) -> Option<Node2DAnimationPath> {
    return match value {
        "Alpha" => Some(Node2DAnimationPath::Alpha),
        "Pivot" => Some(Node2DAnimationPath::Pivot),
        "PivotX" => Some(Node2DAnimationPath::PivotX),
        "PivotY" => Some(Node2DAnimationPath::PivotY),
        "Position" => Some(Node2DAnimationPath::Position),
        "Rotation" => Some(Node2DAnimationPath::Rotation),
        "Scale" => Some(Node2DAnimationPath::Scale),
        "ScaleX" => Some(Node2DAnimationPath::ScaleX),
        "ScaleY" => Some(Node2DAnimationPath::ScaleY),
        "Skew" => Some(Node2DAnimationPath::Skew),
        "SkewX" => Some(Node2DAnimationPath::SkewX),
        "SkewY" => Some(Node2DAnimationPath::SkewY),
        "Visible" => Some(Node2DAnimationPath::Visible),
        "X" => Some(Node2DAnimationPath::X),
        "Y" => Some(Node2DAnimationPath::Y),
        _ => None,
    };
}
