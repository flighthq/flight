use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material::pack_gltf_linear_color;
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::contract::create_specular_glossiness_pbr_material;
use flight_materials::{Material, Material3D, STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial};
use flight_scene3d::{Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_pbrSpecularGlossiness".to_string(),
            apply: Arc::new(apply_gltf_specular_glossiness),
        }))
    });

fn apply_gltf_specular_glossiness(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions.and_then(|extensions| {
            extensions
                .read()
                .unwrap()
                .khr_materials_pbr_specular_glossiness
                .clone()
        });
        let Some(block) = block else {
            continue;
        };
        let document = context.read().unwrap().document.clone();
        let existing = {
            let document = document.read().unwrap();
            match document.materials.get(index) {
                Some(Scene3DDocumentMaterial::Entity(material)) => Some(material.material.clone()),
                _ => None,
            }
        };
        let Some(existing) = existing else {
            continue;
        };
        {
            let existing = existing.read().unwrap();
            if existing.material_fields().kind != STANDARD_PBR_MATERIAL_KIND
                || !existing.as_any().is::<StandardPbrMaterial>()
            {
                continue;
            }
        }
        let diffuse = block
            .read()
            .unwrap()
            .diffuse_factor
            .clone()
            .unwrap_or_else(|| vec![1.0; 4]);
        let specular = block
            .read()
            .unwrap()
            .specular_factor
            .clone()
            .unwrap_or_else(|| vec![1.0; 3]);
        let diffuse = [
            diffuse.first().copied().unwrap_or(1.0),
            diffuse.get(1).copied().unwrap_or(1.0),
            diffuse.get(2).copied().unwrap_or(1.0),
            diffuse.get(3).copied().unwrap_or(1.0),
        ];
        let diffuse = pack_gltf_linear_color(&diffuse, 4);
        let info = block
            .read()
            .unwrap()
            .diffuse_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let diffuse_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Srgb);
        let (
            emissive,
            emissive_map,
            emissive_strength,
            glossiness,
            normal_map,
            normal_scale,
            occlusion_map,
            occlusion_strength,
        ) = {
            let existing = existing.read().unwrap();
            let standard = existing
                .as_any()
                .downcast_ref::<StandardPbrMaterial>()
                .unwrap();
            (
                standard.emissive,
                standard.emissive_map.clone(),
                standard.emissive_strength,
                block.read().unwrap().glossiness_factor.unwrap_or(1.0),
                standard.normal_map.clone(),
                standard.normal_scale,
                standard.occlusion_map.clone(),
                standard.occlusion_strength,
            )
        };
        let specular = [
            specular.first().copied().unwrap_or(1.0),
            specular.get(1).copied().unwrap_or(1.0),
            specular.get(2).copied().unwrap_or(1.0),
        ];
        let specular = pack_gltf_linear_color(&specular, 3);
        let info = block
            .read()
            .unwrap()
            .specular_glossiness_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let specular_glossiness_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Srgb);
        let mut replacement = create_specular_glossiness_pbr_material();
        replacement.diffuse = diffuse;
        replacement.diffuse_map = diffuse_map;
        replacement.emissive = emissive;
        replacement.emissive_map = emissive_map;
        replacement.emissive_strength = emissive_strength;
        replacement.glossiness = glossiness;
        replacement.normal_map = normal_map;
        replacement.normal_scale = normal_scale;
        replacement.occlusion_map = occlusion_map;
        replacement.occlusion_strength = occlusion_strength;
        replacement.specular = specular;
        replacement.specular_glossiness_map = specular_glossiness_map;
        {
            let existing = existing.read().unwrap();
            let standard = existing
                .as_any()
                .downcast_ref::<StandardPbrMaterial>()
                .unwrap();
            replacement.material3d_fields_mut().alpha_cutoff =
                standard.material3d_fields().alpha_cutoff;
            replacement.material3d_fields_mut().alpha_mode =
                standard.material3d_fields().alpha_mode;
            replacement.material3d_fields_mut().double_sided =
                standard.material3d_fields().double_sided;
            replacement.material_fields_mut().name = standard.material_fields().name.clone();
        }
        document.write().unwrap().materials[index] =
            Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
                material: Arc::new(RwLock::new(replacement)),
            });
    }
}
