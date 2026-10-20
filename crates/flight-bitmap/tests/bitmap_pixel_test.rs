use flight_bitmap::*;

mod get_bitmap_pixel_fn {
    use super::*;

    #[test]
    fn returns_packed_rgba() {
        let bmp = create_bitmap(2, 2, 0xaabbccdd);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0xaabbccdd);
    }
}

mod set_bitmap_pixel_fn {
    use super::*;

    #[test]
    fn writes_packed_rgba() {
        let mut bmp = create_bitmap(2, 2, 0);
        set_bitmap_pixel(&mut bmp, 1, 1, 0x11223344);
        assert_eq!(get_bitmap_pixel(&bmp, 1, 1), 0x11223344);
    }
}

mod get_bitmap_pixel_channel_fn {
    use super::*;

    #[test]
    fn returns_individual_channel() {
        let bmp = create_bitmap(1, 1, 0xaabbccdd);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Red), 0xaa);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Green), 0xbb);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Blue), 0xcc);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Alpha), 0xdd);
    }
}

mod get_bitmap_pixel_luminance_fn {
    use super::*;

    #[test]
    fn white_has_luminance_255() {
        let bmp = create_bitmap(1, 1, 0xffffffff);
        assert_eq!(get_bitmap_pixel_luminance(&bmp, 0, 0), 255);
    }

    #[test]
    fn black_has_luminance_zero() {
        let bmp = create_bitmap(1, 1, 0x000000ff);
        assert_eq!(get_bitmap_pixel_luminance(&bmp, 0, 0), 0);
    }
}

mod get_bitmap_pixel_rgb_fn {
    use super::*;

    #[test]
    fn returns_packed_rgb_without_alpha() {
        let bmp = create_bitmap(1, 1, 0xaabbccdd);
        assert_eq!(get_bitmap_pixel_rgb(&bmp, 0, 0), 0xaabbcc);
    }
}

mod set_bitmap_pixel_rgb_fn {
    use super::*;

    #[test]
    fn writes_rgb_preserves_alpha() {
        let mut bmp = create_bitmap(1, 1, 0x000000ff);
        set_bitmap_pixel_rgb(&mut bmp, 0, 0, 0xaabbcc);
        assert_eq!(get_bitmap_pixel_rgb(&bmp, 0, 0), 0xaabbcc);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Alpha), 0xff);
    }
}
