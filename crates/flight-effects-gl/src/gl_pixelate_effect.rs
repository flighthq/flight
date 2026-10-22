// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Pixelate: snap uv to the center of `size`-pixel blocks before sampling, producing hard mosaic blocks.

use flight_effects::{Effect, PixelateEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const PIXELATE_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_size;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 blocks = u_resolution / u_size;
  vec2 uv = (floor(v_texCoord * blocks) + 0.5) / blocks;
  o_color = texture(u_texture0, uv);
}"#;

pub fn apply_pixelate_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &PixelateEffect,
) -> Result<(), String> {
    let size = effect.size.unwrap_or(8.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.pixelate", PIXELATE_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_size", size.max(1.0));
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_pixelate_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<PixelateEffect>() else {
        return Ok(());
    };
    return apply_pixelate_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_pixelate_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "PixelateEffect", gl_pixelate_effect_runner, None);
}
