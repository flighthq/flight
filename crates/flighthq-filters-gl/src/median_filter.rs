//! Median GL filter pass.
//!
//! Preserves edges while removing noise. Supports radius 0–2 (up to 5×5 kernel);
//! use `apply_median_filter_to_surface` from `flighthq-filters` for larger radii.
//! A single GPU pass — no scratch targets needed.

use flighthq_filters::MedianFilter;
use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// Supports radius up to 2 (5×5 = 25 samples); larger radii use the surface path.
// Sorts each channel independently with insertion sort.
const MAX_RADIUS: i32 = 2;

const MEDIAN_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_texelSize;
uniform int u_radius;
out vec4 fragColor;

const int MAX_S = 25;

void sortFloat(inout float arr[MAX_S], int n) {
  for (int i = 1; i < n; i++) {
    float key = arr[i];
    int j = i - 1;
    while (j >= 0 && arr[j] > key) {
      arr[j + 1] = arr[j];
      j--;
    }
    arr[j + 1] = key;
  }
}

void main() {
  int r = clamp(u_radius, 0, 2);
  if (r == 0) {
    fragColor = texture(u_texture, v_texCoord);
    return;
  }
  int n = (2 * r + 1) * (2 * r + 1);
  float rv[MAX_S];
  float gv[MAX_S];
  float bv[MAX_S];
  float av[MAX_S];
  int count = 0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        vec4 s = texture(u_texture, v_texCoord + vec2(float(dx), float(dy)) * u_texelSize);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count++;
      }
    }
  }
  sortFloat(rv, n);
  sortFloat(gv, n);
  sortFloat(bv, n);
  sortFloat(av, n);
  int mid = n / 2;
  fragColor = vec4(rv[mid], gv[mid], bv[mid], av[mid]);
}";

/// Applies a per-channel median filter to `source`, writing to `dest`.
pub fn apply_median_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    filter: &MedianFilter,
) {
    let radius = (filter.radius.unwrap_or(1.0).round() as i32).clamp(0, MAX_RADIUS);
    let (tx, ty) = (1.0 / source.width as f32, 1.0 / source.height as f32);
    let program = get_median_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(gl.get_uniform_location(p, "u_texelSize").as_ref(), tx, ty);
            gl.uniform_1_i32(gl.get_uniform_location(p, "u_radius").as_ref(), radius);
        },
    );
}

/// Returns the median shader program for `state`, compiling on first use.
pub fn get_median_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, MEDIAN_FRAGMENT_SRC, |p| &mut p.median)
}

#[cfg(test)]
mod tests {
    use super::*;

    // MEDIAN_FRAGMENT_SRC

    #[test]
    fn median_fragment_src_sorts_each_channel() {
        assert!(MEDIAN_FRAGMENT_SRC.contains("void sortFloat"));
        assert!(
            MEDIAN_FRAGMENT_SRC.contains("fragColor = vec4(rv[mid], gv[mid], bv[mid], av[mid])")
        );
    }
}
