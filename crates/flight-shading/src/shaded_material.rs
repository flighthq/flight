// flight-lint: allow-file(contract-vocabulary) D16 ShadedMaterial owns an ordered heterogeneous Ref<dyn Modifier> stack

use flight_entity::{Ref, allocate_entity};
use flight_materials::material3d::create_material3d;
use flight_materials::{
    BLEND_MODE_NORMAL, BlendMode, Material3DFields, MaterialAlphaMode, TextureSlot,
};

use crate::contract::Modifier;

pub const SHADED_MATERIAL_KIND: &str = "ShadedMaterial";

#[derive(Clone, Debug)]
/// A shaded 3D material (TS `ShadedMaterial`): a member of the open Material3D family, composing
/// `Material3DFields` and adding the Blinn-Phong inputs plus its ordered modifier stack.
pub struct ShadedMaterial {
    fields: Material3DFields,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub modifiers: Vec<Ref<dyn Modifier>>,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct ShadedMaterialOptions {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub modifiers: Option<Vec<Ref<dyn Modifier>>>,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: TextureSlot,
}

pub fn create_shaded_material(options: Option<&ShadedMaterialOptions>) -> ShadedMaterial {
    let mut out: ShadedMaterial = allocate_entity();
    let default_options = ShadedMaterialOptions::default();
    initialize_shaded_material(&mut out, options.unwrap_or(&default_options));
    return out;
}

pub fn initialize_shaded_material(out: &mut ShadedMaterial, options: &ShadedMaterialOptions) {
    out.kind = SHADED_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = options.alpha_cutoff.unwrap_or(0.5);
    out.alpha_mode = options.alpha_mode.unwrap_or(MaterialAlphaMode::Opaque);
    out.blend_mode = options
        .blend_mode
        .clone()
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    out.double_sided = options.double_sided.unwrap_or(false);
    out.diffuse = options.diffuse.unwrap_or(0xffff_ffff);
    out.diffuse_map = options.diffuse_map.clone();
    out.modifiers = options.modifiers.clone().unwrap_or_default();
    out.normal_map = options.normal_map.clone();
    out.normal_scale = options.normal_scale.unwrap_or(1.0);
    out.shininess = options.shininess.unwrap_or(32.0);
    out.specular = options.specular.unwrap_or(0xffff_ffff);
    out.specular_map = options.specular_map.clone();
    return;
}

impl Default for ShadedMaterial {
    fn default() -> Self {
        return Self {
            fields: create_material3d(SHADED_MATERIAL_KIND.to_string(), None),
            diffuse: 0xffff_ffff,
            diffuse_map: None,
            modifiers: Vec::new(),
            normal_map: None,
            normal_scale: 1.0,
            shininess: 32.0,
            specular: 0xffff_ffff,
            specular_map: None,
        };
    }
}

flight_materials::impl_material3d!(ShadedMaterial, custom_material);
