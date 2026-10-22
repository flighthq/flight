use crate::gltf_test_helper::minimal_gltf_document;
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

#[test]
fn imports_skeleton_topology_when_explicitly_selected() {
    let source = minimal_gltf_document();
    source.write().unwrap().nodes = Some(vec![Arc::new(RwLock::new(GltfNode {
        camera: None,
        name: Some("joint".to_string()),
        children: None,
        mesh: None,
        skin: None,
        matrix: None,
        translation: None,
        rotation: None,
        scale: None,
        extensions: None,
    }))]);
    source.write().unwrap().scene = Some(0.0);
    source.write().unwrap().scenes = Some(vec![Arc::new(RwLock::new(GltfScene3D {
        name: None,
        nodes: Some(vec![0.0]),
    }))]);
    source.write().unwrap().skins = Some(vec![Arc::new(RwLock::new(GltfSkin {
        name: None,
        inverse_bind_matrices: None,
        joints: vec![0.0],
        skeleton: None,
    }))]);
    let document = parse_gltf_with_core_feature_handlers(
        &GltfSource::Document(GltfDocumentSource { source: &source }),
        &[GLTF_SKINS_CORE_FEATURE_HANDLER.clone()],
        None,
        None,
    );
    assert_eq!(
        GLTF_SKINS_CORE_FEATURE_HANDLER.read().unwrap().kind,
        "skins"
    );
    let document = document.read().unwrap();
    assert_eq!(document.skins.len(), 1);
    assert_eq!(document.skins[0].joints, [0]);
    assert_eq!(
        document.skins[0].inverse_bind[0].m,
        [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
        ]
    );
}

#[test]
fn binds_every_expanded_mesh_to_the_source_skin_and_recovers_an_unreadable_inverse_bind_accessor_to_identity()
 {
    let source = GltfSource::Json(GltfJsonSource {
        source: r#"{"asset":{"version":"2.0"},"buffers":[{"byteLength":12,"uri":"data:;base64,AACAPwAAAEAAAEBA"}],"bufferViews":[{"buffer":0,"byteLength":12}],"accessors":[{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":0},{"attributes":{"POSITION":0},"mode":0}]}],"nodes":[{"mesh":0,"skin":0},{"name":"joint"}],"skins":[{"joints":[1],"inverseBindMatrices":99}]}"#,
    });
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_gltf_with_core_feature_handlers(
        &source,
        &[GLTF_SKINS_CORE_FEATURE_HANDLER.clone()],
        Some(&diagnostics),
        None,
    );
    let document = document.read().unwrap();
    assert_eq!(document.meshes.len(), 2);
    assert_eq!(document.meshes[0].skin, Some(0));
    assert_eq!(document.meshes[1].skin, Some(0));
    assert_eq!(document.skins[0].joints, [3]);
    assert_eq!(
        document.skins[0].inverse_bind[0].m,
        [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
        ]
    );
    assert_eq!(
        diagnostics.read().unwrap()[0].kind,
        "gltf.accessor-not-found"
    );
}
