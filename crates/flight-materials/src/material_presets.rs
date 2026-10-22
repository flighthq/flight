use std::sync::{Arc, RwLock};

use crate::{
    ExtendedPbrMaterial, GlassExtendedPbrMaterialOptions, PbrExtension, StandardPbrMaterial,
    StandardPbrMaterialOptions, TransmissionVolumePbrExtension,
    TransmissionVolumePbrExtensionOptions,
    extended_pbr_material::create_extended_pbr_material,
    pbr_materials::{
        apply_standard_pbr_material_options, create_standard_pbr_material,
        create_standard_pbr_material_properties,
    },
    transmission_volume_pbr_extension::create_transmission_volume_pbr_extension,
};

pub fn create_aluminum_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xb0b0b0ff;
    m.metallic = 1.0;
    m.roughness = 0.35;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_carbon_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0x1a1a1aff;
    m.metallic = 0.0;
    m.roughness = 0.95;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_glass_extended_pbr_material(opts: Option<&GlassExtendedPbrMaterialOptions>) -> ExtendedPbrMaterial {
    let mut tv = create_transmission_volume_pbr_extension();
    tv.ior = 1.5;
    tv.transmission = 1.0;
    apply_transmission_volume_pbr_extension_options(
        &mut tv,
        opts.and_then(|o| o.transmission_volume.as_ref()),
    );

    let std_opts = opts.and_then(|o| o.standard.as_ref());
    let mut std = create_standard_pbr_material_properties(std_opts);
    if std_opts.and_then(|o| o.base_color).is_none() { std.base_color = 0xffffffff; }
    if std_opts.and_then(|o| o.metallic).is_none() { std.metallic = 0.0; }
    if std_opts.and_then(|o| o.roughness).is_none() { std.roughness = 0.0; }

    let mut m = create_extended_pbr_material();
    if let Some(o) = opts {
        if let Some(value) = o.alpha_cutoff { m.alpha_cutoff = value; }
        if let Some(value) = o.alpha_mode { m.alpha_mode = value; }
        if let Some(value) = &o.blend_mode { m.blend_mode = value.clone(); }
        if let Some(value) = o.double_sided { m.double_sided = value; }
    }
    m.extensions = vec![Arc::new(RwLock::new(PbrExtension::TransmissionVolume(tv)))];
    m.standard = std;
    return m;
}

pub fn create_gold_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xffd700ff;
    m.metallic = 1.0;
    m.roughness = 0.25;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_iron_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0x444444ff;
    m.metallic = 1.0;
    m.roughness = 0.7;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_marble_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xf5f5f5ff;
    m.metallic = 0.0;
    m.roughness = 0.05;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_plastic_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xffffffff;
    m.metallic = 0.0;
    m.roughness = 0.05;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_rubber_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0x1c1c1cff;
    m.metallic = 0.0;
    m.roughness = 0.9;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_silver_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xc0c0c0ff;
    m.metallic = 1.0;
    m.roughness = 0.1;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_skin_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0xffcc99ff;
    m.metallic = 0.0;
    m.roughness = 0.4;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

pub fn create_wood_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material();
    m.base_color = 0x8b5a2bff;
    m.metallic = 0.0;
    m.roughness = 0.8;
    apply_standard_pbr_material_options(&mut m, opts);
    return m;
}

fn apply_transmission_volume_pbr_extension_options(
    out: &mut TransmissionVolumePbrExtension,
    opts: Option<&TransmissionVolumePbrExtensionOptions>,
) {
    let Some(o) = opts else {
        return;
    };
    if let Some(value) = o.attenuation_color { out.attenuation_color = value; }
    if let Some(value) = o.attenuation_distance { out.attenuation_distance = value; }
    if let Some(value) = o.ior { out.ior = value; }
    if let Some(value) = o.thickness { out.thickness = value; }
    if o.thickness_map.is_some() { out.thickness_map = o.thickness_map.clone(); }
    if let Some(value) = o.thickness_map_uv_set { out.thickness_map_uv_set = value; }
    if let Some(value) = o.transmission { out.transmission = value; }
    if o.transmission_map.is_some() { out.transmission_map = o.transmission_map.clone(); }
    if let Some(value) = o.transmission_map_uv_set { out.transmission_map_uv_set = value; }
}
