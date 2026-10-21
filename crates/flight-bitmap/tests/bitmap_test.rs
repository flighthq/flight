use flight_bitmap::*;

mod clone_bitmap_fn {
    use super::*;

    #[test]
    fn produces_identical_values() {
        let img = create_bitmap(2, 2, Some(0x102030ff));
        let c = clone_bitmap(&img);
        assert_eq!(c.width, img.width);
        assert_eq!(c.height, img.height);
        assert_eq!(c.data, img.data);
    }

    #[test]
    fn is_a_deep_copy() {
        let img = create_bitmap(2, 2, Some(0x102030ff));
        let mut c = clone_bitmap(&img);
        c.data[0] = 0;
        assert_eq!(img.data[0], 0x10);
    }
}

mod convert_bitmap_alpha_type_fn {
    use super::*;

    #[test]
    fn premultiplies_straight_alpha() {
        let mut img = create_bitmap(1, 1, Some(0x80808080));
        img.alpha_type = AlphaType::Straight;
        convert_bitmap_alpha_type(&mut img, AlphaType::Premultiplied);
        assert_eq!(img.alpha_type, AlphaType::Premultiplied);
        assert_eq!(img.data[0], 64);
        assert_eq!(img.data[3], 0x80);
    }

    #[test]
    fn unpremultiplies_premultiplied_alpha() {
        let mut img = create_bitmap(1, 1, None);
        img.alpha_type = AlphaType::Premultiplied;
        img.data[0] = 64;
        img.data[1] = 64;
        img.data[2] = 64;
        img.data[3] = 128;
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.alpha_type, AlphaType::Straight);
        assert_eq!(img.data[0], 128);
    }

    #[test]
    fn is_a_noop_when_target_matches_current() {
        let mut img = create_bitmap(1, 1, Some(0xff0000ff));
        img.alpha_type = AlphaType::Straight;
        let before = img.data.clone();
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.data, before);
    }

    #[test]
    fn handles_zero_alpha_pixels_on_unpremultiply() {
        let mut img = create_bitmap(1, 1, None);
        img.alpha_type = AlphaType::Premultiplied;
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.data[0], 0);
        assert_eq!(img.data[3], 0);
    }
}

mod create_bitmap_fn {
    use super::*;

    #[test]
    fn creates_zeroed_image_data_when_no_color_provided() {
        let img = create_bitmap(2, 2, None);
        assert_eq!(img.width, 2);
        assert_eq!(img.height, 2);
        assert_eq!(img.data.len(), 16);
        assert!(img.data.iter().all(|&v| v == 0));
    }

    #[test]
    fn fills_with_the_given_color() {
        let img = create_bitmap(2, 2, Some(0x112233ff));
        assert_eq!(img.data[0], 0x11);
        assert_eq!(img.data[1], 0x22);
        assert_eq!(img.data[2], 0x33);
        assert_eq!(img.data[3], 0xff);
    }
}

mod invalidate_bitmap_fn {
    use super::*;

    #[test]
    fn bumps_the_content_version_without_replacing_pixel_storage() {
        let mut bmp = create_bitmap(1, 1, None);
        invalidate_bitmap(&mut bmp);
        assert_eq!(bmp.version, 1);
    }
}
