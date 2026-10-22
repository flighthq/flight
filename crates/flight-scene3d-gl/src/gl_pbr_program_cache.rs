use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::resolve_gl_lit_locations;
use crate::gl_mesh_program::{create_gl_program, ensure_gl_scene3d_program};
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::types::{GlLitProgram, GlPbrDefineKey};

pub struct GlPbrProgram {
    pub lit: GlLitProgram,
    pub base_color_location: Option<glow::NativeUniformLocation>,
    pub base_color_map_location: Option<glow::NativeUniformLocation>,
    pub metallic_location: Option<glow::NativeUniformLocation>,
    pub roughness_location: Option<glow::NativeUniformLocation>,
    pub metallic_roughness_map_location: Option<glow::NativeUniformLocation>,
    pub normal_map_location: Option<glow::NativeUniformLocation>,
    pub normal_scale_location: Option<glow::NativeUniformLocation>,
    pub occlusion_map_location: Option<glow::NativeUniformLocation>,
    pub occlusion_strength_location: Option<glow::NativeUniformLocation>,
    pub emissive_location: Option<glow::NativeUniformLocation>,
    pub emissive_map_location: Option<glow::NativeUniformLocation>,
    pub emissive_strength_location: Option<glow::NativeUniformLocation>,
    pub alpha_cutoff_location: Option<glow::NativeUniformLocation>,
}

pub fn compile_gl_pbr_program(
    gl: &glow::Context,
    vertex_source: &str,
    fragment_source: &str,
) -> GlPbrProgram {
    let program = create_gl_program(gl, vertex_source, fragment_source, Some("pbr")).expect("PBR program");
    let lit = resolve_gl_lit_locations(gl, program);
    return GlPbrProgram {
        lit,
        base_color_location: unsafe { gl.get_uniform_location(program, "u_baseColor") },
        base_color_map_location: unsafe { gl.get_uniform_location(program, "u_baseColorMap") },
        metallic_location: unsafe { gl.get_uniform_location(program, "u_metallic") },
        roughness_location: unsafe { gl.get_uniform_location(program, "u_roughness") },
        metallic_roughness_map_location: unsafe { gl.get_uniform_location(program, "u_metallicRoughnessMap") },
        normal_map_location: unsafe { gl.get_uniform_location(program, "u_normalMap") },
        normal_scale_location: unsafe { gl.get_uniform_location(program, "u_normalScale") },
        occlusion_map_location: unsafe { gl.get_uniform_location(program, "u_occlusionMap") },
        occlusion_strength_location: unsafe { gl.get_uniform_location(program, "u_occlusionStrength") },
        emissive_location: unsafe { gl.get_uniform_location(program, "u_emissive") },
        emissive_map_location: unsafe { gl.get_uniform_location(program, "u_emissiveMap") },
        emissive_strength_location: unsafe { gl.get_uniform_location(program, "u_emissiveStrength") },
        alpha_cutoff_location: unsafe { gl.get_uniform_location(program, "u_alphaCutoff") },
    };
}

pub fn build_gl_pbr_define_key(key: &GlPbrDefineKey) -> String {
    let mut s = String::new();
    if key.has_base_color_map { s.push('B'); }
    if key.has_metallic_roughness_map { s.push('M'); }
    if key.has_normal_map { s.push('N'); }
    if key.has_occlusion_map { s.push('O'); }
    if key.has_emissive_map { s.push('E'); }
    if key.has_skin { s.push('S'); }
    if key.has_color_adjustment { s.push('C'); }
    if key.has_color_matrix { s.push('X'); }
    if key.alpha_mask_enabled { s.push('A'); }
    if key.has_instanced { s.push('I'); }
    if key.has_ibl { s.push('L'); }
    if key.has_shadow { s.push('W'); }
    if !key.extension_define_key.is_empty() {
        s.push(':');
        s.push_str(&key.extension_define_key);
    }
    if !key.modifier_define_key.is_empty() {
        s.push('/');
        s.push_str(&key.modifier_define_key);
    }
    return s;
}
