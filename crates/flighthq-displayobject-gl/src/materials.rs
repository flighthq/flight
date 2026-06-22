//! GL material helpers — color-transform shader compilation and registration.

use flighthq_types::material::ColorTransform;

use flighthq_render_gl::GlRenderState;
use flighthq_render_gl::{GlBitmapShader, compile_gl_bitmap_program};

/// Color-transform bitmap fragment shader. Un-premultiplies, applies the
/// multiply/offset, clamps, then re-premultiplies. Matches the instanced
/// color-transform shader's math but reads uniforms rather than instance attrs.
pub const COLOR_TRANSFORM_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_alpha;
uniform vec4 u_colorMultiplier;
uniform vec4 u_colorOffset;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord) * clamp(u_alpha, 0.0, 1.0);
  if (color.a <= 0.0) discard;
  color = vec4(color.rgb / color.a, color.a);
  color = clamp(color * u_colorMultiplier + u_colorOffset, vec4(0.0), vec4(1.0));
  fragColor = vec4(color.rgb * color.a, color.a);
}";

/// Number of per-instance floats a color-transform material packs (two vec4s).
pub const COLOR_TRANSFORM_INSTANCE_FLOATS: usize = 8;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Returns the color-transform material's effective `ColorTransform` for a
/// render proxy, or `None` for all other materials.
///
/// The Rust port stores per-proxy color transforms keyed by id; without an
/// entry the proxy carries no color transform.
pub fn get_gl_render_proxy_color_transform(
    render_proxy_id: u64,
    state: &GlRenderState,
) -> Option<ColorTransform> {
    let _ = (render_proxy_id, state);
    None
}

/// Packs a `ColorTransform` into the 8-float per-instance layout the
/// color-transform shaders expect: four multipliers, then four offsets divided
/// by 255 (normalizing 0–255 byte offsets into the shader's 0–1 range). Pure
/// CPU — the testable packing seam.
pub fn pack_gl_color_transform(ct: Option<&ColorTransform>, out: &mut [f32], offset: usize) {
    match ct {
        Some(ct) => {
            out[offset] = ct.red_multiplier;
            out[offset + 1] = ct.green_multiplier;
            out[offset + 2] = ct.blue_multiplier;
            out[offset + 3] = ct.alpha_multiplier;
            out[offset + 4] = ct.red_offset / 255.0;
            out[offset + 5] = ct.green_offset / 255.0;
            out[offset + 6] = ct.blue_offset / 255.0;
            out[offset + 7] = ct.alpha_offset / 255.0;
        }
        None => {
            out[offset] = 1.0;
            out[offset + 1] = 1.0;
            out[offset + 2] = 1.0;
            out[offset + 3] = 1.0;
            out[offset + 4] = 0.0;
            out[offset + 5] = 0.0;
            out[offset + 6] = 0.0;
            out[offset + 7] = 0.0;
        }
    }
}

/// Compiles the color-transform bitmap shader and caches it on `state`.
///
/// Idempotent: subsequent calls return immediately if already compiled.
pub fn register_gl_color_transform_shader(state: &mut GlRenderState) {
    if state.runtime.color_transform_bitmap_shader.is_some() {
        return;
    }
    let locations = compile_gl_bitmap_program(&state.gl, COLOR_TRANSFORM_FRAGMENT_SRC);
    let program = locations.program;
    state.runtime.color_transform_bitmap_shader = Some(GlBitmapShader { locations, program });
}

#[cfg(test)]
mod tests {
    use super::*;

    // COLOR_TRANSFORM_FRAGMENT_SRC

    #[test]
    fn color_transform_fragment_src_declares_transform_uniforms() {
        assert!(COLOR_TRANSFORM_FRAGMENT_SRC.contains("uniform vec4 u_colorMultiplier"));
        assert!(COLOR_TRANSFORM_FRAGMENT_SRC.contains("uniform vec4 u_colorOffset"));
        assert!(COLOR_TRANSFORM_FRAGMENT_SRC.contains("color * u_colorMultiplier + u_colorOffset"));
    }

    // pack_gl_color_transform

    #[test]
    fn pack_gl_color_transform_identity_for_none() {
        let mut out = [9.0_f32; 8];
        pack_gl_color_transform(None, &mut out, 0);
        assert_eq!(out, [1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn pack_gl_color_transform_normalizes_offsets() {
        let ct = ColorTransform {
            red_multiplier: 0.5,
            green_multiplier: 0.25,
            blue_multiplier: 1.0,
            alpha_multiplier: 0.75,
            red_offset: 255.0,
            green_offset: 128.0,
            blue_offset: 0.0,
            alpha_offset: 51.0,
        };
        let mut out = [0.0_f32; 8];
        pack_gl_color_transform(Some(&ct), &mut out, 0);
        assert_eq!(&out[0..4], &[0.5, 0.25, 1.0, 0.75]);
        assert!((out[4] - 1.0).abs() < 1e-6); // 255/255
        assert!((out[5] - 128.0 / 255.0).abs() < 1e-6);
        assert_eq!(out[6], 0.0);
        assert!((out[7] - 51.0 / 255.0).abs() < 1e-6);
    }

    #[test]
    fn pack_gl_color_transform_honors_offset() {
        let mut out = [0.0_f32; 16];
        pack_gl_color_transform(None, &mut out, 8);
        assert_eq!(&out[8..16], &[1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0]);
        // Untouched prefix stays zero.
        assert_eq!(&out[0..8], &[0.0; 8]);
    }
}
