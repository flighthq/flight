//! Single-pixel read and write operations on surfaces.

use flighthq_types::{ImageChannel, Surface};

// W3C luma coefficients for perceptual luminance (same as CSS saturate/grayscale).
const LUMA_R: f32 = 0.2126;
const LUMA_G: f32 = 0.7152;
const LUMA_B: f32 = 0.0722;

/// Returns the packed `0xRRGGBBAA` color at pixel `(x, y)`.
pub fn get_surface_pixel(source: &Surface, x: u32, y: u32) -> u32 {
    let i = ((y * source.width + x) * 4) as usize;
    let d = &source.data;
    ((d[i] as u32) << 24) | ((d[i + 1] as u32) << 16) | ((d[i + 2] as u32) << 8) | (d[i + 3] as u32)
}

/// Returns the 0..255 value of one channel at pixel `(x, y)`.
pub fn get_surface_pixel_channel(source: &Surface, x: u32, y: u32, channel: ImageChannel) -> u8 {
    source.data[((y * source.width + x) * 4) as usize + channel as usize]
}

/// Returns the perceptual luminance (W3C luma coefficients) at pixel `(x, y)`,
/// in the range 0..255.
pub fn get_surface_pixel_luminance(source: &Surface, x: u32, y: u32) -> u8 {
    let i = ((y * source.width + x) * 4) as usize;
    let d = &source.data;
    (d[i] as f32 * LUMA_R + d[i + 1] as f32 * LUMA_G + d[i + 2] as f32 * LUMA_B).round() as u8
}

/// Returns the packed `0xRRGGBB` RGB color at pixel `(x, y)` (alpha ignored).
pub fn get_surface_pixel_rgb(source: &Surface, x: u32, y: u32) -> u32 {
    let i = ((y * source.width + x) * 4) as usize;
    let d = &source.data;
    ((d[i] as u32) << 16) | ((d[i + 1] as u32) << 8) | (d[i + 2] as u32)
}

/// Writes a packed `0xRRGGBBAA` color at pixel `(x, y)` and bumps the version.
pub fn set_surface_pixel(out: &mut Surface, x: u32, y: u32, color: u32) {
    let i = ((y * out.width + x) * 4) as usize;
    out.data[i] = ((color >> 24) & 0xff) as u8;
    out.data[i + 1] = ((color >> 16) & 0xff) as u8;
    out.data[i + 2] = ((color >> 8) & 0xff) as u8;
    out.data[i + 3] = (color & 0xff) as u8;
    out.version = out.version.wrapping_add(1);
}

/// Writes a packed `0xRRGGBB` RGB color at pixel `(x, y)`, leaving alpha
/// unchanged, and bumps the version.
pub fn set_surface_pixel_rgb(out: &mut Surface, x: u32, y: u32, color: u32) {
    let i = ((y * out.width + x) * 4) as usize;
    out.data[i] = ((color >> 16) & 0xff) as u8;
    out.data[i + 1] = ((color >> 8) & 0xff) as u8;
    out.data[i + 2] = (color & 0xff) as u8;
    out.version = out.version.wrapping_add(1);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surface::create_surface;

    #[test]
    fn get_surface_pixel_reads_rgba() {
        let mut s = create_surface(1, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0x11223344);
        assert_eq!(get_surface_pixel(&s, 0, 0), 0x11223344);
    }

    #[test]
    fn get_surface_pixel_channel_selects_channel() {
        let mut s = create_surface(1, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0x11223344);
        assert_eq!(get_surface_pixel_channel(&s, 0, 0, ImageChannel::Red), 0x11);
        assert_eq!(
            get_surface_pixel_channel(&s, 0, 0, ImageChannel::Green),
            0x22
        );
        assert_eq!(
            get_surface_pixel_channel(&s, 0, 0, ImageChannel::Blue),
            0x33
        );
        assert_eq!(
            get_surface_pixel_channel(&s, 0, 0, ImageChannel::Alpha),
            0x44
        );
    }

    #[test]
    fn get_surface_pixel_luminance_weighted() {
        let mut s = create_surface(1, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0xffffff00);
        assert_eq!(get_surface_pixel_luminance(&s, 0, 0), 255);
        set_surface_pixel(&mut s, 0, 0, 0x00000000);
        assert_eq!(get_surface_pixel_luminance(&s, 0, 0), 0);
    }

    #[test]
    fn get_surface_pixel_rgb_strips_alpha() {
        let mut s = create_surface(1, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0x112233ff);
        assert_eq!(get_surface_pixel_rgb(&s, 0, 0), 0x112233);
    }

    #[test]
    fn set_surface_pixel_writes_rgba() {
        let mut s = create_surface(1, 1, 0);
        set_surface_pixel(&mut s, 0, 0, 0xaabbccdd);
        assert_eq!(&s.data[0..4], &[0xaa, 0xbb, 0xcc, 0xdd]);
        assert_eq!(s.version, 1);
    }

    #[test]
    fn set_surface_pixel_rgb_preserves_alpha() {
        let mut s = create_surface(1, 1, 0x000000ff);
        set_surface_pixel_rgb(&mut s, 0, 0, 0x112233);
        assert_eq!(&s.data[0..4], &[0x11, 0x22, 0x33, 0xff]);
    }
}
