//! Box-blur and Gaussian-blur GL filter passes.
//!
//! `apply_box_blur_filter_to_gl` is the cheap multi-pass box approximation used
//! by spread effects (glow, drop shadow). `apply_gaussian_blur_filter_to_gl` is
//! a faithful single-pass Gaussian matching the CSS `blur()` path.

use flighthq_filters::BlurFilter;
use flighthq_filters_math::compute_box_blur_pass_radius;
use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::tint_shader::apply_gl_blit_pass;
use crate::{GlRenderState, GlRenderTarget};

const BOX_BLUR_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 fragColor;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  vec4 sum = vec4(0.0);
  int count = 2 * r + 1;
  for (int i = -r; i <= r; i++) {
    sum += texture(u_texture, v_texCoord + float(i) * u_texelSize * u_direction);
  }
  fragColor = sum / float(count);
}";

const GAUSSIAN_BLUR_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform float u_sigma;
uniform float u_radius;
uniform vec2 u_direction;
out vec4 fragColor;
void main() {
  int r = max(0, int(u_radius));
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  float twoSigmaSq = 2.0 * u_sigma * u_sigma;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  for (int i = -r; i <= r; i++) {
    float w = exp(-float(i * i) / twoSigmaSq);
    sum += w * texture(u_texture, v_texCoord + float(i) * u_texelSize * u_direction);
    weightSum += w;
  }
  fragColor = sum / weightSum;
}";

/// Applies a `BlurFilter` descriptor to `source`, writing to `dest`.
///
/// Dispatches to `apply_box_blur_filter_to_gl` with the descriptor's
/// `blur_x` / `blur_y` (defaulting to 4.0 when unset, matching the TS
/// reference) and a single box pass — the same `&BlurFilter` signature as the
/// other `apply_*_filter_to_gl` functions in this crate. `temp` is a
/// caller-provided ping-pong scratch target distinct from both `source` and
/// `dest`.
pub fn apply_blur_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    temp: &GlRenderTarget,
    filter: &BlurFilter,
) {
    apply_box_blur_filter_to_gl(
        state,
        source,
        dest,
        temp,
        filter.blur_x.unwrap_or(4.0),
        filter.blur_y.unwrap_or(4.0),
        1,
    );
}

/// Applies a separable box blur to `source`, writing to `dest`.
///
/// `blur_x` / `blur_y` are the target Gaussian standard deviations; `passes`
/// is the number of box passes per axis — more passes converge the box toward a
/// Gaussian shape, not a larger blur radius. `temp` is a caller-provided
/// ping-pong scratch target distinct from both `source` and `dest`.
pub fn apply_box_blur_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    temp: &GlRenderTarget,
    blur_x: f32,
    blur_y: f32,
    passes: u32,
) {
    let passes = passes.max(1);
    let program = get_box_blur_shader(state);

    let mut read: &GlRenderTarget = source;
    let mut write: &GlRenderTarget = temp;

    for pass in 0..passes {
        let radius_x = compute_box_blur_pass_radius(blur_x as f64, passes, pass);
        if radius_x > 0.0 {
            apply_box_blur_pass(state, program, read, write, radius_x as f32, 1.0, 0.0);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
        let radius_y = compute_box_blur_pass_radius(blur_y as f64, passes, pass);
        if radius_y > 0.0 {
            apply_box_blur_pass(state, program, read, write, radius_y as f32, 0.0, 1.0);
            read = write;
            write = if std::ptr::eq(write, temp) {
                dest
            } else {
                temp
            };
        }
    }

    if !std::ptr::eq(read, dest) {
        apply_gl_blit_pass(state, read, dest);
    }
}

/// Applies a faithful separable Gaussian blur to `source`, writing to `dest`.
///
/// `blur_x` / `blur_y` are Gaussian standard deviations (matching CSS
/// `blur(Xpx)`, so this matches the CSS and CPU-surface Gaussian paths).
/// Each axis is a single weighted pass with radius `⌈3σ⌉`. `temp` is a
/// ping-pong scratch target distinct from both `source` and `dest`.
pub fn apply_gaussian_blur_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    temp: &GlRenderTarget,
    blur_x: f32,
    blur_y: f32,
) {
    let radius_x = if blur_x > 0.0 {
        (blur_x * 3.0).ceil() as u32
    } else {
        0
    };
    let radius_y = if blur_y > 0.0 {
        (blur_y * 3.0).ceil() as u32
    } else {
        0
    };

    if radius_x == 0 && radius_y == 0 {
        apply_gl_blit_pass(state, source, dest);
        return;
    }

    let program = get_gaussian_blur_shader(state);
    let mut read: &GlRenderTarget = source;
    let mut write: &GlRenderTarget = temp;

    if radius_x > 0 {
        apply_gaussian_blur_pass(
            state,
            program,
            read,
            write,
            blur_x,
            radius_x as f32,
            1.0,
            0.0,
        );
        read = write;
        write = if std::ptr::eq(write, temp) {
            dest
        } else {
            temp
        };
    }
    if radius_y > 0 {
        apply_gaussian_blur_pass(
            state,
            program,
            read,
            write,
            blur_y,
            radius_y as f32,
            0.0,
            1.0,
        );
        read = write;
    }

    if !std::ptr::eq(read, dest) {
        apply_gl_blit_pass(state, read, dest);
    }
}

/// Returns the box-blur shader program for `state`, compiling on first use.
pub fn get_box_blur_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, BOX_BLUR_FRAGMENT_SRC, |p| &mut p.box_blur)
}

/// Returns the Gaussian-blur shader program for `state`, compiling on first use.
pub fn get_gaussian_blur_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, GAUSSIAN_BLUR_FRAGMENT_SRC, |p| &mut p.gaussian_blur)
}

fn apply_box_blur_pass(
    state: &GlRenderState,
    program: &GlFullscreenProgram,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) {
    let (tx, ty) = (1.0 / source.width as f32, 1.0 / source.height as f32);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(gl.get_uniform_location(p, "u_texelSize").as_ref(), tx, ty);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_direction").as_ref(),
                dir_x,
                dir_y,
            );
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn apply_gaussian_blur_pass(
    state: &GlRenderState,
    program: &GlFullscreenProgram,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    sigma: f32,
    radius: f32,
    dir_x: f32,
    dir_y: f32,
) {
    let (tx, ty) = (1.0 / source.width as f32, 1.0 / source.height as f32);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(gl.get_uniform_location(p, "u_texelSize").as_ref(), tx, ty);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_sigma").as_ref(), sigma);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_direction").as_ref(),
                dir_x,
                dir_y,
            );
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    // BOX_BLUR_FRAGMENT_SRC

    #[test]
    fn box_blur_fragment_src_averages_samples() {
        assert!(BOX_BLUR_FRAGMENT_SRC.contains("uniform vec2 u_direction"));
        assert!(BOX_BLUR_FRAGMENT_SRC.contains("sum / float(count)"));
    }

    // GAUSSIAN_BLUR_FRAGMENT_SRC

    #[test]
    fn gaussian_blur_fragment_src_weights_by_gaussian() {
        assert!(GAUSSIAN_BLUR_FRAGMENT_SRC.contains("uniform float u_sigma"));
        assert!(GAUSSIAN_BLUR_FRAGMENT_SRC.contains("exp(-float(i * i) / twoSigmaSq)"));
        assert!(GAUSSIAN_BLUR_FRAGMENT_SRC.contains("sum / weightSum"));
    }
}
