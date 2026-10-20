use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod pixelate_bitmap_fn {
    use super::*;

    #[test]
    fn uniform_image_stays_same() {
        let src = create_bitmap(4, 4, 0xaabbccff);
        let mut out = vec![0u8; 4 * 4 * 4];
        pixelate_bitmap(&mut out, &region(src), 2);
        for i in (0..out.len()).step_by(4) {
            assert_eq!(out[i], 0xaa);
            assert_eq!(out[i + 1], 0xbb);
            assert_eq!(out[i + 2], 0xcc);
            assert_eq!(out[i + 3], 0xff);
        }
    }

    #[test]
    fn block_averages_pixels() {
        let mut src = create_bitmap(2, 2, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x000000ff);
        set_bitmap_pixel(&mut src, 0, 1, 0x000000ff);
        set_bitmap_pixel(&mut src, 1, 1, 0x000000ff);
        let mut out = vec![0u8; 2 * 2 * 4];
        pixelate_bitmap(&mut out, &region(src), 2);
        // Average red: (255 + 0 + 0 + 0) / 4 = 63.75 ~= 64
        assert!((out[0] as i32 - 64).abs() <= 1);
    }
}
