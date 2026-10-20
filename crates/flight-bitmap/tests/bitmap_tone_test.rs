use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod apply_bitmap_curve_fn {
    use super::*;

    #[test]
    fn identity_lut_preserves_values() {
        let mut lut = vec![0u8; 256];
        for i in 0..256 { lut[i] = i as u8; }
        let src = create_bitmap(2, 2, 0xaabbccff);
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), Some(&lut), Some(&lut), None);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xaabbccff);
    }

    #[test]
    fn invert_lut_inverts_colors() {
        let mut lut = vec![0u8; 256];
        for i in 0..256 { lut[i] = (255 - i) as u8; }
        let src = create_bitmap(1, 1, 0x804020ff);
        let dest = create_bitmap(1, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_curve(&mut dr, &sr, Some(&lut), Some(&lut), Some(&lut), None);
        assert_eq!(dr.bitmap.data[0], 255 - 0x80);
        assert_eq!(dr.bitmap.data[1], 255 - 0x40);
        assert_eq!(dr.bitmap.data[2], 255 - 0x20);
        assert_eq!(dr.bitmap.data[3], 0xff); // alpha unchanged
    }
}

mod apply_bitmap_levels_fn {
    use super::*;

    #[test]
    fn default_levels_preserve_values() {
        let src = create_bitmap(2, 2, 0x808080ff);
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        apply_bitmap_levels(&mut dr, &sr, 0.0, 255.0, 1.0);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x808080ff);
    }

    #[test]
    fn narrow_range_brightens() {
        let src = create_bitmap(1, 1, 0x808080ff);
        let dest = create_bitmap(1, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        // Black point at 0, white point at 128 -> 0x80 maps to ~255
        apply_bitmap_levels(&mut dr, &sr, 0.0, 128.0, 1.0);
        assert!(dr.bitmap.data[0] >= 250);
    }
}
