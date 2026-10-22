use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Kind, Ref};
use flight_materials::{
    EXTENDED_PBR_MATERIAL_KIND, ExtendedPbrMaterial, Material, PbrExtension,
    STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial, StandardPbrMaterialProperties,
    UNLIT_MATERIAL_KIND, UnlitMaterial,
};
use flight_texture::Texture;

use crate::types::*;

pub fn create_scene3d_material_texture_registry() -> Scene3DMaterialTextureRegistry {
    return Scene3DMaterialTextureRegistry {
        extension_listers: Arc::new(RwLock::new(HashMap::new())),
        listers: Arc::new(RwLock::new(HashMap::new())),
    };
}

fn get_pbr_extension_kind(extension: &PbrExtension) -> &str {
    return match extension {
        PbrExtension::Anisotropy(extension) => &extension.kind,
        PbrExtension::Clearcoat(extension) => &extension.kind,
        PbrExtension::Iridescence(extension) => &extension.kind,
        PbrExtension::Sheen(extension) => &extension.kind,
        PbrExtension::Specular(extension) => &extension.kind,
        PbrExtension::TransmissionVolume(extension) => &extension.kind,
        PbrExtension::WrappedDiffuse(extension) => &extension.kind,
    };
}

/// Looks up the lister for the material's kind and, when present, appends the material's non-null
/// textures to `out`. An unregistered kind appends nothing. Does not clear `out`; it accumulates
/// across the materials of a mesh.
// flight-lint: allow(contract-vocabulary) D16 open Material family: the lister reads any kind by its open kind name (TS `Readonly<Material>`)
pub fn get_scene3d_material_textures(
    registry: &Scene3DMaterialTextureRegistry,
    material: &dyn Material,
    out: &mut Vec<Ref<Texture>>,
) {
    let lister = registry
        .listers
        .read()
        .unwrap()
        .get(&material.material_fields().kind)
        .cloned();
    if let Some(lister) = lister {
        lister(material, out);
    }
}

/// Whether `kind` has a lister at all, which separates an unregistered kind from a material that
/// genuinely has no maps.
pub fn has_scene3d_material_texture_lister(
    registry: &Scene3DMaterialTextureRegistry,
    kind: &str,
) -> bool {
    return registry.listers.read().unwrap().contains_key(kind);
}

fn list_standard_pbr_material_textures(material: &dyn Material, out: &mut Vec<Ref<Texture>>) {
    let Some(pbr) = material.as_any().downcast_ref::<StandardPbrMaterial>() else {
        return;
    };
    push_texture_slot(&pbr.base_color_map, out);
    push_texture_slot(&pbr.emissive_map, out);
    push_texture_slot(&pbr.metallic_roughness_map, out);
    push_texture_slot(&pbr.normal_map, out);
    push_texture_slot(&pbr.occlusion_map, out);
}

fn list_standard_pbr_properties_textures(
    pbr: &StandardPbrMaterialProperties,
    out: &mut Vec<Ref<Texture>>,
) {
    push_texture_slot(&pbr.base_color_map, out);
    push_texture_slot(&pbr.emissive_map, out);
    push_texture_slot(&pbr.metallic_roughness_map, out);
    push_texture_slot(&pbr.normal_map, out);
    push_texture_slot(&pbr.occlusion_map, out);
}

fn list_unlit_material_textures(material: &dyn Material, out: &mut Vec<Ref<Texture>>) {
    let Some(unlit) = material.as_any().downcast_ref::<UnlitMaterial>() else {
        return;
    };
    push_texture_slot(&unlit.base_color_map, out);
}

pub(crate) fn push_texture_slot(slot: &Option<Ref<Texture>>, out: &mut Vec<Ref<Texture>>) {
    if let Some(texture) = slot {
        out.push(texture.clone());
    }
}

pub fn register_extended_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    let extension_listers = registry.extension_listers.clone();
    register_scene3d_material_textures(
        registry,
        EXTENDED_PBR_MATERIAL_KIND.to_string(),
        Arc::new(move |material, out| {
            let Some(extended) = material.as_any().downcast_ref::<ExtendedPbrMaterial>() else {
                return;
            };
            list_standard_pbr_properties_textures(&extended.standard, out);
            for extension in &extended.extensions {
                let extension = extension.read().unwrap();
                let lister = extension_listers
                    .read()
                    .unwrap()
                    .get(get_pbr_extension_kind(&extension))
                    .cloned();
                if let Some(lister) = lister {
                    lister(&extension, out);
                }
            }
        }),
    );
}

/// Binds `lister` to `kind`, last write wins. Overriding a built-in with a custom lister is a
/// feature, not an error, so there is no registration guard.
pub fn register_scene3d_material_textures(
    registry: &Scene3DMaterialTextureRegistry,
    kind: Kind,
    lister: Scene3DMaterialTextureLister,
) {
    registry.listers.write().unwrap().insert(kind, lister);
}

pub fn register_scene3d_pbr_extension_textures(
    registry: &Scene3DMaterialTextureRegistry,
    kind: Kind,
    lister: Scene3DPbrExtensionTextureLister,
) {
    registry.extension_listers.write().unwrap().insert(kind, lister);
}

pub fn register_standard_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_material_textures(
        registry,
        STANDARD_PBR_MATERIAL_KIND.to_string(),
        Arc::new(list_standard_pbr_material_textures),
    );
}

pub fn register_unlit_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_material_textures(
        registry,
        UNLIT_MATERIAL_KIND.to_string(),
        Arc::new(list_unlit_material_textures),
    );
}
