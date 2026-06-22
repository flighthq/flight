//! Gradient ramp texture creation for wgpu filter passes.

use flighthq_render_wgpu::WgpuRenderState;

/// Builds a 256-entry RGBA gradient ramp texture on the GPU.
///
/// The caller owns the returned texture and **must** call `texture.destroy()`
/// when done.
///
/// `ratios` are in byte scale [0, 255]. `colors` are packed RGB integers.
/// `alphas` are in [0.0, 1.0].
pub fn create_wgpu_gradient_ramp_texture(
    state: &WgpuRenderState,
    colors: &[u32],
    alphas: &[f32],
    ratios: &[u8],
) -> wgpu::Texture {
    let mut data = [0u8; 1024];
    build_gradient_ramp_data(&mut data, colors, alphas, ratios);

    let texture = state.device.create_texture(&wgpu::TextureDescriptor {
        label: Some("flight-wgpu-gradient-ramp"),
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

    state.queue.write_texture(
        wgpu::ImageCopyTexture {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        &data,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(256 * 4),
            rows_per_image: Some(1),
        },
        wgpu::Extent3d {
            width: 256,
            height: 1,
            depth_or_array_layers: 1,
        },
    );

    texture
}

/// Fills a 256×4-byte buffer with the interpolated gradient RGBA data.
///
/// Shared by `create_wgpu_gradient_ramp_texture` and any CPU-side path that needs
/// a gradient ramp as raw bytes. Positions before the first ratio hold the first
/// color; positions past the last ratio hold the last color; positions between
/// adjacent ratios linearly interpolate RGB and alpha.
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
    for t in 0..256usize {
        let (mut r, mut g, mut b, mut a) = (0u8, 0u8, 0u8, 0u8);

        if t as u8 <= ratios[0] {
            let c = colors[0];
            r = ((c >> 16) & 0xff) as u8;
            g = ((c >> 8) & 0xff) as u8;
            b = (c & 0xff) as u8;
            a = (alphas[0] * 255.0).round() as u8;
        } else if t as u8 >= ratios[last] {
            let c = colors[colors.len() - 1];
            r = ((c >> 16) & 0xff) as u8;
            g = ((c >> 8) & 0xff) as u8;
            b = (c & 0xff) as u8;
            a = (alphas[alphas.len() - 1] * 255.0).round() as u8;
        } else {
            for j in 0..last {
                let r0 = ratios[j];
                let r1 = ratios[j + 1];
                if t as u8 >= r0 && t as u8 <= r1 {
                    let blend = if r1 > r0 {
                        (t as f32 - r0 as f32) / (r1 as f32 - r0 as f32)
                    } else {
                        0.0
                    };
                    let c0 = colors[j];
                    let c1 = colors[j + 1];
                    r = lerp_channel((c0 >> 16) & 0xff, (c1 >> 16) & 0xff, blend);
                    g = lerp_channel((c0 >> 8) & 0xff, (c1 >> 8) & 0xff, blend);
                    b = lerp_channel(c0 & 0xff, c1 & 0xff, blend);
                    a = (alphas[j] * 255.0 * (1.0 - blend) + alphas[j + 1] * 255.0 * blend).round()
                        as u8;
                    break;
                }
            }
        }

        let i = t * 4;
        out[i] = r;
        out[i + 1] = g;
        out[i + 2] = b;
        out[i + 3] = a;
    }
}

// Linearly interpolates two byte channels and rounds to the nearest byte.
fn lerp_channel(c0: u32, c1: u32, blend: f32) -> u8 {
    (c0 as f32 * (1.0 - blend) + c1 as f32 * blend).round() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    // build_gradient_ramp_data

    #[test]
    fn build_gradient_ramp_data_empty_colors_leaves_zeroed() {
        let mut out = [7u8; 1024];
        build_gradient_ramp_data(&mut out, &[], &[], &[]);
        assert!(out.iter().all(|&b| b == 0));
    }

    #[test]
    fn build_gradient_ramp_data_holds_endpoints() {
        let mut out = [0u8; 1024];
        // Black at ratio 0, white at ratio 255, both fully opaque.
        build_gradient_ramp_data(&mut out, &[0x000000, 0xffffff], &[1.0, 1.0], &[0, 255]);
        // Entry 0 is the first color (black, opaque).
        assert_eq!(&out[0..4], &[0, 0, 0, 255]);
        // Entry 255 is the last color (white, opaque).
        assert_eq!(&out[255 * 4..255 * 4 + 4], &[255, 255, 255, 255]);
    }

    #[test]
    fn build_gradient_ramp_data_interpolates_midpoint() {
        let mut out = [0u8; 1024];
        build_gradient_ramp_data(&mut out, &[0x000000, 0xffffff], &[0.0, 1.0], &[0, 255]);
        // Near the middle, RGB and alpha should be roughly half.
        let mid = 128 * 4;
        assert!((120..=136).contains(&(out[mid] as i32)));
        assert!((120..=136).contains(&(out[mid + 3] as i32)));
    }

    #[test]
    fn build_gradient_ramp_data_before_first_ratio_holds_first_color() {
        let mut out = [0u8; 1024];
        // First ratio at 100: everything below holds the first color (red).
        build_gradient_ramp_data(&mut out, &[0xff0000, 0x00ff00], &[1.0, 1.0], &[100, 200]);
        assert_eq!(&out[0..4], &[255, 0, 0, 255]);
        assert_eq!(&out[50 * 4..50 * 4 + 4], &[255, 0, 0, 255]);
    }
}
