use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_animation::{
    AnimationChannel, AnimationClip, AnimationInterpolation, CreateAnimationTrackOpts,
    create_animation_channel, create_animation_clip, create_animation_track,
};
use flight_node::{get_node_appearance_revision, get_node_local_transform_revision};
use flight_scene2d::contract::*;

use crate::scene2d_fixture::*;

fn track_options() -> CreateAnimationTrackOpts {
    let make: fn() -> CreateAnimationTrackOpts = CreateAnimationTrackOpts::default;
    return make();
}

fn channel(
    node: &Node2DRef,
    path: Node2DAnimationPath,
    components: usize,
    values: &[f32],
    interpolation: Option<AnimationInterpolation>,
) -> AnimationChannel {
    let track = create_animation_track(CreateAnimationTrackOpts {
        components: Some(components),
        interpolation,
        times: vec![0.0, 1.0],
        values: values.to_vec(),
        ..track_options()
    });
    let target: Arc<dyn Any + Send + Sync> = Arc::new(Node2DAnimationTarget {
        node: node.clone(),
        path,
    });
    let track = Arc::new(RwLock::new(track));
    return create_animation_channel(&track, Some(target));
}

fn clip(channels: Vec<AnimationChannel>) -> AnimationClip {
    return create_animation_clip(channels, None, &[]);
}

fn transform(node: &Node2DRef) -> (f32, f32, f32, f32, f32, f32, f32, f32, f32) {
    let guard = node.read().unwrap();
    let t = guard.node2d_fields();
    return (
        t.x, t.y, t.pivot_x, t.pivot_y, t.scale_x, t.scale_y, t.skew_x, t.skew_y, t.rotation,
    );
}

const PATHS: [(Node2DAnimationPath, &str); 15] = [
    (Node2DAnimationPath::Alpha, "Alpha"),
    (Node2DAnimationPath::Pivot, "Pivot"),
    (Node2DAnimationPath::PivotX, "PivotX"),
    (Node2DAnimationPath::PivotY, "PivotY"),
    (Node2DAnimationPath::Position, "Position"),
    (Node2DAnimationPath::Rotation, "Rotation"),
    (Node2DAnimationPath::Scale, "Scale"),
    (Node2DAnimationPath::ScaleX, "ScaleX"),
    (Node2DAnimationPath::ScaleY, "ScaleY"),
    (Node2DAnimationPath::Skew, "Skew"),
    (Node2DAnimationPath::SkewX, "SkewX"),
    (Node2DAnimationPath::SkewY, "SkewY"),
    (Node2DAnimationPath::Visible, "Visible"),
    (Node2DAnimationPath::X, "X"),
    (Node2DAnimationPath::Y, "Y"),
];

mod apply_animation_clip_to_node2d {
    use super::*;

    #[test]
    fn applies_each_vector_path_and_invalidates_the_transform() {
        let cases: [(Node2DAnimationPath, [f32; 4], [usize; 2], [f32; 2]); 4] = [
            (
                Node2DAnimationPath::Position,
                [0.0, 0.0, 10.0, 20.0],
                [0, 1],
                [5.0, 10.0],
            ),
            (
                Node2DAnimationPath::Pivot,
                [0.0, 0.0, 10.0, 20.0],
                [2, 3],
                [5.0, 10.0],
            ),
            (
                Node2DAnimationPath::Scale,
                [1.0, 1.0, 3.0, 5.0],
                [4, 5],
                [2.0, 3.0],
            ),
            (
                Node2DAnimationPath::Skew,
                [0.0, 0.0, 0.5, 1.0],
                [6, 7],
                [0.25, 0.5],
            ),
        ];
        for (path, values, slots, expected) in cases {
            let node = display_object();
            let before = get_node_local_transform_revision(&*node.read().unwrap());
            apply_animation_clip_to_node2d(
                &clip(vec![channel(&node, path, 2, &values, None)]),
                0.5,
            );
            let t = transform(&node);
            let all = [t.0, t.1, t.2, t.3, t.4, t.5, t.6, t.7, t.8];
            assert_eq!([all[slots[0]], all[slots[1]]], expected, "{path:?}");
            assert!(get_node_local_transform_revision(&*node.read().unwrap()) > before);
        }
    }

