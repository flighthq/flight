use flight_entity::allocate_entity;

use crate::{
    DepthMaterial, EmissiveMaterial, MatcapMaterial, NormalMaterial,
    ToonMaterial, UnlitMaterial, VertexColorMaterial, WireframeMaterial,
    MaterialAlphaMode, BLEND_MODE_NORMAL,
    DEPTH_MATERIAL_KIND, EMISSIVE_MATERIAL_KIND, MATCAP_MATERIAL_KIND,
    NORMAL_MATERIAL_KIND, TOON_MATERIAL_KIND, UNLIT_MATERIAL_KIND,
    VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND,
};

pub fn create_depth_material() -> DepthMaterial {
    let mut m: DepthMaterial = allocate_entity();
    m.kind = DEPTH_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.far = 1.0;
    m.near = 0.0;
    return m;
}

pub fn create_emissive_material() -> EmissiveMaterial {
    let mut m: EmissiveMaterial = allocate_entity();
    m.kind = EMISSIVE_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.emissive = 0xffffffff;
    m.emissive_map = None;
    m.emissive_strength = 1.0;
    return m;
}

pub fn create_matcap_material() -> MatcapMaterial {
    let mut m: MatcapMaterial = allocate_entity();
    m.kind = MATCAP_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.matcap = None;
    m.tint = 0xffffffff;
    return m;
}

pub fn create_normal_material() -> NormalMaterial {
    let mut m: NormalMaterial = allocate_entity();
    m.kind = NORMAL_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.normal_map = None;
    m.normal_scale = 1.0;
    return m;
}

pub fn create_toon_material() -> ToonMaterial {
    let mut m: ToonMaterial = allocate_entity();
    m.kind = TOON_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.base_color = 0xffffffff;
    m.base_color_map = None;
    m.ramp = None;
    m.steps = 3;
    return m;
}

pub fn create_unlit_material() -> UnlitMaterial {
    let mut m: UnlitMaterial = allocate_entity();
    m.kind = UNLIT_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.base_color = 0xffffffff;
    m.base_color_map = None;
    return m;
}

pub fn create_vertex_color_material() -> VertexColorMaterial {
    let mut m: VertexColorMaterial = allocate_entity();
    m.kind = VERTEX_COLOR_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.tint = 0xffffffff;
    return m;
}

pub fn create_wireframe_material() -> WireframeMaterial {
    let mut m: WireframeMaterial = allocate_entity();
    m.kind = WIREFRAME_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.color = 0xffffffff;
    m.thickness = 1.0;
    return m;
}
