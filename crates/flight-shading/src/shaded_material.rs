// flight-lint: allow-file(contract-vocabulary) D16 ShadedMaterial owns an ordered heterogeneous Ref<dyn Modifier> stack

use flight_entity::{Ref, allocate_entity};
use flight_materials::material3d::{create_material3d, initialize_material3d};
use flight_materials::{BlendMode, Material3DFields, MaterialAlphaMode, TextureSlot};

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

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): callers assign authored material fields after construction
pub fn create_shaded_material() -> ShadedMaterial {
    let mut out: ShadedMaterial = allocate_entity();
    initialize_shaded_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principalc0f9227c D23 (B): initialization restores canonical defaults before authored assignment
pub fn initialize_shaded_material(out: &mut ShadedMaterial) {
    initialize_material3d(&mut out.fields, SHADED_MATERIAL_KIND.to_string());
    out.diffuse = 0xffff_ffff;
    out.diffuse_map = None;
    out.modifiers.clear();
    out.normal_map = None;
    out.normal_scale = 1.0;
    out.shininess = 32.0;
    out.specular = 0xffff_ffff;
    out.specular_map = None;
    return;
}

impl Default for ShadedMaterial {
    fn default() -> Self {
        return Self {
            fields: create_material3d(SHADED_MATERIAL_KIND.to_string()),
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
