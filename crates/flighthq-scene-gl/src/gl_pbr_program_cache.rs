//! The StandardPbr uber-shader program cache.
//!
//! Ports `@flighthq/scene-gl` `glPbrProgramCache.ts`. A [`GlPbrProgram`] is one
//! compiled uber-shader variant plus its resolved uniform locations; one exists
//! per distinct [`GlPbrDefineKey`], built once and cached on the scene runtime by
//! the key's stable string.
//!
//! TS↔Rust divergence: the TS compile/link path runs against a mocked WebGL2
//! context that records calls, so the TS tests assert on `linkProgram` etc. The
//! Rust GL backend drives a real `glow::Context`; like `flighthq-render-gl`'s own
//! GL paths, the compile/link function takes a live `&glow::Context` and is not
//! unit-tested without a device. The cache-by-key logic is otherwise 1:1, and the
//! cache-key string itself is assertion-tested in `gl_pbr_prelude`.

use glow::HasContext;

use crate::gl_pbr_prelude::{
    GlPbrDefineKey, build_gl_pbr_define_key, get_gl_pbr_fragment_source_for_key,
    get_gl_pbr_vertex_source_for_key,
};
use crate::gl_scene_runtime::GlSceneRuntime;

/// A compiled StandardPbr uber-shader variant plus its resolved uniform
/// locations. The vertex attribute locations are fixed by the shader's
/// `layout(location = …)` qualifiers (0 position, 1 normal, 2 tangent, 3 uv0), so
/// they are not stored here — the draw path binds them by constant.
#[derive(Clone, Debug)]
pub struct GlPbrProgram {
    pub program: glow::Program,
    pub loc_view_projection: Option<glow::UniformLocation>,
    pub loc_model: Option<glow::UniformLocation>,
    pub loc_normal_matrix: Option<glow::UniformLocation>,
    pub loc_base_color: Option<glow::UniformLocation>,
    pub loc_metallic: Option<glow::UniformLocation>,
    pub loc_roughness: Option<glow::UniformLocation>,
    pub loc_normal_scale: Option<glow::UniformLocation>,
    pub loc_emissive: Option<glow::UniformLocation>,
    pub loc_emissive_strength: Option<glow::UniformLocation>,
    pub loc_occlusion_strength: Option<glow::UniformLocation>,
    pub loc_alpha_cutoff: Option<glow::UniformLocation>,
    pub loc_camera_position: Option<glow::UniformLocation>,
    pub loc_directional: Option<glow::UniformLocation>,
    pub loc_directional_radiance: Option<glow::UniformLocation>,
    pub loc_ambient_radiance: Option<glow::UniformLocation>,
    pub loc_directional_count: Option<glow::UniformLocation>,
    pub loc_ambient_count: Option<glow::UniformLocation>,
    pub loc_base_color_map: Option<glow::UniformLocation>,
    pub loc_normal_map: Option<glow::UniformLocation>,
    pub loc_metallic_roughness_map: Option<glow::UniformLocation>,
    pub loc_occlusion_map: Option<glow::UniformLocation>,
    pub loc_emissive_map: Option<glow::UniformLocation>,
    // KHR_materials_specular
    pub loc_specular: Option<glow::UniformLocation>,
    pub loc_specular_color: Option<glow::UniformLocation>,
    // KHR_materials_clearcoat
    pub loc_clearcoat: Option<glow::UniformLocation>,
    pub loc_clearcoat_roughness: Option<glow::UniformLocation>,
    // KHR_materials_sheen
    pub loc_sheen_color: Option<glow::UniformLocation>,
    pub loc_sheen_roughness: Option<glow::UniformLocation>,
    // KHR_materials_anisotropy
    pub loc_anisotropy_strength: Option<glow::UniformLocation>,
    pub loc_anisotropy_rotation: Option<glow::UniformLocation>,
    // KHR_materials_iridescence
    pub loc_iridescence: Option<glow::UniformLocation>,
    pub loc_iridescence_ior: Option<glow::UniformLocation>,
    pub loc_iridescence_thickness: Option<glow::UniformLocation>,
    // Subsurface (Flight extension)
    pub loc_subsurface: Option<glow::UniformLocation>,
    pub loc_subsurface_color: Option<glow::UniformLocation>,
    pub loc_thickness: Option<glow::UniformLocation>,
    // KHR_materials_transmission + KHR_materials_volume
    pub loc_transmission: Option<glow::UniformLocation>,
    pub loc_attenuation_color: Option<glow::UniformLocation>,
}

