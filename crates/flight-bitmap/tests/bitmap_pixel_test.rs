use flight_bitmap::*;

mod get_bitmap_pixel_fn {
    use super::*;

    #[test]
    fn reads_back_a_full_rgba_value_written_by_set_bitmap_pixel() {
        let mut bmp = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0xaabbcc80);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0xaabbcc80);
    }

    #[test]
    fn reads_the_first_pixel_at_0_0() {
        let mut bmp = create_bitmap(8, 8, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0xdeadbeef);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0xdeadbeef);
    }

    #[test]
    fn reads_the_last_pixel() {
        let mut bmp = create_bitmap(8, 8, None);
        set_bitmap_pixel(&mut bmp, 7, 7, 0xcafebabe);
        assert_eq!(get_bitmap_pixel(&bmp, 7, 7), 0xcafebabe);
    }

    #[test]
    fn round_trips_an_rgba_value() {
        let mut bmp = create_bitmap(4, 4, None);
        set_bitmap_pixel(&mut bmp, 1, 2, 0x11223380);
        assert_eq!(get_bitmap_pixel(&bmp, 1, 2), 0x11223380);
    }

    #[test]
    fn stores_alpha_in_the_fourth_byte() {
        let mut bmp = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0x112233de);
        assert_eq!(bmp.data[3], 0xde);
    }
}

mod get_bitmap_pixel_channel_fn {
    use super::*;

    #[test]
    fn reads_a_single_channel_by_index() {
        let bmp = create_bitmap(1, 1, Some(0xaabbccdd));
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Red), 0xaa);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Green), 0xbb);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Blue), 0xcc);
        assert_eq!(get_bitmap_pixel_channel(&bmp, 0, 0, ImageChannel::Alpha), 0xdd);
    }
}

mod get_bitmap_pixel_luminance_fn {
    use super::*;

    #[test]
    fn returns_0_for_black() {
        let bmp = create_bitmap(1, 1, Some(0x000000ff));
        assert_eq!(get_bitmap_pixel_luminance(&bmp, 0, 0), 0);
    }

    #[test]
    fn returns_255_for_white() {
        let bmp = create_bitmap(1, 1, Some(0xffffffff));
        assert_eq!(get_bitmap_pixel_luminance(&bmp, 0, 0), 255);
    }

    #[test]
    fn uses_w3c_luma_weighting_green_is_heaviest() {
        let red = create_bitmap(1, 1, Some(0xff0000ff));
        let green = create_bitmap(1, 1, Some(0x00ff00ff));
        let blue = create_bitmap(1, 1, Some(0x0000ffff));
        assert!(get_bitmap_pixel_luminance(&green, 0, 0) > get_bitmap_pixel_luminance(&red, 0, 0));
        assert!(get_bitmap_pixel_luminance(&red, 0, 0) > get_bitmap_pixel_luminance(&blue, 0, 0));
    }
}

mod get_bitmap_pixel_rgb_fn {
    use super::*;

    #[test]
    fn reads_back_rgb_without_alpha() {
        let mut bmp = create_bitmap(2, 2, None);
        set_bitmap_pixel_rgb(&mut bmp, 0, 0, 0xaabbcc);
        assert_eq!(get_bitmap_pixel_rgb(&bmp, 0, 0), 0xaabbcc);
    }

    #[test]
    fn round_trips_an_rgb_value() {
        let mut bmp = create_bitmap(4, 4, None);
        set_bitmap_pixel_rgb(&mut bmp, 1, 2, 0x112233);
        assert_eq!(get_bitmap_pixel_rgb(&bmp, 1, 2), 0x112233);
    }
}

mod set_bitmap_pixel_fn {
    use super::*;

    #[test]
    fn writes_all_four_rgba_channels() {
        let mut bmp = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut bmp, 1, 0, 0xadbeefde);
        assert_eq!(get_bitmap_pixel(&bmp, 1, 0), 0xadbeefde);
    }

    #[test]
    fn writes_to_the_last_pixel() {
        let mut bmp = create_bitmap(8, 8, None);
        set_bitmap_pixel(&mut bmp, 7, 7, 0xfedcba98);
        assert_eq!(get_bitmap_pixel(&bmp, 7, 7), 0xfedcba98);
    }

    #[test]
    fn bumps_the_bitmap_version() {
        let mut bmp = create_bitmap(2, 2, None);
        let before = bmp.version;
        set_bitmap_pixel(&mut bmp, 1, 0, 0xadbeefde);
        assert_eq!(bmp.version, before + 1);
    }
}

mod set_bitmap_pixel_rgb_fn {
    use super::*;

    #[test]
    fn writes_rgb_without_touching_alpha() {
        let mut bmp = create_bitmap(2, 2, Some(0x000000ff));
        set_bitmap_pixel_rgb(&mut bmp, 0, 0, 0x112233);
        assert_eq!(bmp.data[3], 0xff);
        assert_eq!(get_bitmap_pixel_rgb(&bmp, 0, 0), 0x112233);
    }
}

mod to_clamped_u8 {
    use super::*;

    #[test]
    fn rounds_half_to_even_like_a_ts_uint8_clamped_array_store() {
        assert_eq!(to_clamped_u8(1.5), 2);
        assert_eq!(to_clamped_u8(2.5), 2);
        assert_eq!(to_clamped_u8(3.5), 4);
        assert_eq!(to_clamped_u8(2.4), 2);
        assert_eq!(to_clamped_u8(2.6), 3);
    }

    #[test]
    fn clamps_out_of_range_values_to_the_byte_range() {
        assert_eq!(to_clamped_u8(300.0), 255);
        assert_eq!(to_clamped_u8(255.5), 255);
        assert_eq!(to_clamped_u8(-5.0), 0);
        assert_eq!(to_clamped_u8(-0.5), 0);
        assert_eq!(to_clamped_u8(f32::INFINITY), 255);
        assert_eq!(to_clamped_u8(f32::NEG_INFINITY), 0);
    }

    #[test]
    fn maps_nan_to_zero() {
        assert_eq!(to_clamped_u8(f32::NAN), 0);
    }
}
