use crate::gltf_schema::{GltfMaterial, GltfTextureInfoRef};
use crate::gltf_types::GltfExtensionContext;
use flight_entity::Ref;
use flight_texture::{Texture, TextureColorSpace};

pub(crate) fn gltf_extension_materials(
    context: &Ref<GltfExtensionContext>,
) -> Vec<Ref<GltfMaterial>> {
    let source = context.read().unwrap().source.clone();
    return source.read().unwrap().materials.clone().unwrap_or_default();
}

pub(crate) fn resolve_gltf_extension_texture(
    context: &Ref<GltfExtensionContext>,
    info: Option<&GltfTextureInfoRef>,
    color_space: TextureColorSpace,
) -> Option<Ref<Texture>> {
    let resolve = context.read().unwrap().resolve_texture.clone();
    return resolve(info, color_space);
}
