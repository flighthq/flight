//! `apply_animation_clip_to_scene` — apply an animation clip's channels to scene nodes.

use flighthq_animation::sample_animation_track;
use flighthq_node::NodeId;
use flighthq_types::{AnimationClip, SceneAnimationPath, Vector4Like};

use crate::scene_node::SceneArena;
use crate::scene_node_transform::{
    set_scene_node_position, set_scene_node_rotation_quaternion, set_scene_node_scale,
};

// ---------------------------------------------------------------------------
// SceneAnimationTarget
// ---------------------------------------------------------------------------

/// The `target_ref` an `AnimationChannel` carries when bound to a 3D scene node.
///
/// Mirrors the TS `SceneAnimationTarget { node: SceneNode; path: SceneAnimationPath }`.
/// In the Rust arena model, `node` is a [`NodeId`] rather than a direct object reference.
/// `apply_animation_clip_to_scene` reads this; the animation core never interprets `target_ref`.
pub struct SceneAnimationTarget {
    pub node: NodeId,
    pub path: SceneAnimationPath,
}

// ---------------------------------------------------------------------------
// apply_animation_clip_to_scene
// ---------------------------------------------------------------------------

/// Samples every channel of `clip` at `time` and applies it to its target scene node's
/// local transform. Channels whose `target_ref` is not a [`SceneAnimationTarget`] are skipped.
///
/// Translation/Scale consume 3 components; Rotation consumes 4 (unit quaternion xyzw).
/// This is the 3D binding layer over the target-free `flighthq-animation` core.
pub fn apply_animation_clip_to_scene(clip: &AnimationClip, time: f32, arena: &mut SceneArena) {
    let mut scratch = [0.0f32; 4];
    for channel in &clip.channels {
        let target = match &channel.target_ref {
            Some(any) => match any.downcast_ref::<SceneAnimationTarget>() {
                Some(t) => t,
                None => continue,
            },
            None => continue,
        };
        let node_id = target.node;
        sample_animation_track(&mut scratch, &channel.track, time);
        match &target.path {
            SceneAnimationPath::Translation => {
                set_scene_node_position(arena, node_id, scratch[0], scratch[1], scratch[2]);
            }
            SceneAnimationPath::Scale => {
                set_scene_node_scale(arena, node_id, scratch[0], scratch[1], scratch[2]);
            }
            SceneAnimationPath::Rotation => {
                let q = Vector4Like {
                    x: scratch[0],
                    y: scratch[1],
                    z: scratch[2],
                    w: scratch[3],
                };
                set_scene_node_rotation_quaternion(arena, node_id, &q);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_animation::{AnimationTrackOpts, create_animation_track};
    use flighthq_types::{AnimationChannel, AnimationClip, SceneAnimationPath};

    use super::*;
    use crate::scene_node::create_scene_node;

    fn make_arena() -> SceneArena {
        SceneArena::new()
    }

    // apply_animation_clip_to_scene

    #[test]
    fn apply_animation_clip_to_scene_skips_channels_with_no_target_ref() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        let track = create_animation_track(AnimationTrackOpts {
            components: Some(3),
            easing: None,
            interpolation: None,
            quaternion: None,
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0],
        });
        let clip = AnimationClip {
            channels: vec![AnimationChannel {
                target_ref: None,
                track,
            }],
            duration: 1.0,
        };
        apply_animation_clip_to_scene(&clip, 0.5, &mut arena);
        // No change — no target_ref
        assert_eq!(arena[id].local_matrix.m[12], 0.0);
    }

    #[test]
    fn apply_animation_clip_to_scene_applies_translation_channel() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        let track = create_animation_track(AnimationTrackOpts {
            components: Some(3),
            easing: None,
            interpolation: None,
            quaternion: None,
            times: vec![0.0, 1.0],
            values: vec![0.0, 0.0, 0.0, 4.0, 8.0, 12.0],
        });
        let clip = AnimationClip {
            channels: vec![AnimationChannel {
                target_ref: Some(Box::new(SceneAnimationTarget {
                    node: id,
                    path: SceneAnimationPath::Translation,
                })),
                track,
            }],
            duration: 1.0,
        };
        apply_animation_clip_to_scene(&clip, 1.0, &mut arena);
        assert!((arena[id].local_matrix.m[12] - 4.0).abs() < 1e-5);
        assert!((arena[id].local_matrix.m[13] - 8.0).abs() < 1e-5);
        assert!((arena[id].local_matrix.m[14] - 12.0).abs() < 1e-5);
    }

    #[test]
    fn apply_animation_clip_to_scene_applies_scale_channel() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        let track = create_animation_track(AnimationTrackOpts {
            components: Some(3),
            easing: None,
            interpolation: None,
            quaternion: None,
            times: vec![0.0, 1.0],
            values: vec![1.0, 1.0, 1.0, 2.0, 3.0, 4.0],
        });
        let clip = AnimationClip {
            channels: vec![AnimationChannel {
                target_ref: Some(Box::new(SceneAnimationTarget {
                    node: id,
                    path: SceneAnimationPath::Scale,
                })),
                track,
            }],
            duration: 1.0,
        };
        apply_animation_clip_to_scene(&clip, 1.0, &mut arena);
        let m = &arena[id].local_matrix.m;
        assert!((m[0] - 2.0).abs() < 1e-5);
        assert!((m[5] - 3.0).abs() < 1e-5);
        assert!((m[10] - 4.0).abs() < 1e-5);
    }
}
