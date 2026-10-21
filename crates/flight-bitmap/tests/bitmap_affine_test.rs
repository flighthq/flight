use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod transform_bitmap_fn {
    use super::*;

    #[test]
    fn identity_matrix_copies_source_to_dest() {
        let mut src = create_bitmap(3, 3, None);
        set_bitmap_pixel(&mut src, 1, 1, 0xff0000ff);
        let dst = create_bitmap(3, 3, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xff0000ff);
    }

    #[test]
    fn translation_matrix_shifts_the_image() {
        let mut src = create_bitmap(4, 4, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xaabbccff);
        let dst = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, -1.0, -1.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xaabbccff);
    }

    #[test]
    fn transparent_edge_mode_writes_transparent_for_out_of_bounds_samples() {
        let src = create_bitmap(2, 2, Some(0xff0000ff));
        let dst = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0x00000000);
    }

    #[test]
    fn clamp_edge_mode_repeats_border_pixels() {
        let src = create_bitmap(2, 2, Some(0x112233ff));
        let dst = create_bitmap(4, 4, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0x112233ff);
    }

    #[test]
    fn wrap_edge_mode_tiles_the_source() {
        let mut src = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xffff00ff);
        let dst = create_bitmap(4, 2, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Wrap, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 2, 0), 0xffff00ff);
    }

    #[test]
    fn mirror_edge_mode_mirrors_the_source() {
        let mut src = create_bitmap(3, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x00ff00ff);
        set_bitmap_pixel(&mut src, 2, 0, 0x0000ffff);
        let dst = create_bitmap(5, 1, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Mirror, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 0), 0x0000ffff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 4, 0), 0x00ff00ff);
    }

    #[test]
    fn nearest_sample_mode_preserves_hard_edges() {
        let mut src = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x0000ffff);
        let dst = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), 0x0000ffff);
    }

    #[test]
    fn skips_zero_size_dest_or_source() {
        let src = create_bitmap(2, 2, None);
        let dst = create_bitmap(2, 2, None);
        let sr = region(src);
        let mut dr = BitmapRegion { bitmap: dst, x: 0, y: 0, width: 0, height: 0 };
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
    }

    #[test]
    fn aliased_out_in_with_identity_leaves_bitmap_unchanged() {
        let src = create_bitmap(2, 2, Some(0xabcdefff));
        let dst = create_bitmap(2, 2, None);
        let sr = region(src);
        let mut dr = region(dst);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xabcdefff);
    }
}
