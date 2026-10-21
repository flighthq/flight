use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod resize_bitmap_fn {
    use super::*;

    #[test]
    fn nearest_upscales_by_pixel_duplication() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 10; src.data[1] = 20; src.data[2] = 30; src.data[3] = 255;
        src.data[4] = 40; src.data[5] = 50; src.data[6] = 60; src.data[7] = 255;
        let dest = create_bitmap(4, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Nearest, BitmapEdgeMode::Clamp, false);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), get_bitmap_pixel(&sr.bitmap, 0, 0));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), get_bitmap_pixel(&sr.bitmap, 0, 0));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 2, 0), get_bitmap_pixel(&sr.bitmap, 1, 0));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 0), get_bitmap_pixel(&sr.bitmap, 1, 0));
    }

    #[test]
    fn bilinear_interpolates_between_source_pixels() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0; src.data[1] = 0; src.data[2] = 0; src.data[3] = 255;
        src.data[4] = 100; src.data[5] = 100; src.data[6] = 100; src.data[7] = 255;
        let dest = create_bitmap(4, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, false);
        assert_eq!(dr.bitmap.data[0], 0);
        assert!(dr.bitmap.data[4] >= dr.bitmap.data[0]);
        assert!(dr.bitmap.data[8] > dr.bitmap.data[4]);
        assert_eq!(dr.bitmap.data[12], 100);
    }

    #[test]
    fn bicubic_produces_a_smoother_interpolation_than_bilinear() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0; src.data[1] = 0; src.data[2] = 0; src.data[3] = 255;
        src.data[4] = 200; src.data[5] = 200; src.data[6] = 200; src.data[7] = 255;
        let dest = create_bitmap(4, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Bicubic, BitmapEdgeMode::Clamp, false);
        assert!(dr.bitmap.data[4] >= dr.bitmap.data[0]);
        assert!(dr.bitmap.data[8] >= dr.bitmap.data[4]);
        assert!(dr.bitmap.data[12] >= dr.bitmap.data[8]);
    }

    #[test]
    fn downscales_by_averaging_toward_the_source_values() {
        let src = create_bitmap(4, 1, Some(0x40608000));
        let dest = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, false);
        assert_eq!(dr.bitmap.data[0], 0x40);
        assert_eq!(dr.bitmap.data[1], 0x60);
        assert_eq!(dr.bitmap.data[2], 0x80);
    }

    #[test]
    fn resamples_a_source_sub_region_into_a_dest_sub_region() {
        let mut src = create_bitmap(4, 1, None);
        src.data[2 * 4] = 10; src.data[2 * 4 + 3] = 255;
        let dest = create_bitmap(4, 1, None);
        let sr = region_at(src, 2, 0, 1, 1);
        let mut dr = region_at(dest, 0, 0, 2, 1);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Nearest, BitmapEdgeMode::Clamp, false);
        assert_eq!(dr.bitmap.data[0], 10);
        assert_eq!(dr.bitmap.data[4], 10);
        assert_eq!(dr.bitmap.data[8], 0);
    }

    #[test]
    fn wrap_edge_mode_wraps_boundary_interpolation() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0; src.data[1] = 0; src.data[2] = 0; src.data[3] = 255;
        src.data[4] = 200; src.data[5] = 200; src.data[6] = 200; src.data[7] = 255;
        let out_clamp = create_bitmap(4, 1, None);
        let sr = region(src.clone());
        let mut dr_c = region(out_clamp);
        resize_bitmap(&mut dr_c, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, false);
        let out_wrap = create_bitmap(4, 1, None);
        let sr2 = region(src);
        let mut dr_w = region(out_wrap);
        resize_bitmap(&mut dr_w, &sr2, BitmapResizeMode::Bilinear, BitmapEdgeMode::Wrap, false);
        assert_ne!(dr_c.bitmap.data[12], dr_w.bitmap.data[12]);
    }

    #[test]
    fn transparent_edge_mode_fades_boundary_pixels_to_transparent() {
        let src = create_bitmap(2, 1, Some(0xff0000ff));
        let dest = create_bitmap(4, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Transparent, false);
        assert!(dr.bitmap.data[12 + 3] < 255);
    }

    #[test]
    fn is_a_noop_when_a_dimension_is_zero() {
        let src = create_bitmap(2, 2, Some(0xffffffff));
        let dest = create_bitmap(0, 0, None);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Nearest, BitmapEdgeMode::Transparent, false);
    }

    #[test]
    fn premultiplied_prevents_dark_halo_bleed() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 255; src.data[1] = 0; src.data[2] = 0; src.data[3] = 255;
        src.data[4] = 0; src.data[5] = 0; src.data[6] = 0; src.data[7] = 0;
        let straight = create_bitmap(4, 1, None);
        let sr = region(src.clone());
        let mut dr_s = region(straight);
        resize_bitmap(&mut dr_s, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, false);
        let premul = create_bitmap(4, 1, None);
        let sr2 = region(src);
        let mut dr_p = region(premul);
        resize_bitmap(&mut dr_p, &sr2, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, true);
        assert!(dr_p.bitmap.data[4] >= dr_s.bitmap.data[4]);
    }
}
