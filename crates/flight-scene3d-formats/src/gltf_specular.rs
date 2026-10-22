use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material::pack_gltf_linear_color;
use crate::gltf_material_extension::attach_gltf_pbr_extension;
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::PbrExtension;
use flight_materials::contract::create_specular_pbr_extension;
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_SPECULAR_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_specular".to_string(),
            apply: Arc::new(apply_gltf_specular),
        }))
    });

fn apply_gltf_specular(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_materials_specular.clone());
        let Some(block) = block else {
            continue;
        };
        let color = block
            .read()
            .unwrap()
            .specular_color_factor
            .clone()
            .unwrap_or_else(|| vec![1.0, 1.0, 1.0]);
        let specular = block.read().unwrap().specular_factor.unwrap_or(1.0);
        let color = [
            color.first().copied().unwrap_or(1.0),
            color.get(1).copied().unwrap_or(1.0),
            color.get(2).copied().unwrap_or(1.0),
        ];
        let specular_color = pack_gltf_linear_color(&color, 3);
        let info = block
            .read()
            .unwrap()
            .specular_color_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let specular_color_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Srgb);
        let info = block
            .read()
            .unwrap()
            .specular_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let specular_map =
            resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let mut extension = create_specular_pbr_extension();
        extension.specular = specular;
        extension.specular_color = specular_color;
        extension.specular_color_map = specular_color_map;
        extension.specular_map = specular_map;
        let document = context.read().unwrap().document.clone();
        attach_gltf_pbr_extension(
            &mut document.write().unwrap(),
            index,
            Arc::new(RwLock::new(PbrExtension::Specular(extension))),
        );
    }
}
