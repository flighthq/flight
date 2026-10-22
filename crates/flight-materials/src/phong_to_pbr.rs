use flight_color::get_color_luminance;

use crate::{
    MaterialConversionContext, PhongMaterial, StandardPbrMaterial, StandardPbrMaterialOptions,
    explain_material_conversion::explain_phong_conversion,
    pbr_materials::{
        apply_standard_pbr_material_options, create_standard_pbr_material,
        report_material_conversion_drop,
    },
};

// flight-lint: allow(conform-params) D5: Rust passes caller-owned conversion context; TS uses module-scoped guard
pub fn convert_phong_to_standard_pbr_material(
    phong: &PhongMaterial,
    opts: Option<&StandardPbrMaterialOptions>,
    ctx: Option<&MaterialConversionContext>,
) -> StandardPbrMaterial {
    if phong.specular_map.is_some() {
        report_material_conversion_drop(
            ctx,
            &explain_phong_conversion(phong),
            "convert_phong_to_standard_pbr_material",
        );
    }
    let mut m = create_standard_pbr_material();
    apply_standard_pbr_material_options(&mut m, opts);
    m.base_color = phong.diffuse;
    m.base_color_map = phong.diffuse_map.clone();
    m.metallic = get_pbr_metallic_from_phong_specular(phong.specular, phong.diffuse);
    m.normal_map = phong.normal_map.clone();
    m.normal_scale = phong.normal_scale;
    m.roughness = get_pbr_roughness_from_phong_shininess(phong.shininess);
    return m;
}

pub fn get_pbr_metallic_from_phong_specular(specular: u32, diffuse: u32) -> f32 {
    return if get_color_luminance(specular) > 0.5 && get_color_luminance(diffuse) < 0.04 {
        1.0
    } else {
        0.0
    };
}

pub fn get_pbr_roughness_from_phong_shininess(shininess: f32) -> f32 {
    return (2.0 / (shininess.max(0.0) + 2.0)).sqrt().clamp(0.0, 1.0);
}

pub fn get_phong_to_pbr_light_exposure() -> f32 {
    return std::f32::consts::PI.log2();
}
