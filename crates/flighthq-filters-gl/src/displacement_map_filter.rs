//! Displacement-map GL filter pass.

use flighthq_filters::DisplacementMapFilter;
use flighthq_filters::DisplacementMapMode;
use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

// Samples the map (unit 1) to compute per-pixel UV displacement, then samples
// the source (unit 0) at the displaced coordinate. Map value 0.5 (128/255) is
// neutral (no displacement).
const DISPLACEMENT_MAP_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec2 u_texelSize;
uniform int u_componentX;
uniform int u_componentY;
uniform float u_scaleX;
uniform float u_scaleY;
uniform int u_mode;
uniform vec4 u_edgeColor;
out vec4 fragColor;

float getChannel(vec4 color, int comp) {
  if (comp == 0) return color.r;
  if (comp == 1) return color.g;
  if (comp == 2) return color.b;
  return color.a;
}

vec4 sampleSource(vec2 uv) {
  if (u_mode == 0) {
    return texture(u_texture0, fract(uv));
  }
  if (u_mode == 1) {
    return texture(u_texture0, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  if (u_mode == 2) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture(u_texture0, uv);
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return u_edgeColor;
  return texture(u_texture0, uv);
}

void main() {
  vec4 mapSample = texture(u_texture1, v_texCoord);
  float mx = getChannel(mapSample, u_componentX);
  float my = getChannel(mapSample, u_componentY);
  vec2 offset = vec2((mx - 0.5) * u_scaleX, (my - 0.5) * u_scaleY) * u_texelSize;
  fragColor = sampleSource(v_texCoord + offset);
}";

/// Applies a displacement map warp to `source`, writing to `dest`.
///
/// `map` supplies the per-pixel displacement vectors; channels are selected by
/// `filter.component_x` and `filter.component_y` (0=R, 1=G, 2=B, 3=A).
/// A single GPU pass — no scratch targets needed.
pub fn apply_displacement_map_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    map: &GlRenderTarget,
    dest: &GlRenderTarget,
    filter: &DisplacementMapFilter,
) {
    let mode = mode_index(filter.mode.unwrap_or(DisplacementMapMode::Wrap));
    let edge_color = filter.color.unwrap_or(0);
    let edge_alpha = filter.alpha.unwrap_or(0.0);
    let scale_x = filter.scale_x.unwrap_or(0.0);
    let scale_y = filter.scale_y.unwrap_or(0.0);
    let component_x = filter.component_x.unwrap_or(0) as i32;
    let component_y = filter.component_y.unwrap_or(1) as i32;
    let (tx, ty) = (1.0 / source.width as f32, 1.0 / source.height as f32);

    let program = get_displacement_map_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture, map.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(gl.get_uniform_location(p, "u_texelSize").as_ref(), tx, ty);
            gl.uniform_1_i32(gl.get_uniform_location(p, "u_componentX").as_ref(), component_x);
            gl.uniform_1_i32(gl.get_uniform_location(p, "u_componentY").as_ref(), component_y);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_scaleX").as_ref(), scale_x);
            gl.uniform_1_f32(gl.get_uniform_location(p, "u_scaleY").as_ref(), scale_y);
            gl.uniform_1_i32(gl.get_uniform_location(p, "u_mode").as_ref(), mode);
            gl.uniform_4_f32(
                gl.get_uniform_location(p, "u_edgeColor").as_ref(),
                ((edge_color >> 16) & 0xff) as f32 / 255.0,
                ((edge_color >> 8) & 0xff) as f32 / 255.0,
                (edge_color & 0xff) as f32 / 255.0,
                edge_alpha,
            );
        },
    );
}

/// Returns the displacement-map shader program for `state`, compiling on first use.
pub fn get_displacement_map_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, DISPLACEMENT_MAP_FRAGMENT_SRC, |p| &mut p.displacement_map)
}

// Maps a `DisplacementMapMode` to the integer mode constant the shader expects.
fn mode_index(mode: DisplacementMapMode) -> i32 {
    match mode {
        DisplacementMapMode::Wrap => 0,
        DisplacementMapMode::Clamp => 1,
        DisplacementMapMode::Ignore => 2,
        DisplacementMapMode::Color => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // DISPLACEMENT_MAP_FRAGMENT_SRC

    #[test]
    fn displacement_map_fragment_src_offsets_by_map_channels() {
        assert!(DISPLACEMENT_MAP_FRAGMENT_SRC.contains("uniform sampler2D u_texture1"));
        assert!(DISPLACEMENT_MAP_FRAGMENT_SRC.contains("(mx - 0.5) * u_scaleX"));
    }

    // mode_index

    #[test]
    fn mode_index_matches_shader_constants() {
        assert_eq!(mode_index(DisplacementMapMode::Wrap), 0);
        assert_eq!(mode_index(DisplacementMapMode::Clamp), 1);
        assert_eq!(mode_index(DisplacementMapMode::Ignore), 2);
        assert_eq!(mode_index(DisplacementMapMode::Color), 3);
    }
}
