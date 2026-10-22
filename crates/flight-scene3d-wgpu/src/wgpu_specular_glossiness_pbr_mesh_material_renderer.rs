// flight-lint: allow-file(contract-vocabulary) D17: the renderer seams take the open Material family
//! The built-in SpecularGlossiness forward-lit renderer (TS
//! `wgpuSpecularGlossinessPbrMeshMaterialRenderer.ts`): the legacy spec-gloss workflow converted on
//! the CPU at bind time (Khronos reference conversion) into a StandardPbr block that drives the same
//! base PBR program with no extension flag.

use std::sync::LazyLock;

use flight_camera::Camera3D;
use flight_color::{LinearColor, allocate_linear_color, unpack_color_to_linear};
use flight_entity::Ref;
use flight_lighting::Scene3DLightBlock;
use flight_materials::{
    Material, Material3D, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, SpecularGlossinessPbrMaterial,
    StandardPbrMaterialProperties,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_wgpu::{
    WgpuMeshMaterialRenderer, WgpuRenderState, get_wgpu_render_state_runtime,
    register_wgpu_bitmap_texture_resolver, register_wgpu_image_texture_resolver,
    set_wgpu_render_pass_bind_group,
};

use crate::wgpu_mesh_material_registry::register_wgpu_mesh_material_renderer;
use crate::wgpu_mesh_pipeline::{
    begin_wgpu_mesh_draw, draw_wgpu_mesh_subset, write_wgpu_frame_uniform,
};
use crate::wgpu_pbr_pipeline_cache::ensure_wgpu_pbr_pipeline;
use crate::wgpu_standard_pbr_mesh_material_renderer::{
    build_wgpu_pbr_standard_define_key, ensure_wgpu_pbr_material_bind_group,
    get_wgpu_pbr_material_scratch, write_wgpu_pbr_material_uniform, write_wgpu_pbr_standard_block,
};

/// The built-in SpecularGlossiness renderer (TS `wgpuSpecularGlossinessPbrMeshMaterialRenderer`).
pub static WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER: WgpuMeshMaterialRenderer =
    WgpuMeshMaterialRenderer {
        bind: bind_wgpu_specular_glossiness_pbr_material,
        draw: draw_wgpu_specular_glossiness_pbr_subset,
    };

const DIELECTRIC_SPECULAR: f32 = 0.04;

// The identity the material-less fallback bind caches its binding under (TS: a module-level `{}`
// object). A real entity, so its key is a numeric entity id (D12/D15): unique to this renderer and
// never reused, so it cannot alias a material's binding or another renderer's fallback.
static FALLBACK_MATERIAL: LazyLock<SpecularGlossinessPbrMaterial> =
    LazyLock::new(flight_materials::contract::create_specular_glossiness_pbr_material);

fn bind_wgpu_specular_glossiness_pbr_material(
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
    let spec_gloss = material.and_then(|material| {
        material
            .as_any()
            .downcast_ref::<SpecularGlossinessPbrMaterial>()
    });
    let standard = spec_gloss.map(convert_specular_glossiness_to_standard);
    let key = build_wgpu_pbr_standard_define_key(
        standard.as_ref(),
        spec_gloss.map(|material| material as &dyn Material3D),
    );
    let pipeline = ensure_wgpu_pbr_pipeline(state, &key, format);

    write_wgpu_frame_uniform(state, camera, lights);
    let cache_key = match spec_gloss {
        Some(material) => flight_entity::get_entity_id(material),
        None => flight_entity::get_entity_id(&*FALLBACK_MATERIAL),
    };
    let binding =
        ensure_wgpu_pbr_material_bind_group(state, &pipeline, cache_key, standard.as_ref());
    let alpha_cutoff = spec_gloss.map_or(0.5, |material| material.material3d_fields().alpha_cutoff);
    let out = get_wgpu_pbr_material_scratch(state);
    write_wgpu_pbr_standard_block(out, standard.as_ref(), alpha_cutoff);
    out[16..].fill(0.0);
    write_wgpu_pbr_material_uniform(state, &binding);

    begin_wgpu_mesh_draw(state, &pipeline);
    set_wgpu_render_pass_bind_group(state, 2, &binding.bind_group, &[]);
}

// Builds a StandardPbr block from a spec-gloss material via the Khronos reference conversion:
// roughness = 1 - glossiness, metallic from the quadratic solver, and base color blended from the
// dielectric diffuse estimate toward the specular tint by metallic, re-packed to RGBA8 so the
// standard block's decode round-trips.
fn convert_specular_glossiness_to_standard(
    material: &SpecularGlossinessPbrMaterial,
) -> StandardPbrMaterialProperties {
    let mut diffuse = allocate_linear_color();
    let mut specular = allocate_linear_color();
    unpack_color_to_linear(&mut diffuse, material.diffuse);
    unpack_color_to_linear(&mut specular, material.specular);

    let specular_brightness = max_rgb(&specular);
    let one_minus_specular_strength = 1.0 - specular_brightness;
    let diffuse_brightness = max_rgb(&diffuse);
    let metallic = solve_metallic(
        diffuse_brightness,
        specular_brightness,
        one_minus_specular_strength,
    );

    let denom = (1.0 - DIELECTRIC_SPECULAR).max(1e-4);
    let r = lerp(
        diffuse.r * one_minus_specular_strength / denom,
        specular.r,
        metallic,
    );
    let g = lerp(
        diffuse.g * one_minus_specular_strength / denom,
        specular.g,
        metallic,
    );
    let b = lerp(
        diffuse.b * one_minus_specular_strength / denom,
        specular.b,
        metallic,
    );

    return StandardPbrMaterialProperties {
        alpha_map: None,
        base_color: pack_linear_rgba(r, g, b, diffuse.a),
        base_color_map: material.diffuse_map.clone(),
        emissive: material.emissive,
        emissive_map: material.emissive_map.clone(),
        emissive_strength: material.emissive_strength,
        metallic,
        metallic_roughness_map: None,
        normal_map: material.normal_map.clone(),
        normal_scale: material.normal_scale,
        occlusion_map: material.occlusion_map.clone(),
        occlusion_strength: material.occlusion_strength,
        roughness: 1.0 - material.glossiness,
    };
}

fn draw_wgpu_specular_glossiness_pbr_subset(
    state: &mut WgpuRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    draw_wgpu_mesh_subset(state, proxy, geometry);
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

fn max_rgb(color: &LinearColor) -> f32 {
    return color.r.max(color.g).max(color.b);
}

// Re-encodes a linear RGBA color back to a packed 0xRRGGBBAA with the sRGB transfer (the inverse of
// unpack_color_to_linear).
fn pack_linear_rgba(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let to_byte = |linear: f32| -> u32 {
        let clamped = linear.clamp(0.0, 1.0);
        let srgb = if clamped <= 0.0031308 {
            clamped * 12.92
        } else {
            1.055 * clamped.powf(1.0 / 2.4) - 0.055
        };
        return ((srgb * 255.0).round() as u32) & 0xff;
    };
    let alpha = ((a.clamp(0.0, 1.0) * 255.0).round() as u32) & 0xff;
    return (to_byte(r) << 24) | (to_byte(g) << 16) | (to_byte(b) << 8) | alpha;
}

/// Installs the SpecularGlossiness renderer for its kind, with the bitmap and image texture
/// resolvers (TS `registerWgpuSpecularGlossinessPbrMaterial`).
pub fn register_wgpu_specular_glossiness_pbr_material(state: &mut WgpuRenderState) {
    register_wgpu_bitmap_texture_resolver(state);
    register_wgpu_image_texture_resolver(state);
    register_wgpu_mesh_material_renderer(
        state,
        SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
        &WGPU_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER,
    );
}

// The Khronos spec-gloss to metallic solver; below the 0.04 dielectric floor the surface is fully
// dielectric.
fn solve_metallic(diffuse: f32, specular: f32, one_minus_specular_strength: f32) -> f32 {
    if specular < DIELECTRIC_SPECULAR {
        return 0.0;
    }
    let a = DIELECTRIC_SPECULAR;
    let b = diffuse * one_minus_specular_strength / (1.0 - DIELECTRIC_SPECULAR) + specular
        - 2.0 * DIELECTRIC_SPECULAR;
    let c = DIELECTRIC_SPECULAR - specular;
    let discriminant = (b * b - 4.0 * a * c).max(0.0);
    return ((-b + discriminant.sqrt()) / (2.0 * a)).clamp(0.0, 1.0);
}
