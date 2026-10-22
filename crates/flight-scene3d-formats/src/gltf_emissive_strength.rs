use crate::gltf_extension_shared::gltf_extension_materials;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_materials::{
    EXTENDED_PBR_MATERIAL_KIND, ExtendedPbrMaterial, STANDARD_PBR_MATERIAL_KIND,
    StandardPbrMaterial,
};
use flight_scene3d::Scene3DDocumentMaterial;
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_emissive_strength".to_string(),
            apply: Arc::new(apply_gltf_emissive_strength),
        }))
    });

fn apply_gltf_emissive_strength(context: &Ref<GltfExtensionContext>) {
    let mut negative = 0;
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions.and_then(|extensions| {
            extensions
                .read()
                .unwrap()
                .khr_materials_emissive_strength
                .clone()
        });
        let strength = block.and_then(|block| block.read().unwrap().emissive_strength);
        let Some(strength) = strength else {
            continue;
        };
        if !(strength >= 0.0) {
            negative += 1;
            continue;
        }
        let document = context.read().unwrap().document.clone();
        let material = {
            let document = document.read().unwrap();
            match document.materials.get(index) {
                Some(Scene3DDocumentMaterial::Entity(material)) => Some(material.material.clone()),
                _ => None,
            }
        };
        let Some(material) = material else {
            continue;
        };
        let mut material = material.write().unwrap();
        if material.material_fields().kind == STANDARD_PBR_MATERIAL_KIND {
            if let Some(standard) = material.as_any_mut().downcast_mut::<StandardPbrMaterial>() {
                standard.emissive_strength = strength;
            }
        } else if material.material_fields().kind == EXTENDED_PBR_MATERIAL_KIND {
            if let Some(extended) = material.as_any_mut().downcast_mut::<ExtendedPbrMaterial>() {
                extended.standard.emissive_strength = strength;
            }
        }
    }
    if negative > 0 {
        let diagnostics = context.read().unwrap().diagnostics.clone();
        if let Some(diagnostics) = diagnostics {
            report_import_diagnostic(
                Some(&mut diagnostics.write().unwrap()),
                ImportDiagnosticSeverity::Drop,
                "gltf.emissive-strength-negative",
                "GltfEmissiveStrengthExtensionHandler",
                Some(HashMap::from([(
                    "count".to_string(),
                    ImportDiagnosticDetailValue::Number(negative as f32),
                )])),
            );
        }
    }
}
