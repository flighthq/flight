use crate::gltf_core_shared::{gltf_core_index, report_gltf_core_values};
use crate::gltf_types::{GltfCoreFeatureContext, GltfCoreFeatureHandler};
use flight_camera::{Projection, create_orthographic_projection, create_perspective_projection};
use flight_entity::Ref;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d::Scene3DDocumentCamera;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_CAMERAS_CORE_FEATURE_HANDLER: LazyLock<Ref<GltfCoreFeatureHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "cameras".to_string(),
            apply: Arc::new(apply_gltf_cameras),
        }))
    });

fn apply_gltf_cameras(context: &Ref<GltfCoreFeatureContext>) {
    let (source, document, node_indices, build_node_transform) = {
        let context = context.read().unwrap();
        (
            context.source.clone(),
            context.document.clone(),
            context.node_indices.clone(),
            context.build_node_transform.clone(),
        )
    };
    let (definitions, nodes) = {
        let source = source.read().unwrap();
        (
            source.cameras.clone().unwrap_or_default(),
            source.nodes.clone().unwrap_or_default(),
        )
    };
    let mut cameras = Vec::new();
    for (node, row) in nodes.iter().enumerate() {
        let Some(camera_index) = row.read().unwrap().camera else {
            continue;
        };
        let definition = gltf_core_index(camera_index).and_then(|index| definitions.get(index));
        let Some(definition) = definition else {
            report_gltf_core_values(
                context,
                ImportDiagnosticSeverity::Drop,
                "gltf.camera-missing",
                &[
                    (
                        "firstCamera",
                        ImportDiagnosticDetailValue::Number(camera_index),
                    ),
                    (
                        "firstNode",
                        ImportDiagnosticDetailValue::Number(node as f32),
                    ),
                ],
            );
            continue;
        };
        let (kind, perspective, orthographic, name) = {
            let definition = definition.read().unwrap();
            (
                definition.r#type.clone(),
                definition.perspective.clone(),
                definition.orthographic.clone(),
                definition.name.clone(),
            )
        };
        if kind == "perspective" {
            if let Some(perspective) = perspective {
                let (fov, near, far, aspect) = {
                    let perspective = perspective.read().unwrap();
                    (
                        perspective.yfov,
                        perspective.znear,
                        perspective.zfar,
                        perspective.aspect_ratio,
                    )
                };
                if !(fov > 0.0)
                    || fov >= std::f32::consts::PI
                    || !(near > 0.0)
                    || far.is_some_and(|far| !(far > near))
                    || aspect.is_some_and(|aspect| !(aspect > 0.0))
                {
                    report_gltf_core_values(
                        context,
                        ImportDiagnosticSeverity::Drop,
                        "gltf.camera-invalid-perspective",
                        &[(
                            "firstCamera",
                            ImportDiagnosticDetailValue::Number(camera_index),
                        )],
                    );
                    continue;
                }
                let projection = create_perspective_projection();
                {
                    let mut projection = projection.write().unwrap();
                    projection.aspect = aspect.unwrap_or(1.0);
                    projection.fov_y = fov;
                }
                let mapped = node_indices.read().unwrap().get(node).copied();
                cameras.push(Scene3DDocumentCamera {
                    far: far.unwrap_or(f32::INFINITY),
                    name,
                    near,
                    node: mapped,
                    projection: Projection::Perspective(projection),
                    transform: build_node_transform(node as f32),
                });
                continue;
            }
        }
        if kind == "orthographic" {
            if let Some(orthographic) = orthographic {
                let (width, height, near, far) = {
                    let orthographic = orthographic.read().unwrap();
                    (
                        orthographic.xmag,
                        orthographic.ymag,
                        orthographic.znear,
                        orthographic.zfar,
                    )
                };
                if !(width > 0.0) || !(height > 0.0) || !(near >= 0.0) || !(far > near) {
                    report_gltf_core_values(
                        context,
                        ImportDiagnosticSeverity::Drop,
                        "gltf.camera-invalid-orthographic",
                        &[(
                            "firstCamera",
                            ImportDiagnosticDetailValue::Number(camera_index),
                        )],
                    );
                    continue;
                }
                let projection = create_orthographic_projection();
                {
                    let mut projection = projection.write().unwrap();
                    projection.half_width = width;
                    projection.half_height = height;
                }
                let mapped = node_indices.read().unwrap().get(node).copied();
                cameras.push(Scene3DDocumentCamera {
                    far,
                    name,
                    near,
                    node: mapped,
                    projection: Projection::Orthographic(projection),
                    transform: build_node_transform(node as f32),
                });
                continue;
            }
        }
        report_gltf_core_values(
            context,
            ImportDiagnosticSeverity::Drop,
            "gltf.camera-missing-descriptor",
            &[
                (
                    "firstCamera",
                    ImportDiagnosticDetailValue::Number(camera_index),
                ),
                ("firstType", ImportDiagnosticDetailValue::String(kind)),
            ],
        );
    }
    document.write().unwrap().cameras.extend(cameras);
}
