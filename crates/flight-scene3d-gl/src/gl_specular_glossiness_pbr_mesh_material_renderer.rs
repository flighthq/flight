// flight-lint: allow-file(contract-vocabulary) D17 mesh-material renderers are backend-typed dispatch records over thread-bound render-gl state

use flight_camera::Camera3D;
use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_lighting::Scene3DLightBlock;
use flight_materials::{
    Material3D, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, SpecularGlossinessPbrMaterial,
    StandardPbrMaterialProperties,
};
use flight_meshgeometry::MeshGeometry;
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{GlMeshMaterialRenderer, GlRenderState};
use glow::HasContext;
use std::rc::Rc;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_mesh_material_registry::register_gl_mesh_material_renderer;
use crate::gl_mesh_program::{
    begin_gl_mesh_draw, draw_gl_mesh_subset, set_gl_mesh_camera_position,
    set_gl_mesh_view_projection,
};
use crate::gl_pbr_program_cache::ensure_gl_pbr_program;
use crate::gl_pbr_standard_block::{bind_gl_pbr_standard_block, build_gl_pbr_standard_define_key};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::GlMeshProgramRef;

const DIELECTRIC_SPECULAR: f32 = 0.04;

// The built-in SpecularGlossiness forward-lit mesh-material renderer (legacy KHR_materials_
// pbrSpecularGlossiness workflow). There is no spec-gloss path in the shader: this renderer converts
// the material to a StandardPbrMaterialProperties block on the CPU at bind time and drives the SAME
// base PBR program (no extension define), so spec-gloss assets render through the one metallic-
// roughness uber-shader.
//
// CONVERSION (Khronos glTF spec-gloss → metallic-roughness, `convertSpecularGlossinessToMetallic`):
//   - roughness  = 1 - glossiness  (glossiness is the inverse of roughness)
//   - metallic   = solve_metallic(diffuseBrightness, specularBrightness): the quadratic that recovers
//                  the metallic factor from how far the specular reflectance sits above the 0.04
//                  dielectric floor. Fully dielectric specular → 0; albedo-bright specular → 1.
//   - baseColor  = lerp from the dielectric estimate (diffuse / (1 - 0.04)) toward the specular color
//                  by metallic, so a dielectric keeps its diffuse albedo and a conductor takes its
//                  specular tint as F0.
// The conversion is an approximation — spec-gloss can express specular tints a single metallic-
// roughness baseColor cannot reproduce exactly — but it matches the reference converter and is
// stable for typical assets. The specular_glossiness_map (specular RGB + glossiness A) is NOT
// remapped to a metallic-roughness map here (different packing); only the scalar conversion is
// applied, while diffuse/emissive/normal/occlusion maps pass straight through to the standard block.
//
// Colors are decoded to linear on the CPU before the conversion math; sampled albedo/emissive
// textures select their sample-time decode through Texture.color_space, so nothing is double-decoded.
// See register_gl_specular_glossiness_pbr_material.
pub static GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER: GlMeshMaterialRenderer =
    GlMeshMaterialRenderer {
        bind: bind_gl_specular_glossiness_pbr_mesh_material,
        draw: draw_gl_specular_glossiness_pbr_mesh_material,
    };

fn bind_gl_specular_glossiness_pbr_mesh_material(
    state: &mut GlRenderState,
    material: Option<&dyn Material3D>,
    lights: &Rc<Scene3DLightBlock>,
    camera: &Camera3D,
) {
    let spec_gloss = material.and_then(|material| {
        material
            .as_any()
            .downcast_ref::<SpecularGlossinessPbrMaterial>()
    });
    let standard = spec_gloss.map(convert_specular_glossiness_to_standard);
    let surface = spec_gloss.map(|spec_gloss| spec_gloss as &dyn Material3D);
    let key = build_gl_pbr_standard_define_key(state, standard.as_ref(), surface);
    let program = ensure_gl_pbr_program(state, &key, None);
    let mesh_program: GlMeshProgramRef = program.clone();
    begin_gl_mesh_draw(
        state,
        &mesh_program,
        spec_gloss.is_some_and(|spec_gloss| spec_gloss.material3d_fields().double_sided),
    );

    set_gl_mesh_view_projection(state, program.loc_view_projection, camera);
    set_gl_mesh_camera_position(&state.gl, program.loc_camera_position, camera);
    bind_gl_mesh_light_block(state, &program.lit, lights);
    bind_gl_pbr_standard_block(state, &program, standard.as_ref());
    let alpha_cutoff = spec_gloss.map_or(0.5, |spec_gloss| {
        spec_gloss.material3d_fields().alpha_cutoff
    });
    // SAFETY: the program is bound on the owning GL thread.
    unsafe {
        state
            .gl
            .uniform_1_f32(program.loc_alpha_cutoff.as_ref(), alpha_cutoff)
    };
}

