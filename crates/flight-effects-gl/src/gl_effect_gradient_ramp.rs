// flight-lint: allow-file(contract-vocabulary) D17 the ramp is a native glow texture name with Result diagnostics
//! Builds 256-entry RGBA gradient ramps on the GPU for the gradient bevel/glow recipes.

use glow::{HasContext, NativeTexture};

/// Builds a 256-entry RGBA gradient ramp on the GPU. The caller owns the returned texture and must
/// delete it with `delete_texture` when done. `ratios` are in byte scale [0,255]. Colors are packed
/// RGB integers (0xRRGGBB). `alphas` are in [0,1].
#[allow(clippy::ptr_arg)]
pub fn create_gl_effect_gradient_ramp_texture(
    gl: &glow::Context,
    colors: &Vec<u32>,
    alphas: &Vec<f32>,
    ratios: &Vec<f32>,
) -> Result<NativeTexture, String> {
    let data = build_ramp_data(colors, alphas, ratios);
    // SAFETY: allocation, upload and sampler policy target the texture bound here; it is unbound
    // before returning.
    unsafe {
        let texture = gl
            .create_texture()
            .map_err(|error| format!("createGlEffectGradientRampTexture: {error}"))?;
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
            glow::PixelUnpackData::Slice(Some(&data)),
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
        return Ok(texture);
    }
}

fn build_ramp_data(colors: &[u32], alphas: &[f32], ratios: &[f32]) -> Vec<u8> {
    let mut out = vec![0_u8; 256 * 4];
    if colors.is_empty() {
        return out;
    }

    for i in 0..256_usize {
        let t = i as f32;
        let mut r = 0.0_f32;
        let mut g = 0.0_f32;
        let mut b = 0.0_f32;
        let mut a = 0.0_f32;

        if t <= ratios[0] {
            let c = colors[0];
            r = ((c >> 16) & 0xff) as f32;
            g = ((c >> 8) & 0xff) as f32;
            b = (c & 0xff) as f32;
            a = round_half_up(alphas[0] * 255.0);
        } else if t >= ratios[ratios.len() - 1] {
            let c = colors[colors.len() - 1];
            r = ((c >> 16) & 0xff) as f32;
            g = ((c >> 8) & 0xff) as f32;
            b = (c & 0xff) as f32;
            a = round_half_up(alphas[alphas.len() - 1] * 255.0);
        } else {
            for j in 0..ratios.len() - 1 {
                let r0 = ratios[j];
                let r1 = ratios[j + 1];
                if t >= r0 && t <= r1 {
                    let blend = if r1 > r0 { (t - r0) / (r1 - r0) } else { 0.0 };
                    let c0 = colors[j];
                    let c1 = colors[j + 1];
                    r = round_half_up(
                        ((c0 >> 16) & 0xff) as f32 * (1.0 - blend)
                            + ((c1 >> 16) & 0xff) as f32 * blend,
                    );
                    g = round_half_up(
                        ((c0 >> 8) & 0xff) as f32 * (1.0 - blend)
                            + ((c1 >> 8) & 0xff) as f32 * blend,
                    );
                    b = round_half_up(
                        (c0 & 0xff) as f32 * (1.0 - blend) + (c1 & 0xff) as f32 * blend,
                    );
                    a = round_half_up(
                        alphas[j] * 255.0 * (1.0 - blend) + alphas[j + 1] * 255.0 * blend,
                    );
                    break;
                }
            }
        }

        out[i * 4] = to_clamped_u8(r);
        out[i * 4 + 1] = to_clamped_u8(g);
        out[i * 4 + 2] = to_clamped_u8(b);
        out[i * 4 + 3] = to_clamped_u8(a);
    }

    return out;
}

/// JS `Math.round`: halves round toward +infinity.
fn round_half_up(value: f32) -> f32 {
    return (value + 0.5).floor();
}

/// TS writes into a `Uint8ClampedArray`; the clamp is explicit here (D0 pixel exception).
fn to_clamped_u8(value: f32) -> u8 {
    return value.round().clamp(0.0, 255.0) as u8;
}
