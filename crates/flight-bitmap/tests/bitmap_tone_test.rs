use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod apply_bitmap_curve_fn {
    use super::*;

    fn identity_lut() -> Vec<u8> {
        return (0..256).map(|i| i as u8).collect();
    }

    fn invert_lut() -> Vec<u8> {
        return (0..256).map(|i| (255 - i) as u8).collect();
    }

    #[test]
    fn identity_lut_leaves_pixels_unchanged() {
        let lut = identity_lut();
        let src = create_bitmap(2, 2, Some(0x11223344));
        let dest = create_bitmap(2, 2, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), Some(&lut), Some(&lut), Some(&lut));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x11223344);
    }

    #[test]
    fn invert_lut_inverts_rgb_channels() {
        let lut = invert_lut();
        let src = create_bitmap(1, 1, Some(0x00ff80ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), Some(&lut), Some(&lut), None);
        let p = get_bitmap_pixel(&dr.bitmap, 0, 0);
        assert_eq!((p >> 24) & 0xff, 0xff);
        assert_eq!((p >> 16) & 0xff, 0x00);
        assert_eq!((p >> 8) & 0xff, 0x7f);
        assert_eq!(p & 0xff, 0xff);
    }

    #[test]
    fn none_lut_passes_channel_through_unchanged() {
        let lut = invert_lut();
        let src = create_bitmap(1, 1, Some(0x80808080));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), None, None, None);
        let p = get_bitmap_pixel(&dr.bitmap, 0, 0);
        assert_eq!((p >> 24) & 0xff, 0x7f);
        assert_eq!((p >> 16) & 0xff, 0x80);
        assert_eq!((p >> 8) & 0xff, 0x80);
        assert_eq!(p & 0xff, 0x80);
    }

    #[test]
    fn is_alias_safe_when_out_aliases_source() {
        let lut = invert_lut();
        let surf = create_bitmap(2, 1, Some(0xff0000ff));
        let sr = region(surf.clone());
        let mut dr = region(surf);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), None, None, None);
        let p = get_bitmap_pixel(&dr.bitmap, 0, 0);
        assert_eq!((p >> 24) & 0xff, 0x00);
        assert_eq!((p >> 8) & 0xff, 0x00);
    }
}

mod apply_bitmap_levels_fn {
    use super::*;

    #[test]
    fn default_levels_are_an_identity() {
        let src = create_bitmap(1, 1, Some(0x808080ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 255.0, 1.0);
        assert!((dr.bitmap.data[0] as i32 - 0x80).abs() <= 1);
    }

    #[test]
    fn black_and_white_points_clip_the_range() {
        let mut src = create_bitmap(1, 1, Some(0x000000ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src.clone());
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 128.0, 1.0);
        assert_eq!(dr.bitmap.data[0], 0);

        set_bitmap_pixel(&mut src, 0, 0, 0x808080ff);
        let sr2 = region(src);
        let dest2 = create_bitmap(1, 1, None);
        let mut dr2 = region(dest2);
        apply_bitmap_levels(&mut dr2, &sr2, 0.0, 128.0, 1.0);
        assert!(dr2.bitmap.data[0] >= 250);
    }

    #[test]
    fn gamma_less_than_1_darkens_midtones() {
        let src = create_bitmap(1, 1, Some(0x808080ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 255.0, 0.5);
        assert!(dr.bitmap.data[0] < 0x80);
    }

    #[test]
    fn gamma_greater_than_1_lightens_midtones() {
        let src = create_bitmap(1, 1, Some(0x808080ff));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 255.0, 2.0);
        assert!(dr.bitmap.data[0] > 0x80);
    }

    #[test]
    fn alpha_channel_is_passed_through_unchanged() {
        let src = create_bitmap(1, 1, Some(0x808080aa));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 255.0, 1.0);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0) & 0xff, 0xaa);
    }
}
