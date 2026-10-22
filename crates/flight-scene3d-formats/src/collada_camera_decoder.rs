use crate::collada_parse::report_collada_diagnostic;
use crate::collada_scene_shared::build_collada_node_world_matrices;
use crate::collada_types::*;
use crate::collada_xml::{
    collada_child, collada_children, collada_descendants, collada_id_of, collada_text,
};
use crate::stl_features::parse_stl_number;
use flight_camera::Projection;
use flight_camera::contract::{create_orthographic_projection, create_perspective_projection};
use flight_entity::Ref;
use flight_geometry::{create_transform3d, decompose_matrix4_to_transform3d};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_math::DEG_TO_RAD;
use flight_scene3d::Scene3DDocumentCamera;
use flight_xml::XmlElement;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static COLLADA_CAMERA_DECODER: LazyLock<Ref<ColladaElementDecoder>> = LazyLock::new(|| {
    Arc::new(RwLock::new(ColladaElementDecoder {
        build: Some(Arc::new(resolve_cameras)),
        build_phase: Some(10.0),
        decode: Arc::new(decode_cameras),
        elements: vec!["camera".to_string()],
        features: vec!["Camera", "Camera.Orthographic", "Camera.Perspective"]
            .into_iter()
            .map(str::to_string)
            .collect(),
    }))
});

// flight-lint: allow(f64) strict Number parsing before the canonical f32 scalar write; no double arithmetic
fn camera_number(
    descriptor: &Ref<XmlElement>,
    field: &str,
    fallback: f32,
    missing: Option<&mut Vec<String>>,
) -> f32 {
    let Some(source) = collada_text(Some(descriptor), field) else {
        if let Some(missing) = missing {
            missing.push(field.to_string());
        }
        return fallback;
    };
    return parse_stl_number(&source) as f32;
}

fn decode_cameras(context: &Ref<ColladaParseContext>) {
    let (root, diagnostics, definitions) = {
        let context = context.read().unwrap();
        (
            context.root.clone(),
            context.diagnostics.clone(),
            context.camera_definitions.clone(),
        )
    };
    let mut libraries = Vec::new();
    collada_descendants(&mut libraries, &root, "library_cameras");
    for library in libraries {
        let mut cameras = Vec::new();
        collada_children(&mut cameras, Some(&library), "camera");
        for camera in cameras {
            let Some(id) = collada_id_of(&camera) else {
                continue;
            };
            let technique = collada_child(
                collada_child(Some(&camera), "optics").as_ref(),
                "technique_common",
            );
            let perspective = collada_child(technique.as_ref(), "perspective");
            let orthographic = collada_child(technique.as_ref(), "orthographic");
            let name = camera
                .read()
                .unwrap()
                .attributes
                .get("name")
                .filter(|name| !name.is_empty())
                .cloned();
            let definition = if let Some(perspective) = perspective {
                let mut missing = Vec::new();
                let fov = camera_number(&perspective, "yfov", 60.0, Some(&mut missing));
                let aspect = camera_number(&perspective, "aspect_ratio", 1.0, None);
                let near = camera_number(&perspective, "znear", 0.1, Some(&mut missing));
                let far = camera_number(&perspective, "zfar", 1000.0, Some(&mut missing));
                if !fov.is_finite()
                    || !(fov > 0.0)
                    || fov >= 180.0
                    || !aspect.is_finite()
                    || !(aspect > 0.0)
                    || !near.is_finite()
                    || !(near > 0.0)
                    || !far.is_finite()
                    || !(far > near)
                {
                    invalid_camera(&diagnostics, "collada.camera-invalid-perspective", &id);
                    None
                } else {
                    incomplete_camera(&diagnostics, &id, "perspective", &missing);
                    Some(ColladaCameraDefinition::Perspective(
                        ColladaPerspectiveCameraDefinition {
                            aspect,
                            far,
                            fov_y: fov * DEG_TO_RAD,
                            name,
                            near,
                        },
                    ))
                }
            } else if let Some(orthographic) = orthographic {
                let mut missing = Vec::new();
                let half_width = camera_number(&orthographic, "xmag", 1.0, Some(&mut missing));
                let half_height = camera_number(&orthographic, "ymag", 1.0, Some(&mut missing));
                let near = camera_number(&orthographic, "znear", 0.1, Some(&mut missing));
                let far = camera_number(&orthographic, "zfar", 1000.0, Some(&mut missing));
                if !half_width.is_finite()
                    || !(half_width > 0.0)
                    || !half_height.is_finite()
                    || !(half_height > 0.0)
                    || !near.is_finite()
                    || !(near >= 0.0)
                    || !far.is_finite()
                    || !(far > near)
                {
                    invalid_camera(&diagnostics, "collada.camera-invalid-orthographic", &id);
                    None
                } else {
                    incomplete_camera(&diagnostics, &id, "orthographic", &missing);
                    Some(ColladaCameraDefinition::Orthographic(
                        ColladaOrthographicCameraDefinition {
                            far,
                            half_height,
                            half_width,
                            name,
                            near,
                        },
                    ))
                }
            } else {
                invalid_camera(&diagnostics, "collada.camera-missing-descriptor", &id);
                None
            };
            let value = definition.map(|definition| Arc::new(RwLock::new(definition)));
            let mut definitions = definitions.write().unwrap();
            if let Some(entry) = definitions.iter_mut().find(|entry| entry.key == id) {
                entry.value = value;
            } else {
                definitions.push(ColladaCameraEntry { key: id, value });
            }
        }
    }
}