// Builds a StandardPbrMaterialProperties block from a spec-gloss material via the Khronos reference
// conversion. Writes a packed RGBA base_color/emissive (the standard block re-decodes them), so the
// downstream bind_gl_pbr_standard_block path stays identical to a native StandardPbr material. The
// returned block is fresh per bind (not pooled) — bind is not a hot inner loop, and reusing a scratch
// block would alias across draws.
fn convert_specular_glossiness_to_standard(
    material: &SpecularGlossinessPbrMaterial,
) -> StandardPbrMaterialProperties {
    let mut diffuse = allocate_linear_color();
    let mut specular = allocate_linear_color();
    unpack_color_to_linear(&mut diffuse, material.diffuse);
    unpack_color_to_linear(&mut specular, material.specular);

    let specular_brightness = specular.r.max(specular.g).max(specular.b);
    let one_minus_specular_strength = 1.0 - specular_brightness;
    let diffuse_brightness = diffuse.r.max(diffuse.g).max(diffuse.b);
    let metallic = solve_metallic(
        diffuse_brightness,
        specular_brightness,
        one_minus_specular_strength,
    );

    // base_color: blend the dielectric diffuse estimate and the specular tint by metallic, per the
    // reference converter, then re-pack to RGBA8 for the standard block to decode.
    let denom = (1.0 - DIELECTRIC_SPECULAR).max(1e-4);
    let r = lerp(
        (diffuse.r * one_minus_specular_strength) / denom,
        specular.r,
        metallic,
    );
    let g = lerp(
        (diffuse.g * one_minus_specular_strength) / denom,
        specular.g,
        metallic,
    );
    let b = lerp(
        (diffuse.b * one_minus_specular_strength) / denom,
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

fn draw_gl_specular_glossiness_pbr_mesh_material(
    state: &mut GlRenderState,
    proxy: &Scene3DRenderProxy,
    geometry: &MeshGeometry,
) {
    let Some(program) = get_gl_scene3d_runtime(state).active_mesh_program.clone() else {
        return;
    };
    draw_gl_mesh_subset(state, program.mesh_program(), proxy, geometry);
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

// Re-encodes a linear RGBA color (components in [0,1]) back to a packed 0xRRGGBBAA integer with the
// sRgb transfer, the inverse of unpack_color_to_linear, so the standard block's CPU decode round-trips.
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

// Installs the built-in SpecularGlossiness renderer for SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND on this
// state. Opt-in (no implicit side effect): the scene draw only draws SpecularGlossiness subsets once
// this is called.
pub fn register_gl_specular_glossiness_pbr_material(state: &mut GlRenderState) {
    register_gl_mesh_material_renderer(
        state,
        SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string(),
        &GL_SPECULAR_GLOSSINESS_PBR_MESH_MATERIAL_RENDERER,
    );
}

// The Khronos spec-gloss → metallic solver: recovers the metallic factor from the diffuse and
// specular reflectances by solving the quadratic that the metallic-roughness F0 model implies. Below
// the 0.04 dielectric floor the surface is fully dielectric (metallic 0).
fn solve_metallic(diffuse: f32, specular: f32, one_minus_specular_strength: f32) -> f32 {
    if specular < DIELECTRIC_SPECULAR {
        return 0.0;
    }
    let a = DIELECTRIC_SPECULAR;
    let b = (diffuse * one_minus_specular_strength) / (1.0 - DIELECTRIC_SPECULAR) + specular
        - 2.0 * DIELECTRIC_SPECULAR;
    let c = DIELECTRIC_SPECULAR - specular;
    let discriminant = (b * b - 4.0 * a * c).max(0.0);
    return ((-b + discriminant.sqrt()) / (2.0 * a)).clamp(0.0, 1.0);
}
