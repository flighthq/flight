use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod rotate_bitmap {
    use super::*;

    #[test]
    fn with_angle_0_copies_source_into_dest() {
        let source = create_bitmap(3, 3, Some(0xff0000ff));
        let dest = create_bitmap(3, 3, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, 0.0, 1.5, 1.5, BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn with_angle_pi_reverses_source_similar_to_rotate_bitmap_180() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0xa0; src.data[3] = 255;
        src.data[4] = 0xb0; src.data[7] = 255;
        let dest = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, std::f64::consts::PI, 1.0, 0.5, BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert!(dr.bitmap.data[0] > dr.bitmap.data[4]);
    }

    #[test]
    fn clamp_edge_mode_repeats_edge_pixels_for_out_of_bounds() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(5, 5, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, 0.0, 0.5, 0.5, BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(dr.bitmap.data[(0 * 5 + 0) * 4 + 3], 0xff);
        assert_eq!(dr.bitmap.data[(2 * 5 + 2) * 4 + 3], 0xff);
    }

    #[test]
    fn transparent_edge_mode_writes_transparent_black_for_out_of_bounds() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(5, 5, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, 0.0, 0.0, 0.0, BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(dr.bitmap.data[(0 * 5 + 0) * 4 + 3], 0);
        assert_eq!(dr.bitmap.data[(2 * 5 + 2) * 4 + 3], 0xff);
    }

    #[test]
    fn wrap_edge_mode_tiles_the_source() {
        let source = create_bitmap(2, 2, Some(0xff0000ff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, 0.0, 1.0, 1.0, BitmapEdgeMode::Wrap, BitmapResizeMode::Bilinear);
        assert_eq!(dr.bitmap.data[3], 0xff);
        assert_eq!(dr.bitmap.data[(3 * 4 + 3) * 4 + 3], 0xff);
    }

    #[test]
    fn nearest_sample_mode_uses_nearest_neighbor_interpolation() {
        let mut source = create_bitmap(2, 1, None);
        source.data[0] = 0; source.data[1] = 0; source.data[2] = 0; source.data[3] = 255;
        source.data[4] = 200; source.data[5] = 200; source.data[6] = 200; source.data[7] = 255;
        let dest = create_bitmap(2, 1, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap(&mut dr, &sr, 0.0, 0.5, 0.0, BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[4], 200);
    }
}

mod rotate_bitmap_180 {
    use super::*;

    #[test]
    fn reverses_pixel_order_with_matching_dimensions() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0xa0; src.data[3] = 255;
        src.data[4] = 0xb0; src.data[7] = 255;
        let dest = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        rotate_bitmap_180(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 0xb0);
        assert_eq!(dr.bitmap.data[4], 0xa0);
    }

    #[test]
    fn rotates_in_place_when_dest_and_source_are_the_same_region() {
        let mut bmp = create_bitmap(2, 1, None);
        bmp.data[0] = 0xa0; bmp.data[3] = 255;
        bmp.data[4] = 0xb0; bmp.data[7] = 255;
        let sr = region(bmp.clone());
        let mut dr = region(bmp);
        rotate_bitmap_180(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 0xb0);
        assert_eq!(dr.bitmap.data[4], 0xa0);
    }
}

mod rotate_bitmap_clockwise {
    use super::*;

    #[test]
    fn rotates_a_row_into_a_column_left_element_on_top() {
        let mut source = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut source, 0, 0, 0xa00000ff);
        set_bitmap_pixel(&mut source, 1, 0, 0xb00000ff);
        let dest = create_bitmap(1, 2, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap_clockwise(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), get_bitmap_pixel(&sr.bitmap, 0, 0));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 1), get_bitmap_pixel(&sr.bitmap, 1, 0));
    }
}

mod rotate_bitmap_counter_clockwise {
    use super::*;

    #[test]
    fn rotates_a_row_into_a_column_right_element_on_top() {
        let mut source = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut source, 0, 0, 0xa00000ff);
        set_bitmap_pixel(&mut source, 1, 0, 0xb00000ff);
        let dest = create_bitmap(1, 2, None);
        let sr = region(source);
        let mut dr = region(dest);
        rotate_bitmap_counter_clockwise(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), get_bitmap_pixel(&sr.bitmap, 1, 0));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 1), get_bitmap_pixel(&sr.bitmap, 0, 0));
    }
}
