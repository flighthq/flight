// flight-lint: allow-file(contract-vocabulary) D17 presentation accepts native target traits and Result diagnostics

use flight_texture::RenderTargetColorSpace;

use crate::{
    GlFullscreenProgram, GlRenderState, GlRenderTarget, GlTextureRenderTarget,
    compile_gl_fullscreen_program, draw_gl_fullscreen_pass, draw_gl_linear_to_srgb_pass,
};

pub const COPY_GL_FRAGMENT_SOURCE: &str = "#version 300 es\nprecision highp float;\nin vec2 v_texCoord;\nuniform sampler2D u_texture0;\nout vec4 fragColor;\nvoid main() {\n  fragColor = texture(u_texture0, v_texCoord);\n}";

fn get_gl_copy_program(state: &GlRenderState) -> Result<GlFullscreenProgram, String> {
    const KEY: &str = "copy";
    if let Some(program) = state
        .context_state
        .runtime_state
        .borrow()
        .fullscreen_programs
        .get(KEY)
        .cloned()
    {
        return Ok(program);
    }
    let program = compile_gl_fullscreen_program(&state.gl, COPY_GL_FRAGMENT_SOURCE)?;
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .fullscreen_programs
        .insert(KEY.to_string(), program.clone());
    return Ok(program);
}

// flight-lint: allow(conform-params) The native destination name is descriptive; its position and source semantics are unchanged
pub fn present_gl_render_target(
    state: &mut GlRenderState,
    target: &GlTextureRenderTarget,
    destination: Option<&dyn GlRenderTarget>,
) -> Result<(), String> {
    if target.axes.color_space == RenderTargetColorSpace::Linear {
        return draw_gl_linear_to_srgb_pass(state, target, destination);
    }
    let program = get_gl_copy_program(state)?;
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[target.texture],
        destination,
        |_gl, _program| {},
    );
}
