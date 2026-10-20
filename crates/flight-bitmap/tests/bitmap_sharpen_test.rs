use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod sharpen_bitmap_fn {
    use super::*;

    #[test]
    fn uniform_image_stays_same() {
        let src = create_bitmap(8, 8, 0x808080ff);
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let opts = BitmapSharpenOptions {
            amount: Some(1.0),
            radius_x: Some(1),
            radius_y: Some(1),
            passes: Some(1),
        };
        sharpen_bitmap(&mut out, &mut scratch, &sr, &opts);
        // Center pixel should still be ~0x80
        let ci = (4 * 8 + 4) * 4;
        assert!((out[ci] as i32 - 0x80).abs() <= 1);
    }

    #[test]
    fn enhances_edges() {
        let mut src = create_bitmap(8, 8, 0x404040ff);
        // Bright center block
        for y in 3..5 {
            for x in 3..5 {
                set_bitmap_pixel(&mut src, x, y, 0xc0c0c0ff);
            }
        }
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let opts = BitmapSharpenOptions {
            amount: Some(2.0),
            radius_x: Some(1),
            radius_y: Some(1),
            passes: Some(1),
        };
        sharpen_bitmap(&mut out, &mut scratch, &sr, &opts);
        // Center bright pixel should be brighter than source due to sharpening
        let ci = (3 * 8 + 3) * 4;
        assert!(out[ci] >= 0xc0);
    }
}
