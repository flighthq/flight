use flight_entity::allocate_entity;

use crate::{
    DepthMaterial, DepthMaterialOptions, EmissiveMaterial, EmissiveMaterialOptions,
    MatcapMaterial, MatcapMaterialOptions, NormalMaterial, NormalMaterialOptions,
    ToonMaterial, ToonMaterialOptions, UnlitMaterial, UnlitMaterialOptions,
    VertexColorMaterial, VertexColorMaterialOptions, WireframeMaterial, WireframeMaterialOptions,
    MaterialAlphaMode, BLEND_MODE_NORMAL,
    DEPTH_MATERIAL_KIND, EMISSIVE_MATERIAL_KIND, MATCAP_MATERIAL_KIND,
    NORMAL_MATERIAL_KIND, TOON_MATERIAL_KIND, UNLIT_MATERIAL_KIND,
    VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND,
};

pub fn create_depth_material(opts: Option<&DepthMaterialOptions>) -> DepthMaterial {
    let mut m: DepthMaterial = allocate_entity();
    m.kind = DEPTH_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.far = opts.and_then(|o| o.far).unwrap_or(1.0);
    m.near = opts.and_then(|o| o.near).unwrap_or(0.0);
    return m;
}

pub fn create_emissive_material(opts: Option<&EmissiveMaterialOptions>) -> EmissiveMaterial {
    let mut m: EmissiveMaterial = allocate_entity();
    m.kind = EMISSIVE_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.emissive = opts.and_then(|o| o.emissive).unwrap_or(0xffffffff);
    m.emissive_map = opts.and_then(|o| o.emissive_map.clone());
    m.emissive_strength = opts.and_then(|o| o.emissive_strength).unwrap_or(1.0);
    return m;
}

pub fn create_matcap_material(opts: Option<&MatcapMaterialOptions>) -> MatcapMaterial {
    let mut m: MatcapMaterial = allocate_entity();
    m.kind = MATCAP_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.matcap = opts.and_then(|o| o.matcap.clone());
    m.tint = opts.and_then(|o| o.tint).unwrap_or(0xffffffff);
    return m;
}

pub fn create_normal_material(opts: Option<&NormalMaterialOptions>) -> NormalMaterial {
    let mut m: NormalMaterial = allocate_entity();
    m.kind = NORMAL_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.normal_map = opts.and_then(|o| o.normal_map.clone());
    m.normal_scale = opts.and_then(|o| o.normal_scale).unwrap_or(1.0);
    return m;
}

pub fn create_toon_material(opts: Option<&ToonMaterialOptions>) -> ToonMaterial {
    let mut m: ToonMaterial = allocate_entity();
    m.kind = TOON_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.base_color = opts.and_then(|o| o.base_color).unwrap_or(0xffffffff);
    m.base_color_map = opts.and_then(|o| o.base_color_map.clone());
    m.ramp = opts.and_then(|o| o.ramp.clone());
    m.steps = opts.and_then(|o| o.steps).unwrap_or(3);
    return m;
}

pub fn create_unlit_material(opts: Option<&UnlitMaterialOptions>) -> UnlitMaterial {
    let mut m: UnlitMaterial = allocate_entity();
    m.kind = UNLIT_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.base_color = opts.and_then(|o| o.base_color).unwrap_or(0xffffffff);
    m.base_color_map = opts.and_then(|o| o.base_color_map.clone());
    return m;
}

pub fn create_vertex_color_material(opts: Option<&VertexColorMaterialOptions>) -> VertexColorMaterial {
    let mut m: VertexColorMaterial = allocate_entity();
    m.kind = VERTEX_COLOR_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.tint = opts.and_then(|o| o.tint).unwrap_or(0xffffffff);
    return m;
}

pub fn create_wireframe_material(opts: Option<&WireframeMaterialOptions>) -> WireframeMaterial {
    let mut m: WireframeMaterial = allocate_entity();
    m.kind = WIREFRAME_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = opts.and_then(|o| o.alpha_cutoff).unwrap_or(0.5);
    m.alpha_mode = opts.and_then(|o| o.alpha_mode).unwrap_or(MaterialAlphaMode::Opaque);
    m.blend_mode = opts
        .and_then(|o| o.blend_mode.clone())
        .unwrap_or_else(|| BLEND_MODE_NORMAL.to_string());
    m.double_sided = opts.and_then(|o| o.double_sided).unwrap_or(false);
    m.color = opts.and_then(|o| o.color).unwrap_or(0xffffffff);
    m.thickness = opts.and_then(|o| o.thickness).unwrap_or(1.0);
    return m;
}
