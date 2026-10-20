use flight_bitmap::*;

mod convert_bitmap_pixel_order_fn {
    use super::*;

    #[test]
    fn rgba_to_bgra_swaps_red_and_blue() {
        let src = [0xAA, 0xBB, 0xCC, 0xDD];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut out, &src, 4, PixelOrder::Rgba, PixelOrder::Bgra);
        assert_eq!(out, [0xCC, 0xBB, 0xAA, 0xDD]);
    }

    #[test]
    fn same_order_copies() {
        let src = [1, 2, 3, 4];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut out, &src, 4, PixelOrder::Rgba, PixelOrder::Rgba);
        assert_eq!(out, [1, 2, 3, 4]);
    }
}

mod premultiply_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn halves_channels_at_half_alpha() {
        let src = [200, 100, 50, 128];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut out, &src, 4);
        assert!((out[0] as i32 - 100).abs() <= 1);
        assert!((out[1] as i32 - 50).abs() <= 1);
        assert_eq!(out[3], 128);
    }

    #[test]
    fn full_alpha_preserves_channels() {
        let src = [200, 100, 50, 255];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut out, &src, 4);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
    }
}

mod unpremultiply_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn round_trips_with_premultiply() {
        let original = [200, 100, 50, 128];
        let mut premul = [0u8; 4];
        premultiply_bitmap_pixels(&mut premul, &original, 4);
        let mut restored = [0u8; 4];
        unpremultiply_bitmap_pixels(&mut restored, &premul, 4);
        for c in 0..3 {
            assert!((restored[c] as i32 - original[c] as i32).abs() <= 1);
        }
        assert_eq!(restored[3], original[3]);
    }

    #[test]
    fn zero_alpha_produces_zero() {
        let src = [0, 0, 0, 0];
        let mut out = [0u8; 4];
        unpremultiply_bitmap_pixels(&mut out, &src, 4);
        assert_eq!(out, [0, 0, 0, 0]);
    }
}
