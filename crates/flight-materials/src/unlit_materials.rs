use flight_entity::allocate_entity;

use crate::{
    DepthMaterial, EmissiveMaterial, MatcapMaterial, NormalMaterial, ToonMaterial, UnlitMaterial, VertexColorMaterial, WireframeMaterial, MaterialAlphaMode, BLEND_MODE_NORMAL,
    DEPTH_MATERIAL_KIND, EMISSIVE_MATERIAL_KIND, MATCAP_MATERIAL_KIND,
    NORMAL_MATERIAL_KIND, TOON_MATERIAL_KIND, UNLIT_MATERIAL_KIND,
    VERTEX_COLOR_MATERIAL_KIND, WIREFRAME_MATERIAL_KIND,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_depth_material() -> DepthMaterial {
    let mut out: DepthMaterial = allocate_entity();
    initialize_depth_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_emissive_material() -> EmissiveMaterial {
    let mut out: EmissiveMaterial = allocate_entity();
    initialize_emissive_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_matcap_material() -> MatcapMaterial {
    let mut out: MatcapMaterial = allocate_entity();
    initialize_matcap_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_normal_material() -> NormalMaterial {
    let mut out: NormalMaterial = allocate_entity();
    initialize_normal_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_toon_material() -> ToonMaterial {
    let mut out: ToonMaterial = allocate_entity();
    initialize_toon_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_unlit_material() -> UnlitMaterial {
    let mut out: UnlitMaterial = allocate_entity();
    initialize_unlit_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_vertex_color_material() -> VertexColorMaterial {
    let mut out: VertexColorMaterial = allocate_entity();
    initialize_vertex_color_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_wireframe_material() -> WireframeMaterial {
    let mut out: WireframeMaterial = allocate_entity();
    initialize_wireframe_material(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_depth_material(out: &mut DepthMaterial) {
    out.kind = DEPTH_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.far = 1.0;
    out.near = 0.0;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_emissive_material(out: &mut EmissiveMaterial) {
    out.kind = EMISSIVE_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.emissive = 0xffffffff;
    out.emissive_map = None;
    out.emissive_strength = 1.0;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_matcap_material(out: &mut MatcapMaterial) {
    out.kind = MATCAP_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.matcap = None;
    out.tint = 0xffffffff;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_normal_material(out: &mut NormalMaterial) {
    out.kind = NORMAL_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.normal_map = None;
    out.normal_scale = 1.0;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_toon_material(out: &mut ToonMaterial) {
    out.kind = TOON_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.base_color = 0xffffffff;
    out.base_color_map = None;
    out.ramp = None;
    out.steps = 3;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_unlit_material(out: &mut UnlitMaterial) {
    out.kind = UNLIT_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.base_color = 0xffffffff;
    out.base_color_map = None;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_vertex_color_material(out: &mut VertexColorMaterial) {
    out.kind = VERTEX_COLOR_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.tint = 0xffffffff;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_wireframe_material(out: &mut WireframeMaterial) {
    out.kind = WIREFRAME_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.color = 0xffffffff;
    out.thickness = 1.0;
}
