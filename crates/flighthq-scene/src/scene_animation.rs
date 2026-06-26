//! `apply_animation_clip_to_scene` — apply an animation clip's channels to scene nodes.

use flighthq_animation::sample_animation_track;
use flighthq_node::NodeId;
use flighthq_types::{AnimationClip, SceneAnimationPath};

use crate::scene_node::SceneArena;

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
                set_scene_node_rotation_quaternion(
                    arena, node_id, scratch[0], scratch[1], scratch[2], scratch[3],
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Scene node TRS helpers
// ---------------------------------------------------------------------------

/// Sets the translation component of a scene node's local matrix in place (fast path — only
/// m[12], m[13], m[14] are written; the rotation and scale columns are preserved).
pub fn set_scene_node_position(arena: &mut SceneArena, id: NodeId, x: f32, y: f32, z: f32) {
    let node = &mut arena[id];
    node.local_matrix.m[12] = x;
    node.local_matrix.m[13] = y;
    node.local_matrix.m[14] = z;
    // Invalidate cached world matrix so consumers recompute on the next query.
    node.world_matrix = None;
}

/// Sets the rotation component of a scene node's local matrix via decompose–recompose,
/// preserving the existing position and scale. `qx/qy/qz/qw` is a unit quaternion.
pub fn set_scene_node_rotation_quaternion(
    arena: &mut SceneArena,
    id: NodeId,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
) {
    let m = &mut arena[id].local_matrix.m;
    // Decompose: extract scale lengths from the existing rotation columns.
    let sx = f32::sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    let sy = f32::sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
    let sz = f32::sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);
    // Preserve translation.
    let tx = m[12];
    let ty = m[13];
    let tz = m[14];
    // Recompose: convert quaternion to rotation matrix, scale each column.
    let x2 = qx + qx;
    let y2 = qy + qy;
    let z2 = qz + qz;
    let xx = qx * x2;
    let xy = qx * y2;
    let xz = qx * z2;
    let yy = qy * y2;
    let yz = qy * z2;
    let zz = qz * z2;
    let wx = qw * x2;
    let wy = qw * y2;
    let wz = qw * z2;
    m[0] = (1.0 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0.0;
    m[4] = (xy - wz) * sy;
    m[5] = (1.0 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0.0;
    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1.0 - (xx + yy)) * sz;
    m[11] = 0.0;
    m[12] = tx;
    m[13] = ty;
    m[14] = tz;
    m[15] = 1.0;
    arena[id].world_matrix = None;
}

/// Sets the scale component of a scene node's local matrix via decompose–recompose,
/// preserving the existing position and rotation.
pub fn set_scene_node_scale(arena: &mut SceneArena, id: NodeId, x: f32, y: f32, z: f32) {
    let m = &mut arena[id].local_matrix.m;
    // Decompose: extract old scale lengths.
    let old_sx = f32::sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
    let old_sy = f32::sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
    let old_sz = f32::sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);
    // Rescale each rotation column by (new / old) to replace scale in place.
    let rx = if old_sx > 0.0 { x / old_sx } else { x };
    let ry = if old_sy > 0.0 { y / old_sy } else { y };
    let rz = if old_sz > 0.0 { z / old_sz } else { z };
    m[0] *= rx;
    m[1] *= rx;
    m[2] *= rx;
    m[4] *= ry;
    m[5] *= ry;
    m[6] *= ry;
    m[8] *= rz;
    m[9] *= rz;
    m[10] *= rz;
    arena[id].world_matrix = None;
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

    // set_scene_node_position

    #[test]
    fn set_scene_node_position_writes_translation_column() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        set_scene_node_position(&mut arena, id, 3.0, 7.0, -2.0);
        assert_eq!(arena[id].local_matrix.m[12], 3.0);
        assert_eq!(arena[id].local_matrix.m[13], 7.0);
        assert_eq!(arena[id].local_matrix.m[14], -2.0);
    }

    #[test]
    fn set_scene_node_position_clears_world_matrix_cache() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        // Seed a fake world matrix cache.
        arena[id].world_matrix = Some(Default::default());
        set_scene_node_position(&mut arena, id, 1.0, 2.0, 3.0);
        assert!(arena[id].world_matrix.is_none());
    }

    // set_scene_node_rotation_quaternion

    #[test]
    fn set_scene_node_rotation_quaternion_identity_does_not_change_upper_left() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        // Identity quaternion = no rotation
        set_scene_node_rotation_quaternion(&mut arena, id, 0.0, 0.0, 0.0, 1.0);
        let m = &arena[id].local_matrix.m;
        assert!((m[0] - 1.0).abs() < 1e-5);
        assert!((m[5] - 1.0).abs() < 1e-5);
        assert!((m[10] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn set_scene_node_rotation_quaternion_preserves_translation() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        arena[id].local_matrix.m[12] = 5.0;
        arena[id].local_matrix.m[13] = -3.0;
        arena[id].local_matrix.m[14] = 1.0;
        set_scene_node_rotation_quaternion(&mut arena, id, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(arena[id].local_matrix.m[12], 5.0);
        assert_eq!(arena[id].local_matrix.m[13], -3.0);
        assert_eq!(arena[id].local_matrix.m[14], 1.0);
    }

    // set_scene_node_scale

    #[test]
    fn set_scene_node_scale_rescales_rotation_columns() {
        let mut arena = make_arena();
        let id = create_scene_node(&mut arena, None);
        // Identity node, scale to 2, 3, 4
        set_scene_node_scale(&mut arena, id, 2.0, 3.0, 4.0);
        let m = &arena[id].local_matrix.m;
        let sx = f32::sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
        let sy = f32::sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6]);
        let sz = f32::sqrt(m[8] * m[8] + m[9] * m[9] + m[10] * m[10]);
        assert!((sx - 2.0).abs() < 1e-5);
        assert!((sy - 3.0).abs() < 1e-5);
        assert!((sz - 4.0).abs() < 1e-5);
    }
}
