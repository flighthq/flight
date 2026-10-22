use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material_extension::attach_gltf_pbr_extension;
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::PbrExtension;
use flight_materials::contract::create_iridescence_pbr_extension;
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_IRIDESCENCE_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_iridescence".to_string(),
            apply: Arc::new(apply_gltf_iridescence),
        }))
    });

fn apply_gltf_iridescence(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_materials_iridescence.clone());
        let Some(block) = block else {
            continue;
        };
        let iridescence = block.read().unwrap().iridescence_factor.unwrap_or(0.0);
        let iridescence_ior = block.read().unwrap().iridescence_ior.unwrap_or(1.3);
        let info = block
            .read()
            .unwrap()
            .iridescence_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let iridescence_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let info = block
            .read()
            .unwrap()
            .iridescence_thickness_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let iridescence_thickness_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let iridescence_thickness_max = block
            .read()
            .unwrap()
            .iridescence_thickness_maximum
            .unwrap_or(400.0);
        let iridescence_thickness_min = block
            .read()
            .unwrap()
            .iridescence_thickness_minimum
            .unwrap_or(100.0);
        let mut extension = create_iridescence_pbr_extension();
        extension.iridescence = iridescence;
        extension.iridescence_ior = iridescence_ior;
        extension.iridescence_map = iridescence_map;
        extension.iridescence_thickness_map = iridescence_thickness_map;
        extension.iridescence_thickness_max = iridescence_thickness_max;
        extension.iridescence_thickness_min = iridescence_thickness_min;
        let document = context.read().unwrap().document.clone();
        attach_gltf_pbr_extension(
            &mut document.write().unwrap(),
            index,
            Arc::new(RwLock::new(PbrExtension::Iridescence(extension))),
        );
    }
}
