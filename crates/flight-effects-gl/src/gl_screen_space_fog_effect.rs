// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, sample native depth textures and return Result diagnostics
//! Screen-space fog: depth-aware distance fog when the scene wrote a depth attachment, otherwise a
//! vertical proxy fog that thickens toward the top of the image.

use flight_effects::{Effect, ScreenSpaceFogEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};
use glow::NativeTexture;

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_3f};

const SCREEN_SPACE_FOG_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_near;
uniform float u_far;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float fog;
  if (u_hasDepth > 0.5) {
    // Real depth path: window-space depth remapped over [near, far], exponential fog by density.
    float depth = texture(u_texture1, v_texCoord).r;
    float d = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
    fog = clamp(1.0 - exp(-u_density * d), 0.0, 1.0);
  } else {
    // Sentinel path: no depth written (flat 2D scene) — screen-Y gradient as a depth proxy, densest
    // at the top of the frame where a horizon would be. A render target is bottom-left origin, so
    // v_texCoord.y already counts upward from the bottom and is the image-space distance from the top;
    // subtracting it from one would put the fog on the ground instead of the horizon.
    fog = clamp(v_texCoord.y * u_density, 0.0, 1.0);
  }
  o_color = vec4(mix(c.rgb, u_fogColor, fog), c.a);
}"#;

pub fn apply_screen_space_fog_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    depth_texture: Option<NativeTexture>,
    effect: &ScreenSpaceFogEffect,
) -> Result<(), String> {
    let packed = effect.color.unwrap_or(0xc8d2dcff);
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let density = effect.density.unwrap_or(1.0);
    let near = effect.near.unwrap_or(0.0);
    let far = effect.far.unwrap_or(1.0);
    let program = get_gl_effect_program(
        state,
        "atmospheric.screenSpaceFog",
        SCREEN_SPACE_FOG_FRAGMENT_SRC,
    )?;
    let inputs: Vec<NativeTexture> = match depth_texture {
        Some(depth) => vec![source.texture, depth],
        None => vec![source.texture],
    };
    let has_depth = if depth_texture.is_some() { 1.0 } else { 0.0 };
    return draw_gl_fullscreen_pass(state, &program, &inputs, Some(dest), |gl, p| {
        uniform_3f(gl, p, "u_fogColor", r, g, b);
        uniform_1f(gl, p, "u_density", density);
        uniform_1f(gl, p, "u_near", near);
        uniform_1f(gl, p, "u_far", far);
        uniform_1f(gl, p, "u_hasDepth", has_depth);
    });
}

pub fn gl_screen_space_fog_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ScreenSpaceFogEffect>() else {
        return Ok(());
    };
    return apply_screen_space_fog_effect_to_gl(
        ctx.state,
        ctx.source,
        ctx.dest,
        ctx.scene_depth_texture,
        effect,
    );
}

pub fn register_gl_screen_space_fog_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "ScreenSpaceFogEffect",
        gl_screen_space_fog_effect_runner,
        None,
    );
}
