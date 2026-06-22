//! Core surface allocation: `create_surface` and `clone_surface`.

use flighthq_types::{AlphaType, ColorSpace, PixelFormat, Surface};

/// Returns a deep copy of `source` including a new pixel buffer.
pub fn clone_surface(source: &Surface) -> Surface {
    Surface {
        alpha_type: source.alpha_type,
        color_space: source.color_space,
        data: source.data.clone(),
        format: source.format,
        height: source.height,
        version: 0,
        width: source.width,
    }
}

/// Allocates a new `Surface` of the given dimensions. All pixels are
/// initialized to `color` (packed `0xRRGGBBAA`); passing `0` leaves the
/// buffer transparent black.
pub fn create_surface(width: u32, height: u32, color: u32) -> Surface {
    let len = (width as usize) * (height as usize) * 4;
    let mut data = vec![0u8; len];
    if color != 0 {
        let r = ((color >> 24) & 0xff) as u8;
        let g = ((color >> 16) & 0xff) as u8;
        let b = ((color >> 8) & 0xff) as u8;
        let a = (color & 0xff) as u8;
        let mut i = 0;
        while i < len {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
            i += 4;
        }
    }
    Surface {
        alpha_type: AlphaType::Straight,
        color_space: ColorSpace::Srgb,
        data,
        format: PixelFormat::Rgba8Unorm,
        height,
        version: 0,
        width,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_surface_transparent_by_default() {
        let s = create_surface(2, 2, 0);
        assert_eq!(s.width, 2);
        assert_eq!(s.height, 2);
        assert_eq!(s.data.len(), 16);
        assert!(s.data.iter().all(|&b| b == 0));
    }

    #[test]
    fn create_surface_fills_color() {
        let s = create_surface(2, 1, 0x11223344);
        assert_eq!(&s.data[0..4], &[0x11, 0x22, 0x33, 0x44]);
        assert_eq!(&s.data[4..8], &[0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn clone_surface_deep_copies_data() {
        let s = create_surface(2, 2, 0x11223344);
        let mut c = clone_surface(&s);
        c.data[0] = 0xff;
        assert_eq!(s.data[0], 0x11);
        assert_eq!(c.version, 0);
    }
}
