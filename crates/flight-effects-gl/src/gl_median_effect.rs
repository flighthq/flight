// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Per-channel median denoise: each output pixel is the median of its (2·radius+1)² neighborhood.
//! Preserves edges while removing salt-and-pepper noise. A single GPU pass — no scratch targets.

use flight_effects::{Effect, MedianEffect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1i, uniform_2f};

/// Largest median-filter radius the GL path supports (radius 2 → a 5×5, 25-sample window). The cap
/// is the fixed sort-array size in the fragment shader; larger radii are unsupported on this backend.
pub const MAX_MEDIAN_EFFECT_GL_RADIUS: i32 = 2;

const MAX_SAMPLES: i32 =
    (MAX_MEDIAN_EFFECT_GL_RADIUS * 2 + 1) * (MAX_MEDIAN_EFFECT_GL_RADIUS * 2 + 1); // 25

pub fn apply_median_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &MedianEffect,
) -> Result<(), String> {
    let radius = (MAX_MEDIAN_EFFECT_GL_RADIUS as f32)
        .min(round_half_up(effect.radius.unwrap_or(1.0)).max(0.0)) as i32;
    let program = get_gl_effect_program(state, "stylization.median", &median_fragment_source())?;
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_2f(gl, p, "u_texelSize", 1.0 / width, 1.0 / height);
        uniform_1i(gl, p, "u_radius", radius);
    });
}

pub fn gl_median_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<MedianEffect>() else {
        return Ok(());
    };
    return apply_median_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

fn median_fragment_source() -> String {
    let max_samples = MAX_SAMPLES;
    let max_radius = MAX_MEDIAN_EFFECT_GL_RADIUS;
    return format!(
        r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_texelSize;
uniform int u_radius;
out vec4 fragColor;

const int MAX_S = {max_samples};

void sortFloat(inout float arr[MAX_S], int n) {{
  for (int i = 1; i < n; i++) {{
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {{
      arr[j + 1] = arr[j];
      j--;
    }}
    arr[j + 1] = key;
  }}
}}

void main() {{
  int r = clamp(u_radius, 0, {max_radius});
  if (r == 0) {{
    fragColor = texture(u_texture0, v_texCoord);
    return;
  }}
  int n = (2 * r + 1) * (2 * r + 1);
  float rv[MAX_S];
  float gv[MAX_S];
  float bv[MAX_S];
  float av[MAX_S];
  int count = 0;
  for (int dy = -{max_radius}; dy <= {max_radius}; dy++) {{
    for (int dx = -{max_radius}; dx <= {max_radius}; dx++) {{
      if (abs(dy) <= r && abs(dx) <= r) {{
        vec4 s = texture(u_texture0, v_texCoord + vec2(float(dx), float(dy)) * u_texelSize);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count++;
      }}
    }}
  }}
  sortFloat(rv, n);
  sortFloat(gv, n);
  sortFloat(bv, n);
  sortFloat(av, n);
  int mid = n / 2;
  fragColor = vec4(rv[mid], gv[mid], bv[mid], av[mid]);
}}"#
    );
}

pub fn register_gl_median_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "MedianEffect", gl_median_effect_runner, None);
}

/// JS `Math.round`: halves round toward +infinity.
fn round_half_up(value: f32) -> f32 {
    return (value + 0.5).floor();
}
