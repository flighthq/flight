use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod resize_bitmap_fn {
    use super::*;

    #[test]
    fn nearest_downscale_preserves_color() {
        let src = create_bitmap(4, 4, 0xff0000ff);
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Nearest, BitmapEdgeMode::Clamp, false);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xff0000ff);
    }

    #[test]
    fn bilinear_upscale() {
        let src = create_bitmap(2, 2, 0x808080ff);
        let dest = create_bitmap(4, 4, 0);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Bilinear, BitmapEdgeMode::Clamp, false);
        // Should be roughly 0x80 everywhere
        let p = get_bitmap_pixel(&dr.bitmap, 1, 1);
        let r = (p >> 24) & 0xff;
        assert!((r as i32 - 0x80).abs() <= 2);
    }

    #[test]
    fn noop_for_zero_dimensions() {
        let src = create_bitmap(0, 0, 0);
        let dest = create_bitmap(4, 4, 0);
        let sr = region(src);
        let mut dr = region(dest);
        resize_bitmap(&mut dr, &sr, BitmapResizeMode::Nearest, BitmapEdgeMode::Transparent, false);
        // dest should remain unchanged (all zeros)
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }
}
