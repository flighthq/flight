use crate::{
    ExtendedPbrMaterial, ExtendedPbrMaterialOptions, PbrExtension, StandardPbrMaterial,
    extended_pbr_material::create_extended_pbr_material,
    pbr_materials::{create_standard_pbr_material, create_standard_pbr_material_properties},
    transmission_volume_pbr_extension::create_transmission_volume_pbr_extension,
};

pub fn create_aluminum_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xb0b0b0ff;
    m.metallic = 1.0;
    m.roughness = 0.35;
    return m;
}

pub fn create_carbon_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0x1a1a1aff;
    m.metallic = 0.0;
    m.roughness = 0.95;
    return m;
}

pub fn create_glass_extended_pbr_material() -> ExtendedPbrMaterial {
    let mut tv = create_transmission_volume_pbr_extension(None);
    tv.ior = 1.5;
    tv.transmission = 1.0;
    let mut std = create_standard_pbr_material_properties(None);
    std.base_color = 0xffffffff;
    std.metallic = 0.0;
    std.roughness = 0.0;
    let opts = ExtendedPbrMaterialOptions {
        extensions: Some(vec![PbrExtension::TransmissionVolume(tv)]),
        standard: Some(std),
        ..Default::default()
    };
    return create_extended_pbr_material(Some(&opts));
}

pub fn create_gold_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xffd700ff;
    m.metallic = 1.0;
    m.roughness = 0.25;
    return m;
}

pub fn create_iron_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0x444444ff;
    m.metallic = 1.0;
    m.roughness = 0.7;
    return m;
}

pub fn create_marble_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xf5f5f5ff;
    m.metallic = 0.0;
    m.roughness = 0.05;
    return m;
}

pub fn create_plastic_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xffffffff;
    m.metallic = 0.0;
    m.roughness = 0.05;
    return m;
}

pub fn create_rubber_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0x1c1c1cff;
    m.metallic = 0.0;
    m.roughness = 0.9;
    return m;
}

pub fn create_silver_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xc0c0c0ff;
    m.metallic = 1.0;
    m.roughness = 0.1;
    return m;
}

pub fn create_skin_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0xffcc99ff;
    m.metallic = 0.0;
    m.roughness = 0.4;
    return m;
}

pub fn create_wood_standard_pbr_material() -> StandardPbrMaterial {
    let mut m = create_standard_pbr_material(None);
    m.base_color = 0x8b5a2bff;
    m.metallic = 0.0;
    m.roughness = 0.8;
    return m;
}
