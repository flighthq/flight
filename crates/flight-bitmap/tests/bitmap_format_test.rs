use flight_bitmap::contract::*;

mod convert_bitmap_pixel_order_fn {
    use super::*;

    #[test]
    fn is_a_noop_when_from_equals_to() {
        let src = [0x11u8, 0x22, 0x33, 0xff];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut out, &src, 4, PixelOrder::Rgba, PixelOrder::Rgba);
        assert_eq!(out[0], 0x11);
        assert_eq!(out[1], 0x22);
    }

    #[test]
    fn converts_rgba_to_bgra() {
        let src = [0xAAu8, 0xBB, 0xCC, 0xFF];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut out, &src, 4, PixelOrder::Rgba, PixelOrder::Bgra);
        assert_eq!(out[0], 0xCC);
        assert_eq!(out[1], 0xBB);
        assert_eq!(out[2], 0xAA);
        assert_eq!(out[3], 0xFF);
    }

    #[test]
    fn converts_rgba_to_argb() {
        let src = [0xAAu8, 0xBB, 0xCC, 0xDD];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut out, &src, 4, PixelOrder::Rgba, PixelOrder::Argb);
        assert_eq!(out[0], 0xDD);
        assert_eq!(out[1], 0xAA);
        assert_eq!(out[2], 0xBB);
        assert_eq!(out[3], 0xCC);
    }

    #[test]
    fn round_trips_rgba_to_bgra_and_back() {
        let src = [0x11u8, 0x22, 0x33, 0x44];
        let mut tmp = [0u8; 4];
        let mut out = [0u8; 4];
        convert_bitmap_pixel_order(&mut tmp, &src, 4, PixelOrder::Rgba, PixelOrder::Bgra);
        convert_bitmap_pixel_order(&mut out, &tmp, 4, PixelOrder::Bgra, PixelOrder::Rgba);
        assert_eq!(out, [0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn is_safe_in_place_for_same_format() {
        let mut buf = [0xAAu8, 0xBB, 0xCC, 0xFF];
        let copy = buf;
        convert_bitmap_pixel_order(&mut buf, &copy, 4, PixelOrder::Rgba, PixelOrder::Rgba);
        assert_eq!(buf[0], 0xAA);
    }

    #[test]
    fn is_safe_in_place_for_different_formats() {
        let mut buf = [0xAAu8, 0xBB, 0xCC, 0xFF];
        let copy = buf;
        convert_bitmap_pixel_order(&mut buf, &copy, 4, PixelOrder::Rgba, PixelOrder::Bgra);
        assert_eq!(buf[0], 0xCC);
        assert_eq!(buf[2], 0xAA);
    }
}

mod premultiply_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn scales_rgb_by_alpha_over_255() {
        let src = [0xFFu8, 0x80, 0x00, 0x80];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut out, &src, 4);
        assert!((out[0] as i32 - 0x80).abs() <= 1);
        assert!((out[1] as i32 - 0x40).abs() <= 1);
        assert_eq!(out[2], 0);
        assert_eq!(out[3], 0x80);
    }

    #[test]
    fn fully_transparent_pixel_becomes_all_zeros() {
        let src = [0xFFu8, 0xFF, 0xFF, 0x00];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut out, &src, 4);
        assert_eq!(out[0], 0);
        assert_eq!(out[1], 0);
        assert_eq!(out[2], 0);
        assert_eq!(out[3], 0);
    }

    #[test]
    fn fully_opaque_pixel_is_unchanged() {
        let src = [0x11u8, 0x22, 0x33, 0xFF];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut out, &src, 4);
        assert_eq!(out[0], 0x11);
        assert_eq!(out[1], 0x22);
        assert_eq!(out[2], 0x33);
        assert_eq!(out[3], 0xFF);
    }

    #[test]
    fn is_safe_in_place() {
        let mut buf = [0xFFu8, 0x00, 0x00, 0x80];
        let copy = buf;
        premultiply_bitmap_pixels(&mut buf, &copy, 4);
        assert!((buf[0] as i32 - 0x80).abs() <= 1);
        assert_eq!(buf[3], 0x80);
    }
}

mod unpremultiply_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn recovers_original_rgb_after_premultiply_round_trip_within_1() {
        let source = [0xC0u8, 0x80, 0x40, 0x80];
        let mut premul = [0u8; 4];
        let mut out = [0u8; 4];
        premultiply_bitmap_pixels(&mut premul, &source, 4);
        unpremultiply_bitmap_pixels(&mut out, &premul, 4);
        assert!((out[0] as i32 - 0xC0).abs() <= 1);
        assert!((out[1] as i32 - 0x80).abs() <= 1);
        assert_eq!(out[3], 0x80);
    }

    #[test]
    fn fully_transparent_pixel_remains_all_zeros() {
        let src = [0u8, 0, 0, 0];
        let mut out = [0u8; 4];
        unpremultiply_bitmap_pixels(&mut out, &src, 4);
        assert_eq!(out[0], 0);
        assert_eq!(out[3], 0);
    }

    #[test]
    fn is_safe_in_place() {
        let mut buf = [0x80u8, 0x00, 0x00, 0x80];
        let copy = buf;
        unpremultiply_bitmap_pixels(&mut buf, &copy, 4);
        assert!((buf[0] as i32 - 0xFF).abs() <= 1);
        assert_eq!(buf[3], 0x80);
    }
}
