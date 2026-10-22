// flight-lint: allow-file(contract-vocabulary) D17: the PBR bind seams take native wgpu pipelines and the open Material3D family
//! The built-in StandardPbr forward-lit mesh-material renderer (TS
//! `wgpuStandardPbrMeshMaterialRenderer.ts`) and the shared standard-block helpers every PBR
//! extension renderer routes through.

use std::sync::LazyLock;

use flight_entity::Ref;
use std::sync::RwLockReadGuard;

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{
    Material, Material3D, MaterialAlphaMode, StandardPbrMaterial, StandardPbrMaterialProperties,
    TextureSlot,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_native_device,
    get_wgpu_render_state_runtime, set_wgpu_render_pass_bind_group, write_wgpu_buffer,
};
use flight_texture::Texture;

use crate::types::*;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, ensure_wgpu_per_map_material_binding,
    get_wgpu_material_sampler, is_wgpu_texture_ready, resolve_wgpu_material_texture_view,
    stash_wgpu_uv_transform, write_wgpu_frame_uniform,
};
use crate::wgpu_pbr_pipeline_cache::ensure_wgpu_pbr_pipeline;
use crate::wgpu_scene3d_runtime::get_wgpu_scene3d_runtime;

/// The MaterialBlock float count: 48 floats / 192 bytes (TS `WGPU_PBR_MATERIAL_UNIFORM_FLOATS`).
pub const WGPU_PBR_MATERIAL_UNIFORM_FLOATS: usize = 48;

/// The built-in StandardPbr forward-lit renderer (TS `wgpuStandardPbrMeshMaterialRenderer`): bind
/// selects the pipeline variant for the material's alpha mode, sidedness, maps and the current color
/// format, writes the Frame uniform, binds the pipeline and Frame group, then writes and binds the
/// material group at group(2); draw runs the shared per-draw tail.
pub static WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_wgpu_standard_pbr_material,
        draw: draw_wgpu_standard_pbr_subset,
    };

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<StandardPbrMaterial> = LazyLock::new(flight_materials::contract::create_standard_pbr_material);

fn bind_wgpu_standard_pbr_material(
    state: &mut WgpuRenderState,
    material: Option<&dyn Material>,
    lights: &Ref<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let runtime = get_wgpu_render_state_runtime(state);
    if runtime.render_pass.is_none() {
        return;
    }
    let format = runtime.current_color_format.unwrap_or(state.format);
    let pbr = material.and_then(|material| material.as_any().downcast_ref::<StandardPbrMaterial>());
    let standard = pbr.map(get_standard_pbr_material_properties);
    let surface = pbr.map(|pbr| pbr as &dyn Material3D);
    let pipeline = ensure_wgpu_pbr_pipeline(
        state,
        &build_wgpu_pbr_standard_define_key(standard.as_ref(), surface),
        format,
    );

    write_wgpu_frame_uniform(state, camera, lights);
    let key = match pbr {
        Some(pbr) => flight_entity::get_entity_id(pbr),
        None => flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
    };
    let binding = ensure_wgpu_pbr_material_bind_group(state, &pipeline, key, standard.as_ref());
    let alpha_cutoff = pbr.map_or(0.5, |pbr| pbr.material3d_fields().alpha_cutoff);
    let scratch = get_wgpu_pbr_material_scratch(state);
    write_wgpu_pbr_standard_block(scratch, standard.as_ref(), alpha_cutoff);
    scratch[16..].fill(0.0);
    write_wgpu_pbr_material_uniform(state, &binding);

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &binding.bind_group, &[]);
}

/// The shared define key for a PBR material (TS `buildWgpuPbrStandardDefineKey`): the alpha-mask and
/// sidedness from the surface, the standard map flags from the bound maps, every extension flag off.
pub fn build_wgpu_pbr_standard_define_key(
    standard: Option<&StandardPbrMaterialProperties>,
    surface: Option<&dyn Material3D>,
) -> WgpuPbrDefineKey {
    let surface = surface.map(|surface| surface.material3d_fields());
    let ready = |slot: Option<&TextureSlot>| -> bool {
        let guard = slot.and_then(read_texture_slot);
        return is_wgpu_texture_ready(guard.as_deref());
    };
    return WgpuPbrDefineKey {
        alpha_mask_enabled: surface.is_some_and(|surface| surface.alpha_mode == MaterialAlphaMode::Mask),
        anisotropy_enabled: false,
        clearcoat_enabled: false,
        double_sided: surface.is_some_and(|surface| surface.double_sided),
        // Opaque materials ignore coverage: only 'mask' and 'blend' sample the alpha map.
        has_alpha_map: surface.is_some_and(|surface| surface.alpha_mode != MaterialAlphaMode::Opaque)
            && ready(standard.map(|standard| &standard.alpha_map)),
        has_base_color_map: ready(standard.map(|standard| &standard.base_color_map)),
        has_color_adjustment: None,
        has_color_matrix: None,
        has_emissive_map: ready(standard.map(|standard| &standard.emissive_map)),
        has_metallic_roughness_map: ready(standard.map(|standard| &standard.metallic_roughness_map)),
        has_normal_map: ready(standard.map(|standard| &standard.normal_map)),
        has_occlusion_map: ready(standard.map(|standard| &standard.occlusion_map)),
        iridescence_enabled: false,
        sheen_enabled: false,
        specular_enabled: false,
        subsurface_enabled: false,
        transmission_enabled: false,
    };
}

