use super::md2_test_helper::*;
use flight_animation::{AnimationInterpolation, sample_animation_track};
use flight_entity::Ref;
use flight_meshgeometry::{MeshMorph, MeshMorphTarget};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{Mesh, Scene3DAnimationPath};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

fn animated_fixture(names: &[&str]) -> Md2Fixture {
    let mut f = triangle_fixture();
    f.num_frames = names.len();
    f.frame_names = names.iter().map(|name| name.to_string()).collect();
    for z in 1..names.len() {
        f.extra_frames.push(vec![
            [0, 0, z as u8, 0],
            [1, 0, z as u8, 0],
            [0, 1, z as u8, 0],
        ]);
    }
    return f;
}

fn handler_document(
    names: &[&str],
    morph: Option<Ref<MeshMorph>>,
) -> flight_scene3d::Scene3DDocument {
    let mut document = parse_md2(&[], None, None);
    let frames: Vec<_> = names
        .iter()
        .map(|name| Md2Frame {
            name: name.to_string(),
            normals: vec![0.0; 3].into_boxed_slice(),
            positions: vec![0.0; 3].into_boxed_slice(),
        })
        .collect();
    let mut mesh_materials = Vec::new();
    let mut diagnostics = Vec::new();
    let mut context = Md2ParseContext {
        bytes: &[],
        diagnostics: Some(&mut diagnostics),
        document: &mut document,
        frames: &frames,
        mesh_materials: &mut mesh_materials,
        morph,
        num_skins: 0,
        off_skins: 0,
    };
    let collect = MD2_ANIMATION_HANDLER.read().unwrap().collect.clone();
    collect(&mut context);
    assert!(diagnostics.is_empty());
    return document;
}

fn morph_for_frames(count: usize) -> Ref<MeshMorph> {
    return Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(
            (1..count)
                .map(|_| MeshMorphTarget {
                    normal_deltas: Some(vec![0.0; 3].into_boxed_slice()),
                    position_deltas: vec![0.0; 3].into_boxed_slice(),
                    tangent_deltas: None,
                })
                .collect(),
        ),
        weights: vec![0.0; count.saturating_sub(1)].into_boxed_slice(),
    }));
}

mod md2_animation_handler_tests {
    use super::*;

    #[test]
    fn absent_or_empty_morph_contributes_nothing() {
        assert!(
            handler_document(&["stand01", "stand02"], None)
                .animations
                .is_empty()
        );
        assert!(
            handler_document(&["stand01"], Some(morph_for_frames(1)))
                .animations
                .is_empty()
        );
    }

    #[test]
    fn clips_bind_mesh_node_zero_weights_and_use_frame_rate() {
        let document = handler_document(
            &["stand01", "stand02", "stand03"],
            Some(morph_for_frames(3)),
        );
        assert_eq!(document.animations.len(), 1);
        let clip = &document.animations[0];
        assert!((clip.duration - 0.2).abs() < 0.00001);
        assert_eq!(clip.channels.len(), 1);
        assert_eq!(clip.channels[0].node, 0);
        assert_eq!(clip.channels[0].path, Scene3DAnimationPath::Weights);
    }

    #[test]
    fn family_covers_animation_and_retains_handler_identity() {
        assert_eq!(MD2_ANIMATION_HANDLER.read().unwrap().feature, "Animation");
        assert_eq!(MD2_ANIMATION_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &MD2_ANIMATION_FAMILY[0],
            &MD2_ANIMATION_HANDLER
        ));
    }

    #[test]
    fn segments_contiguous_actions_and_disambiguates_repeated_or_unnamed_runs() {
        for (names, expected) in [
            (
                vec!["stand01", "stand02", "run01", "run02"],
                vec!["stand", "run"],
            ),
            (vec!["", ""], vec!["default"]),
            (
                vec!["walk01", "jump01", "walk01"],
                vec!["walk", "jump", "walk.2"],
            ),
            (
                vec!["  walk01  ", "walk02", "123", "\u{a0}456\u{a0}"],
                vec!["walk", "default"],
            ),
        ] {
            let document = handler_document(&names, Some(morph_for_frames(names.len())));
            assert_eq!(
                document
                    .animations
                    .iter()
                    .map(|clip| clip.name.as_deref().unwrap())
                    .collect::<Vec<_>>(),
                expected
            );
        }
    }
}

mod parse_md2_animation_tests {
    use super::*;