fn incomplete_camera(
    diagnostics: &Ref<Vec<ImportDiagnostic>>,
    camera: &str,
    projection: &str,
    missing: &[String],
) {
    if missing.is_empty() {
        return;
    }
    report_collada_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Recover,
        "collada.camera-incomplete",
        "parseCollada",
        Some(HashMap::from([
            (
                "camera".to_string(),
                ImportDiagnosticDetailValue::String(camera.to_string()),
            ),
            (
                "fields".to_string(),
                ImportDiagnosticDetailValue::String(missing.join(",")),
            ),
            (
                "projection".to_string(),
                ImportDiagnosticDetailValue::String(projection.to_string()),
            ),
        ])),
    );
}

fn invalid_camera(diagnostics: &Ref<Vec<ImportDiagnostic>>, kind: &str, camera: &str) {
    report_collada_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        kind,
        "parseCollada",
        Some(HashMap::from([(
            "camera".to_string(),
            ImportDiagnosticDetailValue::String(camera.to_string()),
        )])),
    );
}

fn resolve_cameras(context: &Ref<ColladaBuildContext>) {
    let context = context.read().unwrap();
    let (document, definitions, diagnostics) = {
        let parse = context.parse.read().unwrap();
        (
            parse.document.clone(),
            parse.camera_definitions.clone(),
            parse.diagnostics.clone(),
        )
    };
    let mut document = document.write().unwrap();
    let mut matrices = Vec::new();
    build_collada_node_world_matrices(&mut matrices, &document.nodes, &context.root_node_indices);
    let definitions = definitions.read().unwrap();
    for binding in &context.deferred_cameras {
        let Some(entry) = definitions
            .iter()
            .find(|entry| entry.key == binding.camera_id)
        else {
            report_collada_diagnostic(
                &diagnostics,
                ImportDiagnosticSeverity::Drop,
                "collada.missing-reference",
                "parseCollada",
                Some(HashMap::from([
                    (
                        "element".to_string(),
                        ImportDiagnosticDetailValue::String("instance_camera".to_string()),
                    ),
                    (
                        "url".to_string(),
                        ImportDiagnosticDetailValue::String(format!("#{}", binding.camera_id)),
                    ),
                ])),
            );
            continue;
        };
        let Some(definition) = &entry.value else {
            continue;
        };
        let Some(Some(matrix)) = usize::try_from(binding.node_index)
            .ok()
            .and_then(|index| matrices.get(index))
        else {
            continue;
        };
        let mut transform = create_transform3d();
        decompose_matrix4_to_transform3d(&mut transform, &matrix.read().unwrap());
        let definition = definition.read().unwrap();
        let camera = match &*definition {
            ColladaCameraDefinition::Perspective(definition) => Scene3DDocumentCamera {
                far: definition.far,
                name: definition.name.clone(),
                near: definition.near,
                node: Some(binding.node_index),
                projection: {
                    let projection = create_perspective_projection();
                    {
                        let mut fields = projection.write().unwrap();
                        fields.aspect = definition.aspect;
                        fields.fov_y = definition.fov_y;
                    }
                    Projection::Perspective(projection)
                },
                transform,
            },
            ColladaCameraDefinition::Orthographic(definition) => Scene3DDocumentCamera {
                far: definition.far,
                name: definition.name.clone(),
                near: definition.near,
                node: Some(binding.node_index),
                projection: {
                    let projection = create_orthographic_projection();
                    {
                        let mut fields = projection.write().unwrap();
                        fields.half_height = definition.half_height;
                        fields.half_width = definition.half_width;
                    }
                    Projection::Orthographic(projection)
                },
                transform,
            },
        };
        document.cameras.push(camera);
    }
}
