use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material_extension::attach_gltf_pbr_extension;
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::PbrExtension;
use flight_materials::contract::create_anisotropy_pbr_extension;
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_ANISOTROPY_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_anisotropy".to_string(),
            apply: Arc::new(apply_gltf_anisotropy),
        }))
    });

fn apply_gltf_anisotropy(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_materials_anisotropy.clone());
        let Some(block) = block else {
            continue;
        };
        let info = block
            .read()
            .unwrap()
            .anisotropy_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let anisotropy_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let anisotropy_rotation = block.read().unwrap().anisotropy_rotation.unwrap_or(0.0);
        let anisotropy_strength = block.read().unwrap().anisotropy_strength.unwrap_or(0.0);
        let mut extension = create_anisotropy_pbr_extension();
        extension.anisotropy_map = anisotropy_map;
        extension.anisotropy_rotation = anisotropy_rotation;
        extension.anisotropy_strength = anisotropy_strength;
        let document = context.read().unwrap().document.clone();
        attach_gltf_pbr_extension(
            &mut document.write().unwrap(),
            index,
            Arc::new(RwLock::new(PbrExtension::Anisotropy(extension))),
        );
    }
}