fn draw_wgpu_standard_pbr_subset(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

/// Resolves the material's six standard-map samplers and views and returns its cached per-map binding
/// under `key`, rebuilding the bind group only when one differs; stashes the base-color map's uv
/// transform (TS `ensureWgpuPbrMaterialBindGroup`). The caller writes the MaterialBlock afterwards.
pub fn ensure_wgpu_pbr_material_bind_group(
    state: &mut WgpuRenderState,
    pipeline: &WgpuPbrPipeline,
    key: u64,
    standard: Option<&StandardPbrMaterialProperties>,
) -> WgpuMaterialBinding {
    let slots: [Option<&TextureSlot>; 6] = [
        standard.map(|standard| &standard.base_color_map),
        standard.map(|standard| &standard.metallic_roughness_map),
        standard.map(|standard| &standard.normal_map),
        standard.map(|standard| &standard.occlusion_map),
        standard.map(|standard| &standard.emissive_map),
        standard.map(|standard| &standard.alpha_map),
    ];
    let mut samplers = Vec::with_capacity(6);
    let mut views = Vec::with_capacity(6);
    for slot in slots {
        let guard = slot.and_then(read_texture_slot);
        samplers.push(get_wgpu_material_sampler(state, guard.as_deref()));
        views.push(resolve_wgpu_material_texture_view(state, guard.as_deref()));
    }
    let binding = ensure_wgpu_per_map_material_binding(
        state,
        key,
        &pipeline.material_bind_group_layout,
        (WGPU_PBR_MATERIAL_UNIFORM_FLOATS * 4) as u64,
        &samplers,
        &views,
    );
    // The base-color map's uv transform drives the shared uv every standard map samples.
    let base_color = slots[0].and_then(read_texture_slot);
    stash_wgpu_uv_transform(state, base_color.as_deref());
    return binding;
}

// A StandardPbrMaterial is itself a StandardPbrMaterialProperties in the source; Rust flattens the
// fields onto the material, so the block is read off it.
fn get_standard_pbr_material_properties(material: &StandardPbrMaterial) -> StandardPbrMaterialProperties {
    return StandardPbrMaterialProperties {
        alpha_map: material.alpha_map.clone(),
        base_color: material.base_color,
        base_color_map: material.base_color_map.clone(),
        emissive: material.emissive,
        emissive_map: material.emissive_map.clone(),
        emissive_strength: material.emissive_strength,
        metallic: material.metallic,
        metallic_roughness_map: material.metallic_roughness_map.clone(),
        normal_map: material.normal_map.clone(),
        normal_scale: material.normal_scale,
        occlusion_map: material.occlusion_map.clone(),
        occlusion_strength: material.occlusion_strength,
        roughness: material.roughness,
    };
}

/// The shared MaterialBlock scratch the standard and extension packers write into (TS
/// `getWgpuPbrMaterialScratch`), held on the state's scene runtime.
// flight-lint: allow(conform-params) D5: the source's module-level scratch is state-owned, so the accessor takes the state
pub fn get_wgpu_pbr_material_scratch(state: &mut WgpuRenderState) -> &mut [f32; 48] {
    return &mut get_wgpu_scene3d_runtime(state).pbr_material_scratch;
}

pub(crate) fn read_texture_slot(slot: &TextureSlot) -> Option<RwLockReadGuard<'_, Texture>> {
    return slot.as_ref().map(|texture| texture.read().unwrap());
}

/// Uploads the MaterialBlock scratch into a material binding's uniform buffer (TS
/// `writeWgpuPbrMaterialUniform`).
pub fn write_wgpu_pbr_material_uniform(state: &mut WgpuRenderState, binding: &WgpuMaterialBinding) {
    let native = get_wgpu_render_state_native_device(state);
    let scratch = *get_wgpu_pbr_material_scratch(state);
    write_wgpu_buffer(&native, &binding.buffer, 0, bytemuck::cast_slice(&scratch));
}

/// Packs the StandardPbr base block (the first 16 MaterialBlock floats) into `out`: linear base
/// color, emissive times strength, (metallic, roughness, normalScale, occlusionStrength) and the
/// alpha cutoff; a missing block uses neutral defaults (TS `writeWgpuPbrStandardBlock`).
pub fn write_wgpu_pbr_standard_block(
    out: &mut [f32],
    standard: Option<&StandardPbrMaterialProperties>,
    alpha_cutoff: f32,
) {
    let Some(standard) = standard else {
        out[..16].copy_from_slice(&[
            1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, alpha_cutoff, 0.0, 0.0, 0.0,
        ]);
        return;
    };
    let mut color = allocate_linear_color();
    unpack_color_to_linear(&mut color, standard.base_color);
    out[0] = color.r;
    out[1] = color.g;
    out[2] = color.b;
    out[3] = color.a;

    unpack_color_to_linear(&mut color, standard.emissive);
    let strength = standard.emissive_strength;
    out[4] = color.r * strength;
    out[5] = color.g * strength;
    out[6] = color.b * strength;
    out[7] = 0.0;

    out[8] = standard.metallic;
    out[9] = standard.roughness;
    out[10] = standard.normal_scale;
    out[11] = standard.occlusion_strength;

    out[12] = alpha_cutoff;
    out[13] = 0.0;
    out[14] = 0.0;
    out[15] = 0.0;
}
