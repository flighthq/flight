use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod warp_bitmap_fn {
    use super::*;

    #[test]
    fn identity_matrix_copies_source_to_dest() {
        let src = create_bitmap(4, 4, Some(0xff0000ff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0xff0000ff);
    }

    #[test]
    fn translation_matrix_shifts_source() {
        let mut src = create_bitmap(4, 4, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, -1.0, 0.0, 1.0, -1.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }

    #[test]
    fn clamp_edge_mode_extends_border_pixels() {
        let src = create_bitmap(2, 2, Some(0x00ff00ff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, 2.0, 0.0, 1.0, 2.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00ff00ff);
    }

    #[test]
    fn transparent_edge_mode_gives_transparent_black_outside_bounds() {
        let src = create_bitmap(2, 2, Some(0xffffffff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, 3.0, 0.0, 1.0, 3.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }

    #[test]
    fn zero_size_regions_are_a_noop() {
        let src = create_bitmap(4, 4, Some(0xffffffff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region_at(dest, 0, 0, 0, 4);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }

    #[test]
    fn near_zero_w_coefficient_produces_transparent_pixel() {
        let src = create_bitmap(2, 2, Some(0xffffffff));
        let dest = create_bitmap(2, 2, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap(&mut dr, &sr, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1e-15, 0.0, 0.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(dr.bitmap.data[3], 0);
    }
}

mod warp_bitmap_quad_fn {
    use super::*;

    #[test]
    fn identity_quad_copies_source() {
        let src = create_bitmap(4, 4, Some(0x0000ffff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap_quad(&mut dr, &sr, [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 2, 2), 0x0000ffff);
    }

    #[test]
    fn degenerate_quad_produces_no_crash() {
        let src = create_bitmap(4, 4, Some(0xffffffff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap_quad(&mut dr, &sr, [2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
    }

    #[test]
    fn horizontal_shear_quad_produces_non_trivial_sampling() {
        let mut src = create_bitmap(8, 8, None);
        for py in 0..8 {
            for px in 0..8 {
                let i = (py * 8 + px) * 4;
                src.data[i] = if px < 4 { 255 } else { 0 };
                src.data[i + 1] = if px >= 4 { 255 } else { 0 };
                src.data[i + 2] = 0;
                src.data[i + 3] = 255;
            }
        }
        let dest = create_bitmap(8, 8, None);
        let sr = region(src);
        let mut dr = region(dest);
        warp_bitmap_quad(&mut dr, &sr, [0.0, 0.0, 8.0, 2.0, 8.0, 8.0, 0.0, 8.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        let has_non_zero = dr.bitmap.data.iter().any(|&v| v != 0);
        assert!(has_non_zero);
    }

    #[test]
    fn zero_size_source_or_dest_is_a_noop() {
        let src = create_bitmap(4, 4, Some(0xffffffff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region_at(dest, 0, 0, 0, 0);
        warp_bitmap_quad(&mut dr, &sr, [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }
}
