use crate::gltf_extension_shared::gltf_extension_materials;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::contract::create_unlit_material;
use flight_materials::{Material, Material3D, STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_UNLIT_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_unlit".to_string(),
            apply: Arc::new(apply_gltf_unlit),
        }))
    });

fn apply_gltf_unlit(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let present = extensions
            .is_some_and(|extensions| extensions.read().unwrap().khr_materials_unlit.is_some());
        if !present {
            continue;
        }
        let document = context.read().unwrap().document.clone();
        let mut document = document.write().unwrap();
        let Some(Scene3DDocumentMaterial::Entity(existing)) = document.materials.get(index) else {
            continue;
        };
        let existing = existing.material.read().unwrap();
        if existing.material_fields().kind != STANDARD_PBR_MATERIAL_KIND {
            continue;
        }
        let Some(standard) = existing.as_any().downcast_ref::<StandardPbrMaterial>() else {
            continue;
        };
        let mut replacement = create_unlit_material();
        replacement.base_color = standard.base_color;
        replacement.base_color_map = standard.base_color_map.clone();
        replacement.material3d_fields_mut().alpha_cutoff =
            standard.material3d_fields().alpha_cutoff;
        replacement.material3d_fields_mut().alpha_mode = standard.material3d_fields().alpha_mode;
        replacement.material3d_fields_mut().double_sided =
            standard.material3d_fields().double_sided;
        replacement.material_fields_mut().name = standard.material_fields().name.clone();
        drop(existing);
        document.materials[index] =
            Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
                material: Arc::new(RwLock::new(replacement)),
            });
    }
}
