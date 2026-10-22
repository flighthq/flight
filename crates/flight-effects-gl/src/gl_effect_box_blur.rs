// flight-lint: allow-file(contract-vocabulary) D17 shared GL effect passes draw native glow targets and return Result diagnostics
//! Iterative separable box blur, the cheap building block for soft spreads (glow, drop shadow).

use flight_effects::compute_box_blur_pass_radius;
use flight_render_gl::{
    GlFullscreenProgram, GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass,
};

use crate::contract::GlEffectBoxBlurOptions;
use crate::gl_effect_support::{
    get_gl_effect_shader, set_blend_func, set_uniform_1f, set_uniform_2f, set_uniform_4f,
    uniform_location,
};

const BOX_BLUR_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_radius;
uniform vec2 u_direction;
uniform vec4 u_edgeColor;
uniform float u_useEdgeColor;
out vec4 fragColor;
vec4 sampleBlur(vec2 uv) {
  if (u_useEdgeColor > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) {
    return u_edgeColor;
  }
  return texture(u_texture, uv);
}
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = sampleBlur(v_texCoord);
    return;
  }
  vec4 sum = vec4(0.0);
  int count = 2 * r + 1;
  for (int i = -r; i <= r; i++) {
    sum += sampleBlur(v_texCoord + float(i) * u_texelSize * u_direction);
  }
  fragColor = sum / float(count);
}"#;

fn apply_blur_blit(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    program: &GlFullscreenProgram,
) -> Result<(), String> {
    let locations = box_blur_locations(&state.gl, program);
    return draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), |gl, _p| {
        set_uniform_2f(gl, locations[0].as_ref(), 0.0, 0.0);
        set_uniform_1f(gl, locations[1].as_ref(), 0.0);
        set_uniform_2f(gl, locations[2].as_ref(), 0.0, 0.0);
        set_uniform_4f(gl, locations[3].as_ref(), 0.0, 0.0, 0.0, 0.0);
        set_uniform_1f(gl, locations[4].as_ref(), 0.0);
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

fn apply_box_blur_pass(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    program: &GlFullscreenProgram,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
    edge_color: Option<[f32; 4]>,
) -> Result<(), String> {
    let locations = box_blur_locations(&state.gl, program);
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    return draw_gl_fullscreen_pass(state, program, &[source.texture], Some(dest), |gl, _p| {
        set_uniform_2f(gl, locations[0].as_ref(), 1.0 / width, 1.0 / height);
        set_uniform_1f(gl, locations[1].as_ref(), radius);
        set_uniform_2f(gl, locations[2].as_ref(), dir_x, dir_y);
        match edge_color {
            None => {
                set_uniform_4f(gl, locations[3].as_ref(), 0.0, 0.0, 0.0, 0.0);
                set_uniform_1f(gl, locations[4].as_ref(), 0.0);
            }
            Some(edge) => {
                set_uniform_4f(
                    gl,
                    locations[3].as_ref(),
                    edge[0],
                    edge[1],
                    edge[2],
                    edge[3],
                );
                set_uniform_1f(gl, locations[4].as_ref(), 1.0);
            }
        }
        set_blend_func(gl, glow::ONE, glow::ZERO);
    });
}

/// Applies a separable box blur to `source`, writing to `dest`. `blur_x`/`blur_y` (default 4) are
/// the target Gaussian standard deviations; `passes` (default 1) is the number of box passes per
/// axis (more passes converge on a Gaussian, not a larger blur). `temp` is a caller-provided
/// ping-pong scratch target distinct from both `source` and `dest`.
pub fn apply_gl_effect_box_blur(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    temp: &GlTextureRenderTarget,
    options: &GlEffectBoxBlurOptions,
) -> Result<(), String> {
    let passes = options.passes.unwrap_or(1.0).round().max(1.0);
    let blur_x = options.blur_x.unwrap_or(4.0);
    let blur_y = options.blur_y.unwrap_or(4.0);
    let edge_color = options.edge_color;

    let program = get_gl_effect_shader(state, "boxBlur", BOX_BLUR_FRAGMENT_SRC)?;
    let mut read: &GlTextureRenderTarget = source;
    let mut write: &GlTextureRenderTarget = temp;

    // Each pass may use a different radius per axis so the box widths converge on the target
    // sigma; zero-radius passes are skipped. If nothing is written, the tail blit copies source to dest.
    let mut pass = 0.0_f32;
    while pass < passes {
        let radius_x = compute_box_blur_pass_radius(blur_x, passes, pass);
        if radius_x > 0.0 {
            apply_box_blur_pass(state, read, write, &program, radius_x, 1.0, 0.0, edge_color)?;
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        let radius_y = compute_box_blur_pass_radius(blur_y, passes, pass);
        if radius_y > 0.0 {
            apply_box_blur_pass(state, read, write, &program, radius_y, 0.0, 1.0, edge_color)?;
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        pass += 1.0;
    }

    if !std::ptr::eq(read, dest) {
        apply_blur_blit(state, read, dest, &program)?;
    }
    return Ok(());
}

fn box_blur_locations(
    gl: &glow::Context,
    program: &GlFullscreenProgram,
) -> [Option<glow::NativeUniformLocation>; 5] {
    return [
        uniform_location(gl, program, "u_texelSize"),
        uniform_location(gl, program, "u_radius"),
        uniform_location(gl, program, "u_direction"),
        uniform_location(gl, program, "u_edgeColor"),
        uniform_location(gl, program, "u_useEdgeColor"),
    ];
}
