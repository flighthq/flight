use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod median_bitmap_fn {
    use super::*;

    #[test]
    fn uniform_image_unchanged() {
        let src = create_bitmap(4, 4, 0x808080ff);
        let len = 4 * 4 * 4;
        let mut out = vec![0u8; len];
        median_bitmap(&mut out, &region(src), 1);
        // All pixels should still be 0x80
        for i in (0..len).step_by(4) {
            assert_eq!(out[i], 0x80);
            assert_eq!(out[i + 1], 0x80);
            assert_eq!(out[i + 2], 0x80);
            assert_eq!(out[i + 3], 0xff);
        }
    }

    #[test]
    fn removes_isolated_noise() {
        let mut src = create_bitmap(3, 3, 0x808080ff);
        // Single bright pixel in center
        set_bitmap_pixel(&mut src, 1, 1, 0xffffffff);
        let mut out = vec![0u8; 3 * 3 * 4];
        median_bitmap(&mut out, &region(src), 1);
        // Center should be the median of the 3x3 neighborhood, which is 0x80
        let ci = (1 * 3 + 1) * 4;
        assert_eq!(out[ci], 0x80);
    }
}