/// Compiles the StandardPbr uber-shader for a define key, links it, and resolves
/// its uniform locations. Pure GL work — no caching — used by
/// [`ensure_gl_pbr_program`].
///
/// # Panics
/// Panics on a compile/link failure, which is a programmer error (a malformed
/// prelude), not an expected runtime condition. Mirrors the TS `throw`.
///
/// # Safety
/// The GL context must be current.
pub fn compile_gl_pbr_program(gl: &glow::Context, key: &GlPbrDefineKey) -> GlPbrProgram {
    let vertex_source = get_gl_pbr_vertex_source_for_key(key);
    let fragment_source = get_gl_pbr_fragment_source_for_key(key);
    let program = link_gl_pbr_program(gl, &vertex_source, &fragment_source);
    unsafe {
        GlPbrProgram {
            program,
            loc_view_projection: gl.get_uniform_location(program, "u_viewProjection"),
            loc_model: gl.get_uniform_location(program, "u_model"),
            loc_normal_matrix: gl.get_uniform_location(program, "u_normalMatrix"),
            loc_base_color: gl.get_uniform_location(program, "u_baseColor"),
            loc_metallic: gl.get_uniform_location(program, "u_metallic"),
            loc_roughness: gl.get_uniform_location(program, "u_roughness"),
            loc_normal_scale: gl.get_uniform_location(program, "u_normalScale"),
            loc_emissive: gl.get_uniform_location(program, "u_emissive"),
            loc_emissive_strength: gl.get_uniform_location(program, "u_emissiveStrength"),
            loc_occlusion_strength: gl.get_uniform_location(program, "u_occlusionStrength"),
            loc_alpha_cutoff: gl.get_uniform_location(program, "u_alphaCutoff"),
            loc_camera_position: gl.get_uniform_location(program, "u_cameraPosition"),
            loc_directional: gl.get_uniform_location(program, "u_directional"),
            loc_directional_radiance: gl.get_uniform_location(program, "u_directionalRadiance"),
            loc_ambient_radiance: gl.get_uniform_location(program, "u_ambientRadiance"),
            loc_directional_count: gl.get_uniform_location(program, "u_directionalCount"),
            loc_ambient_count: gl.get_uniform_location(program, "u_ambientCount"),
            loc_base_color_map: gl.get_uniform_location(program, "u_baseColorMap"),
            loc_normal_map: gl.get_uniform_location(program, "u_normalMap"),
            loc_metallic_roughness_map: gl.get_uniform_location(program, "u_metallicRoughnessMap"),
            loc_occlusion_map: gl.get_uniform_location(program, "u_occlusionMap"),
            loc_emissive_map: gl.get_uniform_location(program, "u_emissiveMap"),
            loc_specular: gl.get_uniform_location(program, "u_specular"),
            loc_specular_color: gl.get_uniform_location(program, "u_specularColor"),
            loc_clearcoat: gl.get_uniform_location(program, "u_clearcoat"),
            loc_clearcoat_roughness: gl.get_uniform_location(program, "u_clearcoatRoughness"),
            loc_sheen_color: gl.get_uniform_location(program, "u_sheenColor"),
            loc_sheen_roughness: gl.get_uniform_location(program, "u_sheenRoughness"),
            loc_anisotropy_strength: gl.get_uniform_location(program, "u_anisotropyStrength"),
            loc_anisotropy_rotation: gl.get_uniform_location(program, "u_anisotropyRotation"),
            loc_iridescence: gl.get_uniform_location(program, "u_iridescence"),
            loc_iridescence_ior: gl.get_uniform_location(program, "u_iridescenceIor"),
            loc_iridescence_thickness: gl.get_uniform_location(program, "u_iridescenceThickness"),
            loc_subsurface: gl.get_uniform_location(program, "u_subsurface"),
            loc_subsurface_color: gl.get_uniform_location(program, "u_subsurfaceColor"),
            loc_thickness: gl.get_uniform_location(program, "u_thickness"),
            loc_transmission: gl.get_uniform_location(program, "u_transmission"),
            loc_attenuation_color: gl.get_uniform_location(program, "u_attenuationColor"),
        }
    }
}

/// Resolves the StandardPbr program for a define key, compiling and caching it on
/// first use. The cache is the scene runtime's `pbr_program_cache` (keyed by the
/// define key's stable string), so each variant is compiled at most once per state
/// and reused every frame.
///
/// # Safety
/// The GL context must be current.
pub fn ensure_gl_pbr_program(
    gl: &glow::Context,
    scene: &mut GlSceneRuntime,
    key: &GlPbrDefineKey,
) -> GlPbrProgram {
    let cache_key = build_gl_pbr_define_key(key);
    if let Some(program) = scene.pbr_program_cache.get(&cache_key) {
        return program.clone();
    }
    let program = compile_gl_pbr_program(gl, key);
    scene.pbr_program_cache.insert(cache_key, program.clone());
    program
}

fn compile_gl_pbr_shader(gl: &glow::Context, shader_type: u32, source: &str) -> glow::Shader {
    unsafe {
        let shader = gl.create_shader(shader_type).expect("create PBR shader");
        gl.shader_source(shader, source);
        gl.compile_shader(shader);
        if !gl.get_shader_compile_status(shader) {
            let log = gl.get_shader_info_log(shader);
            panic!("PBR shader compile error: {log}");
        }
        shader
    }
}

fn link_gl_pbr_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
) -> glow::Program {
    unsafe {
        let vertex_shader = compile_gl_pbr_shader(gl, glow::VERTEX_SHADER, vertex_source);
        let fragment_shader = compile_gl_pbr_shader(gl, glow::FRAGMENT_SHADER, fragment_source);
        let program = gl.create_program().expect("create PBR program");
        gl.attach_shader(program, vertex_shader);
        gl.attach_shader(program, fragment_shader);
        gl.link_program(program);
        gl.delete_shader(vertex_shader);
        gl.delete_shader(fragment_shader);
        if !gl.get_program_link_status(program) {
            let log = gl.get_program_info_log(program);
            panic!("PBR program link error: {log}");
        }
        program
    }
}
