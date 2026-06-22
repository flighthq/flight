//! Gradient ramp texture creation for GL filter passes.

use glow::HasContext;

use crate::GlRenderState;

/// Builds a 256-entry RGBA gradient ramp texture on the GPU.
///
/// The caller owns the returned texture and **must** delete it with
/// `gl.delete_texture(texture)` when done.
///
/// `ratios` are in byte scale [0, 255]. `colors` are packed RGB integers.
/// `alphas` are in [0.0, 1.0].
pub fn create_gl_gradient_ramp_texture(
    state: &GlRenderState,
    colors: &[u32],
    alphas: &[f32],
    ratios: &[u8],
) -> glow::Texture {
    let mut data = [0u8; 1024];
    build_gradient_ramp_data(&mut data, colors, alphas, ratios);

    let gl = &state.gl;
    unsafe {
        let texture = gl.create_texture().expect("create gradient ramp texture");
        gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA8 as i32,
            256,
            1,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            Some(&data),
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MIN_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MAG_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.bind_texture(glow::TEXTURE_2D, None);
        texture
    }
}

/// Fills a 256×4-byte buffer with the interpolated gradient RGBA data.
/// Shared by `create_gl_gradient_ramp_texture` and any CPU-side path that
/// needs a gradient ramp as raw bytes.
pub fn build_gradient_ramp_data(
    out: &mut [u8; 1024],
    colors: &[u32],
    alphas: &[f32],
    ratios: &[u8],
) {
    out.fill(0);
    if colors.is_empty() {
        return;
    }

    let last = ratios.len() - 1;
    for i in 0..256usize {
        let t = i as i32;
        let (r, g, b, a);

        if t <= ratios[0] as i32 {
            let c = colors[0];
            r = ((c >> 16) & 0xff) as u8;
            g = ((c >> 8) & 0xff) as u8;
            b = (c & 0xff) as u8;
            a = (alphas[0] * 255.0).round().clamp(0.0, 255.0) as u8;
        } else if t >= ratios[last] as i32 {
            let c = colors[colors.len() - 1];
            r = ((c >> 16) & 0xff) as u8;
            g = ((c >> 8) & 0xff) as u8;
            b = (c & 0xff) as u8;
            a = (alphas[alphas.len() - 1] * 255.0).round().clamp(0.0, 255.0) as u8;
        } else {
            let mut rr = 0u8;
            let mut gg = 0u8;
            let mut bb = 0u8;
            let mut aa = 0u8;
            for j in 0..ratios.len() - 1 {
                let r0 = ratios[j] as i32;
                let r1 = ratios[j + 1] as i32;
                if t >= r0 && t <= r1 {
                    let blend = if r1 > r0 {
                        (t - r0) as f32 / (r1 - r0) as f32
                    } else {
                        0.0
                    };
                    let c0 = colors[j];
                    let c1 = colors[j + 1];
                    rr = lerp_channel((c0 >> 16) & 0xff, (c1 >> 16) & 0xff, blend);
                    gg = lerp_channel((c0 >> 8) & 0xff, (c1 >> 8) & 0xff, blend);
                    bb = lerp_channel(c0 & 0xff, c1 & 0xff, blend);
                    aa = ((alphas[j] * 255.0) * (1.0 - blend) + (alphas[j + 1] * 255.0) * blend)
                        .round()
                        .clamp(0.0, 255.0) as u8;
                    break;
                }
            }
            r = rr;
            g = gg;
            b = bb;
            a = aa;
        }

        out[i * 4] = r;
        out[i * 4 + 1] = g;
        out[i * 4 + 2] = b;
        out[i * 4 + 3] = a;
    }
}

// Linearly interpolates two byte channels by `blend` and rounds to a byte.
fn lerp_channel(c0: u32, c1: u32, blend: f32) -> u8 {
    (c0 as f32 * (1.0 - blend) + c1 as f32 * blend)
        .round()
        .clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_gradient_ramp_data

    #[test]
    fn build_gradient_ramp_data_empty_colors_is_all_zero() {
        let mut out = [0xffu8; 1024];
        build_gradient_ramp_data(&mut out, &[], &[], &[]);
        assert!(out.iter().all(|&b| b == 0));
    }

    #[test]
    fn build_gradient_ramp_data_endpoints_match_colors() {
        let mut out = [0u8; 1024];
        build_gradient_ramp_data(&mut out, &[0xff0000, 0x0000ff], &[1.0, 1.0], &[0, 255]);
        // Index 0 is the first color (red), index 255 the last (blue).
        assert_eq!(&out[0..4], &[0xff, 0x00, 0x00, 0xff]);
        assert_eq!(&out[1020..1024], &[0x00, 0x00, 0xff, 0xff]);
    }

    #[test]
    fn build_gradient_ramp_data_midpoint_blends() {
        let mut out = [0u8; 1024];
        build_gradient_ramp_data(&mut out, &[0x000000, 0xffffff], &[1.0, 1.0], &[0, 255]);
        // Around the middle the channels should be roughly half-bright.
        let mid = out[128 * 4];
        assert!((100..=156).contains(&mid), "mid channel {mid} not near 128");
    }

    // lerp_channel

    #[test]
    fn lerp_channel_interpolates_halfway() {
        assert_eq!(lerp_channel(0, 255, 0.5), 128);
    }
}
