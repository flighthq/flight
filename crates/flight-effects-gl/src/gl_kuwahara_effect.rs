// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Kuwahara: edge-preserving smoothing. Over a fixed small radius split the neighborhood into four
//! overlapping quadrants, compute each mean and variance, and emit the lowest-variance mean — flattens
//! regions while keeping edges crisp. `radius` gates the sampled extent.

use flight_effects::{Effect, KuwaharaEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const KUWAHARA_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_radius;
uniform vec2 u_resolution;
out vec4 o_color;
const int R = 4;
void main() {
  vec2 texel = 1.0 / u_resolution;
  int r = int(min(float(R), u_radius));
  vec3 means[4];
  float vars[4];
  for (int q = 0; q < 4; q++) {
    int ox = (q & 1) == 0 ? -r : 0;
    int oy = (q & 2) == 0 ? 0 : -r;
    vec3 sum = vec3(0.0);
    vec3 sumSq = vec3(0.0);
    float n = 0.0;
    for (int y = 0; y <= R; y++) {
      for (int x = 0; x <= R; x++) {
        if (x > r || y > r) continue;
        vec2 off = vec2(float(ox + x), float(oy + y)) * texel;
        vec3 col = texture(u_texture0, v_texCoord + off).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    vec3 mean = sum / n;
    means[q] = mean;
    vec3 v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  float minVar = vars[0];
  vec3 result = means[0];
  float tiedCount = 1.0;
  for (int q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
      tiedCount = 1.0;
    } else if (vars[q] == minVar) {
      result += means[q];
      tiedCount += 1.0;
    }
  }
  result /= tiedCount;
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}"#;

pub fn apply_kuwahara_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &KuwaharaEffect,
) -> Result<(), String> {
    let radius = effect.radius.unwrap_or(3.0);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let program = get_gl_effect_program(state, "stylization.kuwahara", KUWAHARA_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_radius", radius.max(1.0));
        uniform_2f(gl, p, "u_resolution", width, height);
    });
}

pub fn gl_kuwahara_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<KuwaharaEffect>() else {
        return Ok(());
    };
    return apply_kuwahara_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_kuwahara_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "KuwaharaEffect", gl_kuwahara_effect_runner, None);
}
