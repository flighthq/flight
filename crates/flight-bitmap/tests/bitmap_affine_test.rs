use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod transform_bitmap_fn {
    use super::*;

    #[test]
    fn identity_copies_source_to_dest() {
        let mut src = create_bitmap(3, 3, 0);
        set_bitmap_pixel(&mut src, 1, 1, 0xff0000ff);
        let dst = create_bitmap(3, 3, 0);
        let mut dr = region(dst);
        let sr = region(src);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xff0000ff);
    }

    #[test]
    fn translation_shifts_image() {
        let mut src = create_bitmap(4, 4, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xaabbccff);
        let dst = create_bitmap(4, 4, 0);
        let mut dr = region(dst);
        let sr = region(src);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, -1.0, -1.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xaabbccff);
    }

    #[test]
    fn transparent_edge_mode_writes_transparent() {
        let src = create_bitmap(2, 2, 0xff0000ff);
        let dst = create_bitmap(4, 4, 0);
        let mut dr = region(dst);
        let sr = region(src);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Transparent, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0x00000000);
    }

    #[test]
    fn clamp_edge_repeats_border() {
        let src = create_bitmap(2, 2, 0x112233ff);
        let dst = create_bitmap(4, 4, 0);
        let mut dr = region(dst);
        let sr = region(src);
        transform_bitmap(&mut dr, &sr, &[1.0, 0.0, 0.0, 1.0, 0.0, 0.0], BitmapEdgeMode::Clamp, BitmapResizeMode::Bilinear);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0x112233ff);
    }
}
