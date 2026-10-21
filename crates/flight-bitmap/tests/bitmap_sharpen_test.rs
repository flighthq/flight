use flight_bitmap::contract::*;

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

    fn sharpen_row(values: &[u8], amount: f32) -> Vec<u8> {
        let w = values.len() as u32;
        let mut bitmap = create_bitmap(w, 1, None);
        for (i, v) in values.iter().enumerate() {
            bitmap.data[i * 4] = *v;
            bitmap.data[i * 4 + 3] = 255;
        }
        let region = BitmapRegion { bitmap, x: 0, y: 0, width: w as i32, height: 1 };
        let mut out = vec![0u8; (w * 4) as usize];
        let mut scratch = vec![0u8; (w * 4) as usize];
        let options = BitmapSharpenOptions { amount: Some(amount), radius_x: Some(1), radius_y: Some(0), passes: Some(1) };
        sharpen_bitmap(&mut out, &mut scratch, &region, &options);
        return (0..w as usize).map(|i| out[i * 4]).collect();
    }

    #[test]
    fn stores_exact_halves_half_to_even_like_a_clamped_array() {
        // The middle pixel blurs to 9, so r + amount * (r - blurred) lands exactly on a half.
        assert_eq!(sharpen_row(&[10, 10, 7], 0.5)[1], 10);
        assert_eq!(sharpen_row(&[10, 10, 7], 1.5)[1], 12);
    }

    #[test]
    fn clamps_overshoot_to_the_byte_range() {
        assert_eq!(sharpen_row(&[255, 255, 0], 50.0)[1], 255);
        assert_eq!(sharpen_row(&[0, 0, 255], 50.0)[1], 0);
    }
}
