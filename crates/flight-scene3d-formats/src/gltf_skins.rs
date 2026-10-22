use crate::gltf_core_shared::{gltf_component_values, gltf_core_index, report_gltf_core_values};
use crate::gltf_types::{GltfCoreFeatureContext, GltfCoreFeatureHandler};
use flight_entity::Ref;
use flight_geometry::create_matrix4;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d::Scene3DDocumentSkin;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_SKINS_CORE_FEATURE_HANDLER: LazyLock<Ref<GltfCoreFeatureHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "skins".to_string(),
            apply: Arc::new(apply_gltf_skins),
        }))
    });

fn apply_gltf_skins(context: &Ref<GltfCoreFeatureContext>) {
    let (source, document, node_indices, read_accessor, report_accessor_fault) = {
        let context = context.read().unwrap();
        (
            context.source.clone(),
            context.document.clone(),
            context.node_indices.clone(),
            context.read_accessor.clone(),
            context.report_accessor_fault.clone(),
        )
    };
    let skins = source.read().unwrap().skins.clone().unwrap_or_default();
    let mut built = Vec::new();
    for skin in skins {
        let (source_joints, inverse_bind_index) = {
            let skin = skin.read().unwrap();
            (skin.joints.clone(), skin.inverse_bind_matrices)
        };
        let joints: Vec<_> = {
            let indices = node_indices.read().unwrap();
            source_joints
                .iter()
                .map(|index| {
                    gltf_core_index(*index)
                        .and_then(|index| indices.get(index))
                        .copied()
                        .unwrap_or(-1)
                })
                .collect()
        };
        let mut inverse_bind = Vec::new();
        if let Some(index) = inverse_bind_index {
            let matrices = read_accessor(index, Some("MAT4"));
            if let Some(fault) = matrices.fault {
                report_accessor_fault(ImportDiagnosticSeverity::Recover, &fault);
                for _ in &joints {
                    inverse_bind.push(create_matrix4());
                }
            } else if matrices.count < joints.len() {
                report_gltf_core_values(
                    context,
                    ImportDiagnosticSeverity::Recover,
                    "gltf.skin-ibm-count-mismatch",
                    &[
                        (
                            "firstActual",
                            ImportDiagnosticDetailValue::Number(matrices.count as f32),
                        ),
                        (
                            "firstExpected",
                            ImportDiagnosticDetailValue::Number(joints.len() as f32),
                        ),
                    ],
                );
                for _ in &joints {
                    inverse_bind.push(create_matrix4());
                }
            } else {
                let mut values = Vec::new();
                gltf_component_values(&mut values, &matrices.data);
                for joint in 0..joints.len() {
                    let mut matrix = create_matrix4();
                    for component in 0..16 {
                        matrix.m[component] =
                            values.get(joint * 16 + component).copied().unwrap_or(0.0);
                    }
                    inverse_bind.push(matrix);
                }
            }
        } else {
            for _ in &joints {
                inverse_bind.push(create_matrix4());
            }
        }
        built.push(Scene3DDocumentSkin {
            inverse_bind,
            joints,
        });
    }
    document.write().unwrap().skins.extend(built);
    bind_gltf_skins(context);
}

fn bind_gltf_skins(context: &Ref<GltfCoreFeatureContext>) {
    let (source, document, mesh_indices) = {
        let context = context.read().unwrap();
        (
            context.source.clone(),
            context.document.clone(),
            context.mesh_indices.clone(),
        )
    };
    let nodes = source.read().unwrap().nodes.clone().unwrap_or_default();
    for node in nodes {
        let (skin, mesh) = {
            let node = node.read().unwrap();
            (node.skin, node.mesh)
        };
        let (Some(skin), Some(mesh)) = (skin, mesh) else {
            continue;
        };
        let indices = gltf_core_index(mesh)
            .and_then(|index| mesh_indices.read().unwrap().get(index).cloned());
        if let Some(indices) = indices {
            let indices = indices.read().unwrap().clone();
            for index in indices {
                if let Some(mesh) = document.write().unwrap().meshes.get_mut(index as usize) {
                    mesh.skin = Some(
                        gltf_core_index(skin)
                            .and_then(|index| i32::try_from(index).ok())
                            .unwrap_or(-1),
                    );
                }
            }
        }
    }
}
