use crate::gltf_test_helper::authored_translation_gltf;
use flight_scene3d::Scene3DAnimationPath;
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

#[test]
fn imports_an_authored_translation_channel_when_explicitly_selected() {
    let source = authored_translation_gltf();
    let document = parse_gltf_with_core_feature_handlers(
        &GltfSource::Document(GltfDocumentSource { source: &source }),
        &[GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone()],
        None,
        None,
    );
    assert_eq!(
        GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.read().unwrap().kind,
        "animations"
    );
    let document = document.read().unwrap();
    assert_eq!(document.animations.len(), 1);
    assert_eq!(document.animations[0].duration, 1.0);
    assert_eq!(document.animations[0].name.as_deref(), Some("move"));
    assert_eq!(document.animations[0].channels.len(), 1);
    assert_eq!(
        document.animations[0].channels[0].path,
        Scene3DAnimationPath::Translation
    );
    assert_eq!(
        document.animations[0].channels[0]
            .track
            .read()
            .unwrap()
            .values,
        [0.0, 0.0, 0.0, 1.0, 2.0, 3.0]
    );
}

#[test]
fn preserves_a_surviving_channel_while_reporting_source_target_sampler_path_and_width_failures_by_role()
 {
    let source = authored_translation_gltf();
    let animation = source.read().unwrap().animations.as_ref().unwrap()[0].clone();
    for (sampler, node, path) in [
        (0.0, 0.0, "other"),
        (0.0, 99.0, "translation"),
        (99.0, 0.0, "translation"),
        (0.0, 0.0, "rotation"),
    ] {
        animation
            .write()
            .unwrap()
            .channels
            .push(Arc::new(RwLock::new(GltfAnimationChannel {
                sampler,
                target: Arc::new(RwLock::new(GltfAnimationTarget {
                    node: Some(node),
                    path: path.to_string(),
                })),
            })));
    }
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_gltf_with_core_feature_handlers(
        &GltfSource::Document(GltfDocumentSource { source: &source }),
        &[GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone()],
        Some(&diagnostics),
        None,
    );
    assert_eq!(document.read().unwrap().animations.len(), 1);
    assert_eq!(document.read().unwrap().animations[0].channels.len(), 1);
    assert_eq!(
        diagnostics
            .read()
            .unwrap()
            .iter()
            .map(|diagnostic| diagnostic.kind.as_str())
            .collect::<Vec<_>>(),
        [
            "gltf.animation-unsupported-path",
            "gltf.animation-target-unresolved",
            "gltf.animation-missing-sampler",
            "gltf.accessor-type-mismatch"
        ]
    );
}

#[test]
fn weights_channels_fan_out_to_each_expanded_morph_mesh_node_with_the_original_track_width() {
    let source = authored_translation_gltf();
    {
        let mut source = source.write().unwrap();
        source
            .accessors
            .as_mut()
            .unwrap()
            .push(Arc::new(RwLock::new(GltfAccessor {
                buffer_view: Some(0.0),
                byte_offset: None,
                component_type: 5126.0,
                count: 2.0,
                normalized: None,
                r#type: "SCALAR".to_string(),
                sparse: None,
            })));
        source.meshes = Some(vec![Arc::new(RwLock::new(GltfMesh {
            name: None,
            weights: Some(vec![0.25]),
            primitives: (0..2)
                .map(|_| {
                    Arc::new(RwLock::new(GltfPrimitive {
                        attributes: Arc::new(RwLock::new(GltfPrimitiveAttributes {
                            position: Some(1.0),
                            normal: None,
                            tangent: None,
                            texcoord_0: None,
                            joints_0: None,
                            weights_0: None,
                        })),
                        indices: None,
                        material: None,
                        mode: Some(0.0),
                        extensions: None,
                        targets: Some(vec![Arc::new(RwLock::new(GltfMorphTarget {
                            position: Some(1.0),
                            normal: None,
                            tangent: None,
                        }))]),
                    }))
                })
                .collect(),
        }))]);
        source.nodes.as_mut().unwrap()[0].write().unwrap().mesh = Some(0.0);
        let animation = source.animations.as_ref().unwrap()[0].clone();
        animation.read().unwrap().channels[0]
            .read()
            .unwrap()
            .target
            .write()
            .unwrap()
            .path = "weights".to_string();
        animation.read().unwrap().samplers[0]
            .write()
            .unwrap()
            .output = 2.0;
    }
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_gltf_with_core_feature_handlers(
        &GltfSource::Document(GltfDocumentSource { source: &source }),
        &[GLTF_ANIMATIONS_CORE_FEATURE_HANDLER.clone()],
        Some(&diagnostics),
        None,
    );
    assert!(diagnostics.read().unwrap().is_empty());
    let document = document.read().unwrap();
    let channels = &document.animations[0].channels;
    assert_eq!(
        channels
            .iter()
            .map(|channel| channel.node)
            .collect::<Vec<_>>(),
        [1, 2]
    );
    for channel in channels {
        assert_eq!(channel.path, Scene3DAnimationPath::Weights);
        assert_eq!(channel.track.read().unwrap().components, 1);
        assert_eq!(channel.track.read().unwrap().values, [0.0, 1.0]);
    }
    assert!(!Arc::ptr_eq(&channels[0].track, &channels[1].track));
}
