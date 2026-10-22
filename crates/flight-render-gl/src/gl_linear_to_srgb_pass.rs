// flight-lint: allow-file(contract-vocabulary) D17 color conversion passes accept the native target trait and Result diagnostics

use crate::{
    GlFullscreenProgram, GlRenderState, GlRenderTarget, GlTextureRenderTarget,
    compile_gl_fullscreen_program, draw_gl_fullscreen_pass,
};

pub const LINEAR_TO_SRGB_FRAGMENT_SOURCE: &str = "#version 300 es\nprecision highp float;\nin vec2 v_texCoord;\nuniform sampler2D u_texture0;\nout vec4 fragColor;\nvec3 linearToSrgb(vec3 c) {\n  c = max(c, vec3(0.0));\n  vec3 low = c * 12.92;\n  vec3 high = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;\n  return mix(low, high, step(vec3(0.0031308), c));\n}\nvoid main() {\n  vec4 linear = texture(u_texture0, v_texCoord);\n  fragColor = vec4(linearToSrgb(linear.rgb), linear.a);\n}";

// flight-lint: allow(conform-params) The native destination name is descriptive; its position and source semantics are unchanged
pub fn draw_gl_linear_to_srgb_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    destination: Option<&dyn GlRenderTarget>,
) -> Result<(), String> {
    let program = get_gl_linear_to_srgb_program(state)?;
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[source.texture],
        destination,
        |_gl, _program| {},
    );
}

fn get_gl_linear_to_srgb_program(state: &GlRenderState) -> Result<GlFullscreenProgram, String> {
    const KEY: &str = "linear-to-srgb";
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
    let program = compile_gl_fullscreen_program(&state.gl, LINEAR_TO_SRGB_FRAGMENT_SOURCE)?;
    state
        .context_state
        .runtime_state
        .borrow_mut()
        .fullscreen_programs
        .insert(KEY.to_string(), program.clone());
    return Ok(program);
}
