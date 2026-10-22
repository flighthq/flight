use flight_entity::Ref;
use flight_materials::contract::{
    create_extended_pbr_material, create_standard_pbr_material_properties,
};
use flight_materials::{
    EXTENDED_PBR_MATERIAL_KIND, ExtendedPbrMaterial, Material, Material3D, PbrExtension,
    STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial, StandardPbrMaterialPropertiesOptions,
};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use std::sync::{Arc, RwLock};

pub fn attach_gltf_pbr_extension(
    document: &mut Scene3DDocument,
    index: usize,
    extension: Ref<PbrExtension>,
) -> bool {
    let Some(Scene3DDocumentMaterial::Entity(existing)) = document.materials.get(index) else {
        return false;
    };
    let extension_kind = pbr_extension_kind(&extension.read().unwrap()).to_string();
    let mut existing = existing.material.write().unwrap();
    if existing.material_fields().kind == EXTENDED_PBR_MATERIAL_KIND {
        let Some(extended) = existing.as_any_mut().downcast_mut::<ExtendedPbrMaterial>() else {
            return false;
        };
        if extended
            .extensions
            .iter()
            .any(|entry| pbr_extension_kind(&entry.read().unwrap()) == extension_kind)
        {
            return false;
        }
        extended.extensions.push(extension);
        return true;
    }
    if existing.material_fields().kind != STANDARD_PBR_MATERIAL_KIND {
        return false;
    }
    let Some(standard) = existing.as_any().downcast_ref::<StandardPbrMaterial>() else {
        return false;
    };
    let properties =
        create_standard_pbr_material_properties(Some(&StandardPbrMaterialPropertiesOptions {
            alpha_map: standard.alpha_map.clone(),
            base_color: Some(standard.base_color),
            base_color_map: standard.base_color_map.clone(),
            emissive: Some(standard.emissive),
            emissive_map: standard.emissive_map.clone(),
            emissive_strength: Some(standard.emissive_strength),
            metallic: Some(standard.metallic),
            metallic_roughness_map: standard.metallic_roughness_map.clone(),
            normal_map: standard.normal_map.clone(),
            normal_scale: Some(standard.normal_scale),
            occlusion_map: standard.occlusion_map.clone(),
            occlusion_strength: Some(standard.occlusion_strength),
            roughness: Some(standard.roughness),
        }));
    let mut promoted = create_extended_pbr_material();
    promoted.extensions = vec![extension];
    promoted.standard = properties;
    promoted.material3d_fields_mut().alpha_cutoff = standard.material3d_fields().alpha_cutoff;
    promoted.material3d_fields_mut().alpha_mode = standard.material3d_fields().alpha_mode;
    promoted.material3d_fields_mut().double_sided = standard.material3d_fields().double_sided;
    promoted.material_fields_mut().name = standard.material_fields().name.clone();
    drop(existing);
    document.materials[index] = Scene3DDocumentMaterial::Entity(Scene3DDocumentMaterialEntity {
        material: Arc::new(RwLock::new(promoted)),
    });
    return true;
}

pub fn find_gltf_pbr_extension(
    document: &Scene3DDocument,
    index: usize,
    kind: &str,
) -> Option<Ref<PbrExtension>> {
    let Some(Scene3DDocumentMaterial::Entity(material)) = document.materials.get(index) else {
        return None;
    };
    let material = material.material.read().unwrap();
    if material.material_fields().kind != EXTENDED_PBR_MATERIAL_KIND {
        return None;
    }
    let extended = material.as_any().downcast_ref::<ExtendedPbrMaterial>()?;
    return extended
        .extensions
        .iter()
        .find(|entry| pbr_extension_kind(&entry.read().unwrap()) == kind)
        .cloned();
}

fn pbr_extension_kind(extension: &PbrExtension) -> &str {
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
