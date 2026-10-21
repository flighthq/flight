use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod sharpen_bitmap_fn {
    use super::*;

    #[test]
    fn amount_0_returns_the_source_rgb_and_preserves_alpha() {
        let mut src = create_bitmap(3, 1, None);
        src.data[4] = 10; src.data[5] = 20; src.data[6] = 30; src.data[7] = 120;
        let sr = region(src);
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapSharpenOptions {
            amount: Some(0.0),
            radius_x: None,
            radius_y: None,
            passes: None,
        };
        sharpen_bitmap(&mut out, &mut scratch, &sr, &opts);
        assert_eq!(out[4], 10);
        assert_eq!(out[5], 20);
        assert_eq!(out[6], 30);
        assert_eq!(out[7], 120);
    }

    #[test]
    fn accentuates_a_bright_center_pixel_above_its_original_value() {
        let mut src = create_bitmap(5, 1, None);
        src.data[2 * 4] = 100;
        for i in 0..5 {
            src.data[i * 4 + 3] = 255;
        }
        let sr = region(src);
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        let opts = BitmapSharpenOptions {
            amount: Some(1.0),
            radius_x: Some(4),
            radius_y: Some(0),
            passes: None,
        };
        sharpen_bitmap(&mut out, &mut scratch, &sr, &opts);
        assert!(out[2 * 4] > 100);
    }

    #[test]
    fn preserves_source_alpha_while_sharpening_rgb() {
        let mut src = create_bitmap(3, 1, None);
        for i in 0..3 {
            src.data[i * 4] = (i * 40) as u8;
            src.data[i * 4 + 3] = 77;
        }
        let sr = region(src);
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapSharpenOptions {
            amount: Some(2.0),
            radius_x: None,
            radius_y: None,
            passes: None,
        };
        sharpen_bitmap(&mut out, &mut scratch, &sr, &opts);
        assert_eq!(out[3], 77);
        assert_eq!(out[7], 77);
        assert_eq!(out[11], 77);
    }
}
