use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod fill_bitmap_linear_gradient_fn {
    use super::*;

    #[test]
    fn fills_with_gradient_from_left_to_right() {
        let bmp = create_bitmap(256, 1, 0);
        let mut r = region(bmp);
        let mut ramp = vec![0u8; 1024];
        for i in 0..256 {
            ramp[i * 4] = i as u8;
            ramp[i * 4 + 1] = 0;
            ramp[i * 4 + 2] = 0;
            ramp[i * 4 + 3] = 255;
        }
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 255.0, 0.0, GradientSpread::Pad);
        // Left end should be ~0 red, right end should be ~255 red
        assert!(r.bitmap.data[0] <= 2);
        assert!(r.bitmap.data[255 * 4] >= 253);
    }
}

mod fill_bitmap_radial_gradient_fn {
    use super::*;

    #[test]
    fn center_gets_first_color() {
        let bmp = create_bitmap(10, 10, 0);
        let mut r = region(bmp);
        let mut ramp = vec![0u8; 1024];
        // Index 0 = red
        ramp[0] = 255; ramp[1] = 0; ramp[2] = 0; ramp[3] = 255;
        // Index 255 = blue
        ramp[255 * 4] = 0; ramp[255 * 4 + 1] = 0; ramp[255 * 4 + 2] = 255; ramp[255 * 4 + 3] = 255;
        fill_bitmap_radial_gradient(&mut r, &ramp, 5.0, 5.0, 10.0, 5.0, 5.0, GradientSpread::Pad);
        // Center pixel (5,5) should be ramp[0] = red
        let i = (5 * 10 + 5) * 4;
        assert_eq!(r.bitmap.data[i], 255);
        assert_eq!(r.bitmap.data[i + 2], 0);
    }
}
