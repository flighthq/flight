use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material_extension::attach_gltf_pbr_extension;
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::PbrExtension;
use flight_materials::contract::create_clearcoat_pbr_extension;
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_CLEARCOAT_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_clearcoat".to_string(),
            apply: Arc::new(apply_gltf_clearcoat),
        }))
    });

fn apply_gltf_clearcoat(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_materials_clearcoat.clone());
        let Some(block) = block else {
            continue;
        };
        let clearcoat = block.read().unwrap().clearcoat_factor.unwrap_or(0.0);
        let info = block
            .read()
            .unwrap()
            .clearcoat_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let clearcoat_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let info = block
            .read()
            .unwrap()
            .clearcoat_normal_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let clearcoat_normal_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let clearcoat_normal_scale = block
            .read()
            .unwrap()
            .clearcoat_normal_texture
            .as_ref()
            .and_then(|info| info.read().unwrap().scale)
            .unwrap_or(1.0);
        let clearcoat_roughness = block
            .read()
            .unwrap()
            .clearcoat_roughness_factor
            .unwrap_or(0.0);
        let info = block
            .read()
            .unwrap()
            .clearcoat_roughness_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let clearcoat_roughness_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let mut extension = create_clearcoat_pbr_extension();
        extension.clearcoat = clearcoat;
        extension.clearcoat_map = clearcoat_map;
        extension.clearcoat_normal_map = clearcoat_normal_map;
        extension.clearcoat_normal_scale = clearcoat_normal_scale;
        extension.clearcoat_roughness = clearcoat_roughness;
        extension.clearcoat_roughness_map = clearcoat_roughness_map;
        let document = context.read().unwrap().document.clone();
        attach_gltf_pbr_extension(
            &mut document.write().unwrap(),
            index,
            Arc::new(RwLock::new(PbrExtension::Clearcoat(extension))),
        );
    }
}
