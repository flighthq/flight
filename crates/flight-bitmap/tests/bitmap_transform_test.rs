use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod apply_bitmap_color_scale_bias_fn {
    use super::*;

    #[test]
    fn applies_scale() {
        let src = create_bitmap(2, 2, Some(0x808080ff));
        let sr = region(src.clone());
        let mut dr = region(src);
        let ct = ColorScaleBiasLike {
            red_scale: 0.0, green_scale: 1.0, blue_scale: 1.0, alpha_scale: 1.0,
            red_bias: 0.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[1], 0x80);
    }

    #[test]
    fn applies_normalized_linear_bias() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x000000ff);
        let sr = region(src.clone());
        let mut dr = region(src);
        let ct = ColorScaleBiasLike {
            red_scale: 1.0, green_scale: 1.0, blue_scale: 1.0, alpha_scale: 1.0,
            red_bias: 100.0 / 255.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(dr.bitmap.data[0], 100);
    }

    #[test]
    fn clamps_to_0_255() {
        let src = create_bitmap(1, 1, Some(0x808080ff));
        let sr = region(src.clone());
        let mut dr = region(src);
        let ct = ColorScaleBiasLike {
            red_scale: 10.0, green_scale: 1.0, blue_scale: 1.0, alpha_scale: 1.0,
            red_bias: 100.0 / 255.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(dr.bitmap.data[0], 255);
    }

    #[test]
    fn only_affects_the_specified_rect() {
        let src = create_bitmap(2, 2, Some(0x808080ff));
        let sr = region_at(src.clone(), 0, 0, 1, 1);
        let mut dr = region_at(src, 0, 0, 1, 1);
        let ct = ColorScaleBiasLike {
            red_scale: 0.0, green_scale: 1.0, blue_scale: 1.0, alpha_scale: 1.0,
            red_bias: 0.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[4], 0x80);
    }

    #[test]
    fn can_write_to_a_separate_output_bitmap() {
        let source = create_bitmap(1, 1, Some(0x808080ff));
        let out = create_bitmap(1, 1, None);
        let sr = region(source);
        let mut dr = region(out);
        let ct = ColorScaleBiasLike {
            red_scale: 0.0, green_scale: 1.0, blue_scale: 1.0, alpha_scale: 1.0,
            red_bias: 0.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[1], 0x80);
        assert_eq!(sr.bitmap.data[0], 0x80);
    }
}

mod apply_bitmap_threshold_fn {
    use super::*;

    #[test]
    fn replaces_pixels_that_pass_the_test() {
        let mut src = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x808080ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x404040ff);
        let dest = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        let count = apply_bitmap_threshold(
            &mut dr, &sr,
            ThresholdOperation::GreaterThan,
            0x607060ff,
            0xffffffff,
            0xffffff00,
            false,
        );
        assert_eq!(count, 1);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xffffffff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), 0x00000000);
    }

    #[test]
    fn copies_source_when_copy_source_is_true_and_test_fails() {
        let src = create_bitmap(1, 1, Some(0x112233ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_threshold(
            &mut dr, &sr,
            ThresholdOperation::GreaterThan,
            0xffffffff,
            0xffffffff,
            0xffffffff,
            true,
        );
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x112233ff);
    }

    #[test]
    fn returns_zero_when_no_pixels_pass() {
        let src = create_bitmap(2, 2, Some(0x000000ff));
        let dest = create_bitmap(2, 2, None);
        let sr = region(src);
        let mut dr = region(dest);
        let count = apply_bitmap_threshold(
            &mut dr, &sr,
            ThresholdOperation::GreaterThan,
            0xffffffff,
            0xffffffff,
            0xffffff00,
            false,
        );
        assert_eq!(count, 0);
    }
}

mod merge_bitmap_fn {
    use super::*;

    #[test]
    fn with_multiplier_1_copies_source() {
        let src = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let sr = region(src);
        let mut dr = region(dest);
        merge_bitmap(&mut dr, &sr, 1.0, 1.0, 1.0, 1.0);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0x00);
    }

    #[test]
    fn with_multiplier_0_keeps_destination() {
        let src = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let sr = region(src);
        let mut dr = region(dest);
        merge_bitmap(&mut dr, &sr, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(dr.bitmap.data[0], 0x00);
        assert_eq!(dr.bitmap.data[2], 0xff);
    }

    #[test]
    fn with_multiplier_half_blends_evenly() {
        let src = create_bitmap(1, 1, Some(0x200000ff));
        let dest = create_bitmap(1, 1, Some(0x000020ff));
        let sr = region(src);
        let mut dr = region(dest);
        merge_bitmap(&mut dr, &sr, 0.5, 0.0, 0.5, 0.0);
        assert!((dr.bitmap.data[0] as i32 - 16).abs() <= 1);
        assert!((dr.bitmap.data[2] as i32 - 16).abs() <= 1);
    }
}

mod scroll_bitmap_fn {
    use super::*;

    #[test]
    fn shifts_content_right_with_wrapping() {
        let mut bmp = create_bitmap(4, 1, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0xff0000ff);
        scroll_bitmap(&mut bmp, 1, 0);
        assert_eq!(get_bitmap_pixel(&bmp, 1, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0x00000000);
    }

    #[test]
    fn wraps_pixels_around_the_edge() {
        let mut bmp = create_bitmap(4, 1, None);
        set_bitmap_pixel(&mut bmp, 3, 0, 0xaabbccff);
        scroll_bitmap(&mut bmp, 1, 0);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0xaabbccff);
    }
}