    #[test]
    fn action_clips_keep_full_track_width_local_times_and_exact_weight_matrix() {
        let document = parse_md2(
            &build_md2(&animated_fixture(&[
                "stand01", "stand02", "run01", "run02", "run03",
            ])),
            None,
            None,
        );
        assert_eq!(
            document
                .animations
                .iter()
                .map(|clip| clip.name.as_deref().unwrap())
                .collect::<Vec<_>>(),
            ["stand", "run"]
        );
        let stand = document.animations[0].channels[0].track.read().unwrap();
        let run = document.animations[1].channels[0].track.read().unwrap();
        assert_eq!(stand.components, 4);
        assert_eq!(run.components, 4);
        assert_eq!(stand.times, [0.0, 0.1]);
        assert_eq!(run.times, [0.0, 0.1, 0.2]);
        assert_eq!(document.animations[1].duration, 0.2);
        assert_eq!(stand.values, [0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]);
        assert_eq!(
            run.values,
            [0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
        );
        assert_eq!(run.interpolation, AnimationInterpolation::Linear);
        let mut out = [0.0; 4];
        sample_animation_track(&mut out, &run, 0.05);
        assert_eq!(out, [0.0, 0.5, 0.5, 0.0]);
    }

    #[test]
    fn frame_specific_scale_translate_and_normal_deltas_are_retained() {
        let mut f = triangle_fixture();
        f.num_frames = 2;
        let mut next = f.vertices.clone();
        next[0][3] = 5;
        f.extra_frames = vec![next];
        f.frame_scales = vec![[1.0; 3], [2.0, 1.0, 1.0]];
        f.frame_translates = vec![[0.0; 3], [5.0, 0.0, 0.0]];
        let document = parse_md2(&build_md2(&f), None, None);
        let morph = document.meshes[0].morph.as_ref().unwrap().read().unwrap();
        assert_eq!(morph.targets.len(), 1);
        let target = &morph.targets[0];
        assert_eq!(target.position_deltas[3], 6.0);
        let normals = target.normal_deltas.as_ref().unwrap();
        let a0 = MD2_ANORMS[0];
        let a5 = MD2_ANORMS[5];
        for (actual, expected) in
            normals[..3]
                .iter()
                .zip([a5[0] - a0[0], a5[2] - a0[2], a0[1] - a5[1]])
        {
            assert!((*actual - expected).abs() < 0.00001);
        }
        assert!(normals[3..].iter().all(|value| *value == 0.0));
        assert!(target.tangent_deltas.is_none());
        assert_eq!(&*morph.weights, &[0.0]);
    }

    #[test]
    fn live_scene_has_one_weights_clip_and_mesh_morph_delta() {
        let mut f = triangle_fixture();
        f.num_frames = 2;
        let mut next = f.vertices.clone();
        next[1][0] = 3;
        f.extra_frames = vec![next];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        assert_eq!(scene.animations.len(), 1);
        let clip = scene.animations.values().next().unwrap().read().unwrap();
        assert_eq!(clip.channels.len(), 1);
        let target = clip.channels[0]
            .target_ref
            .as_ref()
            .unwrap()
            .downcast_ref::<flight_scene3d::Scene3DAnimationTarget>()
            .unwrap();
        assert_eq!(target.path, Scene3DAnimationPath::Weights);

        let track = clip.channels[0].track.read().unwrap();
        assert_eq!(track.components, 1);
        assert_eq!(track.times, [0.0, 0.1]);
        let root: NodeRef = scene.root.clone();
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &root);
            output
        };
        assert_eq!(children.len(), 1);
        let child = children[0].read().unwrap();
        let mesh = child.as_any().downcast_ref::<Mesh>().unwrap();
        let morph = mesh.morph.as_ref().unwrap().read().unwrap();
        assert_eq!(morph.targets.len(), 1);
        assert_eq!(morph.targets[0].position_deltas[3], 2.0);
    }

    #[test]
    fn repeated_nonadjacent_action_names_remain_unique_after_document_parse() {
        let document = parse_md2(
            &build_md2(&animated_fixture(&["walk01", "jump01", "walk01"])),
            None,
            None,
        );
        assert_eq!(
            document
                .animations
                .iter()
                .map(|clip| clip.name.as_deref().unwrap())
                .collect::<Vec<_>>(),
            ["walk", "jump", "walk.2"]
        );
    }
    #[test]
    fn single_frame_has_no_morph_or_animation() {
        let document = parse_md2(&build_md2(&triangle_fixture()), None, None);
        assert!(document.animations.is_empty());
        assert!(document.meshes[0].morph.is_none());
        let scene = create_scene3d_from_md2(&build_md2(&triangle_fixture()), None, None);
        assert!(scene.animations.is_empty());
        scene_geometry(&scene);
    }

    #[test]
    fn unnamed_multiframe_clip_has_zero_off_diagonal_weights() {
        let document = parse_md2(&build_md2(&animated_fixture(&["", "", "", ""])), None, None);
        assert_eq!(document.animations.len(), 1);
        assert_eq!(document.animations[0].name.as_deref(), Some("default"));
        let track = document.animations[0].channels[0].track.read().unwrap();
        assert_eq!(track.components, 3);
        assert_eq!(
            track.values,
            [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
        );
    }
}
