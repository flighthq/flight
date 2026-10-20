use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod apply_bitmap_color_scale_bias_fn {
    use super::*;

    #[test]
    fn identity_preserves_color() {
        let src = create_bitmap(2, 2, 0xaabbccff);
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        let ct = ColorScaleBiasLike::default();
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xaabbccff);
    }

    #[test]
    fn halves_all_channels() {
        let src = create_bitmap(1, 1, 0xff8040ff);
        let dest = create_bitmap(1, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        let ct = ColorScaleBiasLike {
            red_scale: 0.5, green_scale: 0.5, blue_scale: 0.5, alpha_scale: 1.0,
            red_bias: 0.0, green_bias: 0.0, blue_bias: 0.0, alpha_bias: 0.0,
        };
        apply_bitmap_color_scale_bias(&mut dr, &sr, &ct);
        assert!((dr.bitmap.data[0] as i32 - 128).abs() <= 1);
        assert!((dr.bitmap.data[1] as i32 - 64).abs() <= 1);
    }
}

mod apply_bitmap_threshold_fn {
    use super::*;

    #[test]
    fn counts_matching_pixels() {
        let src = create_bitmap(2, 2, 0x808080ff);
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        let changed = apply_bitmap_threshold(
            &mut dr, &sr,
            ThresholdOperation::GreaterThan,
            0x70707000, // threshold below pixel value
            0xffffffff,
            0xffffff00,
            false,
        );
        assert_eq!(changed, 4);
    }

    #[test]
    fn copy_source_when_not_matching() {
        let src = create_bitmap(1, 1, 0x101010ff);
        let dest = create_bitmap(1, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_threshold(
            &mut dr, &sr,
            ThresholdOperation::GreaterThan,
            0xffffff00,
            0x000000ff,
            0xffffff00,
            true,
        );
        // Pixel value is less than threshold, so copy_source copies it
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x101010ff);
    }
}

mod merge_bitmap_fn {
    use super::*;

    #[test]
    fn full_scale_copies_source() {
        let src = create_bitmap(2, 2, 0xff0000ff);
        let dest = create_bitmap(2, 2, 0x000000ff);
        let sr = region(src);
        let mut dr = region(dest);
        merge_bitmap(&mut dr, &sr, 1.0, 1.0, 1.0, 1.0);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xff0000ff);
    }

    #[test]
    fn half_scale_blends() {
        let src = create_bitmap(1, 1, 0xff0000ff);
        let dest = create_bitmap(1, 1, 0x000000ff);
        let sr = region(src);
        let mut dr = region(dest);
        merge_bitmap(&mut dr, &sr, 0.5, 0.5, 0.5, 1.0);
        assert!((dr.bitmap.data[0] as i32 - 128).abs() <= 1);
    }
}

mod scroll_bitmap_fn {
    use super::*;

    #[test]
    fn wraps_content() {
        let mut bmp = create_bitmap(4, 1, 0);
        set_bitmap_pixel(&mut bmp, 0, 0, 0xff0000ff);
        scroll_bitmap(&mut bmp, 2, 0);
        assert_eq!(get_bitmap_pixel(&bmp, 2, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&bmp, 0, 0), 0x00000000);
    }

    #[test]
    fn negative_scroll() {
        let mut bmp = create_bitmap(4, 1, 0);
        set_bitmap_pixel(&mut bmp, 3, 0, 0x00ff00ff);
        scroll_bitmap(&mut bmp, -1, 0);
        assert_eq!(get_bitmap_pixel(&bmp, 2, 0), 0x00ff00ff);
    }
}
