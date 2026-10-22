use crate::gltf_extension_shared::{gltf_extension_materials, resolve_gltf_extension_texture};
use crate::gltf_material::pack_gltf_linear_color;
use crate::gltf_material_extension::{attach_gltf_pbr_extension, find_gltf_pbr_extension};
use crate::gltf_schema::GltfTextureInfoRef;
use crate::gltf_types::{GltfExtensionContext, GltfExtensionHandler};
use flight_entity::Ref;
use flight_materials::contract::create_transmission_volume_pbr_extension;
use flight_materials::{PbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND};
use flight_texture::TextureColorSpace;
use std::sync::{Arc, LazyLock, RwLock};

pub static GLTF_IOR_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(GltfExtensionHandler {
        kind: "KHR_materials_ior".to_string(),
        apply: Arc::new(apply_gltf_ior),
    }))
});
pub static GLTF_TRANSMISSION_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_transmission".to_string(),
            apply: Arc::new(apply_gltf_transmission),
        }))
    });
pub static GLTF_VOLUME_EXTENSION_HANDLER: LazyLock<Ref<GltfExtensionHandler>> =
    LazyLock::new(|| {
        Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_volume".to_string(),
            apply: Arc::new(apply_gltf_volume),
        }))
    });

fn apply_gltf_ior(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block =
            extensions.and_then(|extensions| extensions.read().unwrap().khr_materials_ior.clone());
        let Some(block) = block else {
            continue;
        };
        let Some(target) = resolve_transmission_volume(context, index) else {
            continue;
        };
        let ior = block.read().unwrap().ior.unwrap_or(1.5);
        let mut target = target.write().unwrap();
        if let PbrExtension::TransmissionVolume(target) = &mut *target {
            target.ior = ior;
        }
    }
}

fn apply_gltf_transmission(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions.and_then(|extensions| {
            extensions
                .read()
                .unwrap()
                .khr_materials_transmission
                .clone()
        });
        let Some(block) = block else {
            continue;
        };
        let Some(target) = resolve_transmission_volume(context, index) else {
            continue;
        };
        {
            let transmission = block.read().unwrap().transmission_factor.unwrap_or(0.0);
            let mut target = target.write().unwrap();
            if let PbrExtension::TransmissionVolume(target) = &mut *target {
                target.transmission = transmission;
            }
        }
        let info = block
            .read()
            .unwrap()
            .transmission_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let map = resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let mut target = target.write().unwrap();
        if let PbrExtension::TransmissionVolume(target) = &mut *target {
            target.transmission_map = map;
        }
    }
}

fn apply_gltf_volume(context: &Ref<GltfExtensionContext>) {
    for (index, material) in gltf_extension_materials(context).iter().enumerate() {
        let extensions = material.read().unwrap().extensions.clone();
        let block = extensions
            .and_then(|extensions| extensions.read().unwrap().khr_materials_volume.clone());
        let Some(block) = block else {
            continue;
        };
        let Some(target) = resolve_transmission_volume(context, index) else {
            continue;
        };
        {
            let attenuation = block
                .read()
                .unwrap()
                .attenuation_color
                .clone()
                .unwrap_or_else(|| vec![1.0, 1.0, 1.0]);
            let attenuation = [
                attenuation.first().copied().unwrap_or(1.0),
                attenuation.get(1).copied().unwrap_or(1.0),
                attenuation.get(2).copied().unwrap_or(1.0),
            ];
            let color = pack_gltf_linear_color(&attenuation, 3);
            let distance = block
                .read()
                .unwrap()
                .attenuation_distance
                .unwrap_or(f32::INFINITY);
            let thickness = block.read().unwrap().thickness_factor.unwrap_or(0.0);
            let mut target = target.write().unwrap();
            if let PbrExtension::TransmissionVolume(target) = &mut *target {
                target.attenuation_color = color;
                target.attenuation_distance = distance;
                target.thickness = thickness;
            }
        }
        let info = block
            .read()
            .unwrap()
            .thickness_texture
            .clone()
            .map(|info| info as GltfTextureInfoRef);
        let map = resolve_gltf_extension_texture(context, info.as_ref(), TextureColorSpace::Linear);
        let mut target = target.write().unwrap();
        if let PbrExtension::TransmissionVolume(target) = &mut *target {
            target.thickness_map = map;
        }
    }
}

fn resolve_transmission_volume(
    context: &Ref<GltfExtensionContext>,
    index: usize,
) -> Option<Ref<PbrExtension>> {
    let document = context.read().unwrap().document.clone();
    if let Some(existing) = find_gltf_pbr_extension(
        &document.read().unwrap(),
        index,
        TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
    ) {
        return Some(existing);
    }
    let created = Arc::new(RwLock::new(PbrExtension::TransmissionVolume(
        create_transmission_volume_pbr_extension(),
    )));
    if !attach_gltf_pbr_extension(&mut document.write().unwrap(), index, created.clone()) {
        return None;
    }
    return Some(created);
}
