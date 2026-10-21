use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn linear_ramp() -> Vec<u8> {
    let mut ramp = vec![0u8; 1024];
    for i in 0..256 {
        ramp[i * 4] = i as u8;
        ramp[i * 4 + 1] = i as u8;
        ramp[i * 4 + 2] = i as u8;
        ramp[i * 4 + 3] = 255;
    }
    return ramp;
}

mod fill_bitmap_linear_gradient_fn {
    use super::*;

    #[test]
    fn endpoint_colors_match_the_ramp() {
        let bmp = create_bitmap(256, 1, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 255.0, 0.0, GradientSpread::Pad);
        assert!(r.bitmap.data[0] <= 2);
        assert!(r.bitmap.data[255 * 4] >= 253);
    }

    #[test]
    fn middle_pixel_blends_between_endpoints() {
        let bmp = create_bitmap(256, 1, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 255.0, 0.0, GradientSpread::Pad);
        let mid = r.bitmap.data[128 * 4];
        assert!(mid >= 120 && mid <= 136);
    }

    #[test]
    fn pad_spread_clamps_outside_bounds() {
        let bmp = create_bitmap(10, 1, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_linear_gradient(&mut r, &ramp, 2.0, 0.0, 7.0, 0.0, GradientSpread::Pad);
        assert!(r.bitmap.data[0] <= 2);
        assert!(r.bitmap.data[9 * 4] >= 253);
    }

    #[test]
    fn skips_pixels_outside_bitmap_bounds() {
        let bmp = create_bitmap(2, 2, None);
        let mut r = BitmapRegion { bitmap: bmp, x: -1, y: 0, width: 4, height: 1 };
        let ramp = linear_ramp();
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 3.0, 0.0, GradientSpread::Pad);
    }

    #[test]
    fn repeat_spread_tiles_the_gradient() {
        let bmp = create_bitmap(20, 1, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 9.0, 0.0, GradientSpread::Repeat);
        let first_start = r.bitmap.data[0];
        let second_start = r.bitmap.data[10 * 4];
        assert!((first_start as i32 - second_start as i32).abs() <= 30);
    }
}

mod fill_bitmap_radial_gradient_fn {
    use super::*;

    #[test]
    fn center_pixel_gets_the_first_ramp_color() {
        let bmp = create_bitmap(11, 11, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_radial_gradient(&mut r, &ramp, 5.0, 5.0, 5.0, 5.0, 5.0, GradientSpread::Pad);
        let i = (5 * 11 + 5) * 4;
        assert!(r.bitmap.data[i] <= 2);
    }

    #[test]
    fn edge_pixel_gets_the_last_ramp_color() {
        let bmp = create_bitmap(11, 11, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_radial_gradient(&mut r, &ramp, 5.0, 5.0, 5.0, 5.0, 5.0, GradientSpread::Pad);
        let i = (5 * 11 + 10) * 4;
        assert!(r.bitmap.data[i] >= 240);
    }

    #[test]
    fn pad_spread_clamps_beyond_radius() {
        let bmp = create_bitmap(21, 1, None);
        let mut r = region(bmp);
        let ramp = linear_ramp();
        fill_bitmap_radial_gradient(&mut r, &ramp, 10.0, 0.0, 5.0, 10.0, 0.0, GradientSpread::Pad);
        let beyond = r.bitmap.data[0];
        assert!(beyond >= 253);
        let also_beyond = r.bitmap.data[20 * 4];
        assert!(also_beyond >= 253);
    }
}
