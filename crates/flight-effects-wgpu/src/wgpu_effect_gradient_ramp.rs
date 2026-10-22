// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the cached ramp is a host-supplied wgpu texture
//! Cached 256-entry gradient ramp textures for the gradient recipes (TS
//! `wgpuEffectGradientRamp.ts`).

use flight_render_wgpu::{WgpuRenderState, get_wgpu_render_state_native_device, write_wgpu_texture};

use crate::wgpu_effect_runtime::get_wgpu_effect_runtime;

// Builds a 256-entry RGBA gradient ramp texture on the GPU. The texture is cached and owned by the
// render state, so it is never destroyed mid-encoder.
fn create_wgpu_effect_gradient_ramp_texture(
    state: &mut WgpuRenderState,
    colors: &[u32],
    alphas: &[f32],
    ratios: &[f32],
) -> wgpu::Texture {
    let data = build_ramp_data(colors, alphas, ratios);
    let native = get_wgpu_render_state_native_device(state);
    let texture = native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 256,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    write_wgpu_texture(
        &native,
        wgpu::TexelCopyTextureInfo {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &data,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(256 * 4),
            rows_per_image: None,
        },
        wgpu::Extent3d {
            width: 256,
            height: 1,
            depth_or_array_layers: 1,
        },
    );
    return texture;
}

// Out-of-range reads are JS `undefined`: arithmetic on them is NaN, which a Uint8ClampedArray
// stores as 0, and comparisons with them are false.
fn alpha_at(alphas: &[f32], index: usize) -> f32 {
    return alphas.get(index).copied().unwrap_or(f32::NAN);
}

fn build_ramp_data(colors: &[u32], alphas: &[f32], ratios: &[f32]) -> Vec<u8> {
    let mut out = vec![0_u8; 256 * 4];
    if colors.is_empty() {
        return out;
    }
    for i in 0..256 {
        let t = i as f32;
        let mut r = 0.0_f32;
        let mut g = 0.0_f32;
        let mut b = 0.0_f32;
        let mut a = 0.0_f32;

        if t <= ratio_at(ratios, 0) {
            let c = colors[0];
            r = ((c >> 16) & 0xff) as f32;
            g = ((c >> 8) & 0xff) as f32;
            b = (c & 0xff) as f32;
            a = js_round(alpha_at(alphas, 0) * 255.0);
        } else if t >= ratio_at(ratios, ratios.len().wrapping_sub(1)) {
            let c = colors[colors.len() - 1];
            r = ((c >> 16) & 0xff) as f32;
            g = ((c >> 8) & 0xff) as f32;
            b = (c & 0xff) as f32;
            a = js_round(alpha_at(alphas, alphas.len().wrapping_sub(1)) * 255.0);
        } else {
            let mut j = 0;
            while j + 1 < ratios.len() {
                let r0 = ratios[j];
                let r1 = ratios[j + 1];
                if t >= r0 && t <= r1 {
                    let blend = if r1 > r0 { (t - r0) / (r1 - r0) } else { 0.0 };
                    let c0 = color_at(colors, j);
                    let c1 = color_at(colors, j + 1);
                    r = js_round(((c0 >> 16) & 0xff) as f32 * (1.0 - blend) + ((c1 >> 16) & 0xff) as f32 * blend);
                    g = js_round(((c0 >> 8) & 0xff) as f32 * (1.0 - blend) + ((c1 >> 8) & 0xff) as f32 * blend);
                    b = js_round((c0 & 0xff) as f32 * (1.0 - blend) + (c1 & 0xff) as f32 * blend);
                    a = js_round(
                        alpha_at(alphas, j) * 255.0 * (1.0 - blend)
                            + alpha_at(alphas, j + 1) * 255.0 * blend,
                    );
                    break;
                }
                j += 1;
            }
        }

        out[i * 4] = to_clamped_u8(r);
        out[i * 4 + 1] = to_clamped_u8(g);
        out[i * 4 + 2] = to_clamped_u8(b);
        out[i * 4 + 3] = to_clamped_u8(a);
    }
    return out;
}

fn color_at(colors: &[u32], index: usize) -> u32 {
    return colors.get(index).copied().unwrap_or(0);
}

/// A cached 256-entry RGBA gradient ramp texture for the given stops, built on first use and reused
/// for the same stops (TS `getWgpuEffectGradientRampTexture`). The texture is owned by the render
/// state and lives as long as it: callers must NOT destroy it, because a recipe runs inside the
/// frame's command encoder and cannot control submit timing. Distinct stop sets get distinct
/// textures, so several gradient recipes in one frame never alias each other's ramp.
///
/// `ratios` are in byte scale [0, 255]; `colors` are packed RGB integers; `alphas` are in [0, 1].
#[allow(clippy::ptr_arg)] // the read-only `&Vec<N>` vocabulary row: TS `readonly number[]`
pub fn get_wgpu_effect_gradient_ramp_texture(
    state: &mut WgpuRenderState,
    colors: &Vec<u32>,
    alphas: &Vec<f32>,
    ratios: &Vec<f32>,
) -> wgpu::Texture {
    let key = format!(
        "{}|{}|{}",
        join_numbers(colors.iter().map(|value| *value as f32)),
        join_numbers(alphas.iter().copied()),
        join_numbers(ratios.iter().copied())
    );
    if let Some(texture) = get_wgpu_effect_runtime(state).ramp_textures.get(&key) {
        return texture.clone();
    }
    let texture = create_wgpu_effect_gradient_ramp_texture(state, colors, alphas, ratios);
    get_wgpu_effect_runtime(state)
        .ramp_textures
        .insert(key, texture.clone());
    return texture;
}

fn join_numbers(values: impl Iterator<Item = f32>) -> String {
    let parts: Vec<String> = values
        .map(crate::wgpu_effect_runtime::format_wgpu_effect_number)
        .collect();
    return parts.join(",");
}

fn js_round(value: f32) -> f32 {
    return (value + 0.5).floor();
}

fn ratio_at(ratios: &[f32], index: usize) -> f32 {
    return ratios.get(index).copied().unwrap_or(f32::NAN);
}

// Uint8ClampedArray stores: NaN becomes 0, values clamp to [0, 255] and round half to even.
fn to_clamped_u8(value: f32) -> u8 {
    if value.is_nan() {
        return 0;
    }
    return value.clamp(0.0, 255.0).round_ties_even() as u8;
}
