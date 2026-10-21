use crate::support::*;
use flight_animation::contract::*;
use flight_entity::Ref;
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
fn track(components: usize, values: Vec<f32>) -> Ref<AnimationTrack> {
    return Arc::new(RwLock::new(create_animation_track(
        CreateAnimationTrackOpts {
            components: Some(components),
            times: vec![0.0, 1.0],
            values,
            interpolation: None,
            easing: None,
            quaternion: None,
            segment_easings: None,
        },
    )));
}
fn bound_clip(
    node: Node3DRef,
    path: Scene3DAnimationPath,
    components: usize,
    values: Vec<f32>,
) -> AnimationClip {
    return create_animation_clip(
        vec![create_animation_channel(
            &track(components, values),
            Some(Arc::new(Scene3DAnimationTarget { node, path })),
        )],
        None,
        &[],
    );
}
mod apply_animation_clip_to_scene3d {
    use super::*;
    #[test]
    fn drives_translation_rotation_and_scale_and_invalidates_trs() {
        let node = node3d();
        let clip = bound_clip(
            node.clone(),
            Scene3DAnimationPath::Translation,
            3,
            vec![0.0, 0.0, 0.0, 10.0, 20.0, 30.0],
        );
        apply_animation_clip_to_scene3d(&clip, 0.5);
        let p = node.read().unwrap().position.clone();
        close(p.x, 5.0);
        close(p.y, 10.0);
        close(p.z, 15.0);
        let s = std::f32::consts::FRAC_1_SQRT_2;
        let clip = bound_clip(
            node.clone(),
            Scene3DAnimationPath::Rotation,
            4,
            vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, s, s],
        );
        apply_animation_clip_to_scene3d(&clip, 1.0);
        let q = node.read().unwrap().rotation.clone();
        close(q.x, 0.0);
        close(q.y, 0.0);
        close(q.z, s);
        close(q.w, s);
        let clip = bound_clip(
            node.clone(),
            Scene3DAnimationPath::Scale,
            3,
            vec![1.0, 1.0, 1.0, 3.0, 3.0, 3.0],
        );
        apply_animation_clip_to_scene3d(&clip, 1.0);
        let s = node.read().unwrap().scale.clone();
        close(s.x, 3.0);
        close(s.y, 3.0);
        close(s.z, 3.0);
    }
    #[test]
    fn samples_weights_into_the_same_live_array_and_skips_absent_morphs() {
        let mesh = test_mesh();
        let morph = test_morph(vec![0.0, 0.0]);
        let pointer = morph.read().unwrap().weights.as_ptr();
        mesh.write().unwrap().morph = Some(morph.clone());
        let clip = bound_clip(
            mesh.clone(),
            Scene3DAnimationPath::Weights,
            2,
            vec![0.0, 0.0, 1.0, 0.5],
        );
        apply_animation_clip_to_scene3d(&clip, 0.5);
        let m = morph.read().unwrap();
        close(m.weights[0], 0.5);
        close(m.weights[1], 0.25);
        assert_eq!(m.weights.as_ptr(), pointer);
        drop(m);
        mesh.write().unwrap().morph = None;
        apply_animation_clip_to_scene3d(&clip, 1.0);
    }
    #[test]
    fn skips_null_primitive_and_wrong_record_targets() {
        let node = node3d();
        let track = track(3, vec![0.0, 0.0, 0.0, 9.0, 9.0, 9.0]);
        let clip = create_animation_clip(
            vec![
                create_animation_channel(&track, None),
                create_animation_channel(&track, Some(Arc::new(42))),
                create_animation_channel(&track, Some(Arc::new("not a target".to_string()))),
            ],
            None,
            &[],
        );
        apply_animation_clip_to_scene3d(&clip, 1.0);
        assert_eq!(node.read().unwrap().position.x, 0.0);
    }
}