    #[test]
    fn applies_scalar_rotation_alpha_and_visibility_channels() {
        let node = display_object();
        let appearance_before = get_node_appearance_revision(&*node.read().unwrap());
        let channels = vec![
            channel(&node, Node2DAnimationPath::Rotation, 1, &[0.0, 2.0], None),
            channel(&node, Node2DAnimationPath::Alpha, 1, &[1.0, 0.5], None),
            channel(
                &node,
                Node2DAnimationPath::Visible,
                1,
                &[0.0, 1.0],
                Some(AnimationInterpolation::Step),
            ),
        ];
        apply_animation_clip_to_node2d(&clip(channels), 0.5);
        let guard = node.read().unwrap();
        let fields = guard.node2d_fields();
        assert_eq!(
            (fields.rotation, fields.alpha, fields.visible),
            (1.0, 0.75, false)
        );
        assert!(get_node_appearance_revision(&*guard) > appearance_before);
    }

    #[test]
    fn applies_each_single_axis_path_to_its_own_field() {
        let cases = [
            (Node2DAnimationPath::X, 0),
            (Node2DAnimationPath::Y, 1),
            (Node2DAnimationPath::PivotX, 2),
            (Node2DAnimationPath::PivotY, 3),
            (Node2DAnimationPath::ScaleX, 4),
            (Node2DAnimationPath::ScaleY, 5),
            (Node2DAnimationPath::SkewX, 6),
            (Node2DAnimationPath::SkewY, 7),
        ];
        for (path, slot) in cases {
            let node = display_object();
            let before = transform(&node);
            let before = [
                before.0, before.1, before.2, before.3, before.4, before.5, before.6, before.7,
                before.8,
            ];
            apply_animation_clip_to_node2d(
                &clip(vec![channel(&node, path, 1, &[7.0, 7.0], None)]),
                0.5,
            );
            let after = transform(&node);
            let after = [
                after.0, after.1, after.2, after.3, after.4, after.5, after.6, after.7, after.8,
            ];
            for i in 0..9 {
                assert_eq!(
                    after[i],
                    if i == slot { 7.0 } else { before[i] },
                    "{path:?} slot {i}"
                );
            }
        }
    }

    #[test]
    fn treats_visibility_at_the_half_threshold_as_visible() {
        let node = display_object();
        node.write().unwrap().node2d_fields_mut().visible = false;
        apply_animation_clip_to_node2d(
            &clip(vec![channel(
                &node,
                Node2DAnimationPath::Visible,
                1,
                &[0.5, 0.5],
                None,
            )]),
            0.0,
        );
        assert!(node.read().unwrap().node2d_fields().visible);
    }

    #[test]
    fn ignores_foreign_and_missing_target_refs() {
        let track = Arc::new(RwLock::new(create_animation_track(
            CreateAnimationTrackOpts {
                times: vec![0.0, 1.0],
                values: vec![0.0, 1.0],
                ..track_options()
            },
        )));
        let foreign: Arc<dyn Any + Send + Sync> = Arc::new(String::from("not a target"));
        let channels = vec![
            create_animation_channel(&track, Some(foreign)),
            create_animation_channel(&track, None),
        ];
        apply_animation_clip_to_node2d(&clip(channels), 0.5);
    }

    #[test]
    fn drives_the_target_node_by_identity_for_any_2d_kind() {
        let sprite: Node2DRef = create_sprite(None);
        apply_animation_clip_to_node2d(
            &clip(vec![channel(
                &sprite,
                Node2DAnimationPath::X,
                1,
                &[0.0, 8.0],
                None,
            )]),
            0.5,
        );
        assert_eq!(sprite.read().unwrap().node2d_fields().x, 4.0);
    }
}

mod get_node2d_animation_path_string {
    use super::*;

    #[test]
    fn matches_the_source_path_constants() {
        for (value, text) in PATHS {
            assert_eq!(get_node2d_animation_path_string(value), text);
        }
    }
}

mod parse_node2d_animation_path {
    use super::*;

    #[test]
    fn round_trips_and_rejects_unknown_paths() {
        for (value, text) in PATHS {
            assert_eq!(parse_node2d_animation_path(text), Some(value));
        }
        assert_eq!(parse_node2d_animation_path("x"), None);
        assert_eq!(parse_node2d_animation_path("Opacity"), None);
    }
}
