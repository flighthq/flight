use crate::gltf_test_helper::minimal_gltf_document;
use flight_camera::Projection;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

#[test]
fn imports_placed_cameras_when_explicitly_selected() {
    let source = minimal_gltf_document();
    source.write().unwrap().cameras = Some(vec![Arc::new(RwLock::new(GltfCamera {
        name: Some("view".to_string()),
        orthographic: None,
        perspective: Some(Arc::new(RwLock::new(GltfPerspectiveCamera {
            aspect_ratio: None,
            yfov: 1.0,
            zfar: None,
            znear: 0.1,
        }))),
        r#type: "perspective".to_string(),
    }))]);
    source.write().unwrap().nodes = Some(vec![Arc::new(RwLock::new(GltfNode {
        camera: Some(0.0),
        name: None,
        children: None,
        mesh: None,
        skin: None,
        matrix: None,
        translation: Some(vec![1.0, 2.0, 3.0]),
        rotation: None,
        scale: None,
        extensions: None,
    }))]);
    source.write().unwrap().scene = Some(0.0);
    source.write().unwrap().scenes = Some(vec![Arc::new(RwLock::new(GltfScene3D {
        name: None,
        nodes: Some(vec![0.0]),
    }))]);
    let document = parse_gltf_with_core_feature_handlers(
        &GltfSource::Document(GltfDocumentSource { source: &source }),
        &[GLTF_CAMERAS_CORE_FEATURE_HANDLER.clone()],
        None,
        None,
    );
    assert_eq!(
        GLTF_CAMERAS_CORE_FEATURE_HANDLER.read().unwrap().kind,
        "cameras"
    );
    let document = document.read().unwrap();
    assert_eq!(document.cameras.len(), 1);
    let camera = &document.cameras[0];
    assert_eq!(camera.name.as_deref(), Some("view"));
    assert_eq!(camera.node, Some(0));
    // D1 f32 bound (TS: 0)
    assert!((camera.near as f64 - 0.1).abs() <= 4.0 * f32::EPSILON as f64);
    assert_eq!(
        (
            camera.transform.position.x,
            camera.transform.position.y,
            camera.transform.position.z
        ),
        (1.0, 2.0, 3.0)
    );
    assert_eq!(camera.far, f32::INFINITY);
}

#[test]
fn orthographic_placement_and_invalid_camera_roles_use_original_world_nodes_and_first_offender_tallies()
 {
    let source = GltfSource::Json(GltfJsonSource {
        source: r#"{"asset":{"version":"2.0"},"cameras":[{"type":"orthographic","orthographic":{"xmag":2,"ymag":3,"znear":0,"zfar":10}},{"type":"perspective","perspective":{"yfov":0,"znear":0.1}},{"type":"other"}],"nodes":[{"children":[1],"translation":[1,0,0]},{"camera":0,"translation":[2,0,0]},{"camera":1},{"camera":2},{"camera":99},{"camera":98}]}"#,
    });
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_gltf_with_core_feature_handlers(
        &source,
        &[GLTF_CAMERAS_CORE_FEATURE_HANDLER.clone()],
        Some(&diagnostics),
        None,
    );
    let document = document.read().unwrap();
    assert_eq!(document.cameras.len(), 1);
    assert_eq!(document.cameras[0].transform.position.x, 3.0);
    let Projection::Orthographic(projection) = &document.cameras[0].projection else {
        panic!("expected orthographic projection")
    };
    assert_eq!(projection.read().unwrap().half_width, 2.0);
    assert_eq!(projection.read().unwrap().half_height, 3.0);
    let diagnostics = diagnostics.read().unwrap();
    assert_eq!(
        diagnostics
            .iter()
            .map(|diagnostic| diagnostic.kind.as_str())
            .collect::<Vec<_>>(),
        [
            "gltf.camera-invalid-perspective",
            "gltf.camera-missing-descriptor",
            "gltf.camera-missing"
        ]
    );
    assert!(
        diagnostics
            .iter()
            .all(|diagnostic| diagnostic.severity == ImportDiagnosticSeverity::Drop)
    );
}
