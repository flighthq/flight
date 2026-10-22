use std::sync::{Arc, RwLock};

use crate::{
    ExtendedPbrMaterial, ExtendedPbrMaterialOptions, GlassExtendedPbrMaterialOptions,
    PbrExtension, StandardPbrMaterial, StandardPbrMaterialOptions,
    extended_pbr_material::create_extended_pbr_material,
    pbr_materials::{create_standard_pbr_material, create_standard_pbr_material_properties},
    transmission_volume_pbr_extension::create_transmission_volume_pbr_extension,
};

pub fn create_aluminum_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xb0b0b0ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 1.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.35; }
    return m;
}

pub fn create_carbon_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0x1a1a1aff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.95; }
    return m;
}

pub fn create_glass_extended_pbr_material(opts: Option<&GlassExtendedPbrMaterialOptions>) -> ExtendedPbrMaterial {
    let tv_opts = opts.and_then(|o| o.transmission_volume.as_ref());
    let mut tv = create_transmission_volume_pbr_extension(tv_opts);
    if tv_opts.and_then(|o| o.ior).is_none() { tv.ior = 1.5; }
    if tv_opts.and_then(|o| o.transmission).is_none() { tv.transmission = 1.0; }

    let std_opts = opts.and_then(|o| o.standard.as_ref());
    let mut std = create_standard_pbr_material_properties(std_opts);
    if std_opts.and_then(|o| o.base_color).is_none() { std.base_color = 0xffffffff; }
    if std_opts.and_then(|o| o.metallic).is_none() { std.metallic = 0.0; }
    if std_opts.and_then(|o| o.roughness).is_none() { std.roughness = 0.0; }

    let ext_opts = ExtendedPbrMaterialOptions {
        name: None,
        alpha_cutoff: opts.and_then(|o| o.alpha_cutoff),
        alpha_mode: opts.and_then(|o| o.alpha_mode),
        blend_mode: opts.and_then(|o| o.blend_mode.clone()),
        double_sided: opts.and_then(|o| o.double_sided),
        extensions: Some(vec![Arc::new(RwLock::new(PbrExtension::TransmissionVolume(tv)))]),
        standard: Some(std),
    };
    return create_extended_pbr_material(Some(&ext_opts));
}

pub fn create_gold_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xffd700ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 1.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.25; }
    return m;
}

pub fn create_iron_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0x444444ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 1.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.7; }
    return m;
}

pub fn create_marble_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xf5f5f5ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.05; }
    return m;
}

pub fn create_plastic_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xffffffff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.05; }
    return m;
}

pub fn create_rubber_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0x1c1c1cff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.9; }
    return m;
}

pub fn create_silver_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xc0c0c0ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 1.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.1; }
    return m;
}

pub fn create_skin_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0xffcc99ff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.4; }
    return m;
}

pub fn create_wood_standard_pbr_material(opts: Option<&StandardPbrMaterialOptions>) -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(opts);
    if opts.and_then(|o| o.base_color).is_none() { m.base_color = 0x8b5a2bff; }
    if opts.and_then(|o| o.metallic).is_none() { m.metallic = 0.0; }
    if opts.and_then(|o| o.roughness).is_none() { m.roughness = 0.8; }
    return m;
}
