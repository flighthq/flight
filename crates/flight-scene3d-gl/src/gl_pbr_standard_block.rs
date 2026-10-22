use flight_render_gl::GlRenderState;
use glow::HasContext;

use crate::gl_lit_program::bind_gl_mesh_light_block;
use crate::gl_pbr_program_cache::GlPbrProgram;
use crate::types::Scene3DLightBlock;

pub fn bind_gl_pbr_standard_block(
    state: &GlRenderState,
    program: &GlPbrProgram,
    light_block: &Scene3DLightBlock,
    base_color: &[f32; 4],
    metallic: f32,
    roughness: f32,
    emissive: &[f32; 3],
    emissive_strength: f32,
    normal_scale: f32,
    occlusion_strength: f32,
    alpha_cutoff: f32,
) {
    bind_gl_mesh_light_block(state, &program.lit, light_block);

    let gl = &state.gl;
    unsafe {
        if let Some(ref loc) = program.base_color_location {
            gl.uniform_4_f32(Some(loc), base_color[0], base_color[1], base_color[2], base_color[3]);
        }
        if let Some(ref loc) = program.metallic_location {
            gl.uniform_1_f32(Some(loc), metallic);
        }
        if let Some(ref loc) = program.roughness_location {
            gl.uniform_1_f32(Some(loc), roughness);
        }
        if let Some(ref loc) = program.emissive_location {
            gl.uniform_3_f32(Some(loc), emissive[0], emissive[1], emissive[2]);
        }
        if let Some(ref loc) = program.emissive_strength_location {
            gl.uniform_1_f32(Some(loc), emissive_strength);
        }
        if let Some(ref loc) = program.normal_scale_location {
            gl.uniform_1_f32(Some(loc), normal_scale);
        }
        if let Some(ref loc) = program.occlusion_strength_location {
            gl.uniform_1_f32(Some(loc), occlusion_strength);
        }
        if let Some(ref loc) = program.alpha_cutoff_location {
            gl.uniform_1_f32(Some(loc), alpha_cutoff);
        }
    }
}
