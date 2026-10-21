use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion {
        bitmap: bmp,
        x: 0,
        y: 0,
        width: w,
        height: h,
    };
}

fn build_two_stop_ramp(color_a: u32, color_b: u32) -> Vec<u8> {
    let mut ramp = vec![0u8; 1024];
    let colors = [(color_a >> 8) & 0x00ff_ffff, (color_b >> 8) & 0x00ff_ffff];
    let alphas = [
        (color_a & 0xff) as f32 / 255.0,
        (color_b & 0xff) as f32 / 255.0,
    ];
    build_bitmap_gradient_ramp(&mut ramp, &colors, &alphas, &[0.0, 255.0]);
    return ramp;
}

fn linear_ramp() -> Vec<u8> {
    return build_two_stop_ramp(0x000000ff, 0xffffffff);
}

mod fill_bitmap_linear_gradient {
    use super::*;

    #[test]
    fn fills_leftmost_pixel_with_the_first_stop_color() {
        let bmp = create_bitmap(4, 1, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 3.0, 0.0, GradientSpread::Pad);
        let pixel = get_bitmap_pixel(&r.bitmap, 0, 0);
        assert!((((pixel >> 24) & 0xff) as i32 - 0xff).abs() < 5);
        assert!((((pixel >> 8) & 0xff) as i32 - 0x00).abs() < 5);
    }

    #[test]
    fn fills_rightmost_pixel_with_the_last_stop_color() {
        let bmp = create_bitmap(4, 1, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 3.0, 0.0, GradientSpread::Pad);
        let pixel = get_bitmap_pixel(&r.bitmap, 3, 0);
        assert!((((pixel >> 24) & 0xff) as i32 - 0x00).abs() < 5);
        assert!((((pixel >> 8) & 0xff) as i32 - 0xff).abs() < 5);
    }

    #[test]
    fn middle_pixel_blends_between_endpoints() {
        let bmp = create_bitmap(3, 1, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0x000000ff, 0xffffffff);
        fill_bitmap_linear_gradient(&mut r, &ramp, 0.0, 0.0, 2.0, 0.0, GradientSpread::Pad);
        let mid = ((get_bitmap_pixel(&r.bitmap, 1, 0) >> 24) & 0xff) as u8;
        assert!(mid > 0);
        assert!(mid < 255);
    }

    #[test]
    fn pad_spread_clamps_outside_bounds() {
        let bmp = create_bitmap(5, 1, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_linear_gradient(&mut r, &ramp, 1.0, 0.0, 3.0, 0.0, GradientSpread::Pad);
        let left = get_bitmap_pixel(&r.bitmap, 0, 0);
        let left_boundary = get_bitmap_pixel(&r.bitmap, 1, 0);
        let right = get_bitmap_pixel(&r.bitmap, 4, 0);
        let right_boundary = get_bitmap_pixel(&r.bitmap, 3, 0);
        assert_eq!((left >> 24) & 0xff, (left_boundary >> 24) & 0xff);
        assert_eq!((right >> 8) & 0xff, (right_boundary >> 8) & 0xff);
    }

    #[test]
    fn skips_pixels_outside_bitmap_bounds() {
        let bmp = create_bitmap(2, 2, None);
        let mut r = BitmapRegion {
            bitmap: bmp,
            x: -1,
            y: 0,
            width: 4,
            height: 1,
        };
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
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

mod fill_bitmap_radial_gradient {
    use super::*;

    #[test]
    fn center_pixel_gets_the_first_stop_color() {
        let bmp = create_bitmap(5, 5, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_radial_gradient(&mut r, &ramp, 2.0, 2.0, 2.0, 2.0, 2.0, GradientSpread::Pad);
        let pixel = get_bitmap_pixel(&r.bitmap, 2, 2);
        assert!((((pixel >> 24) & 0xff) as i32 - 0xff).abs() < 5);
    }

    #[test]
    fn edge_pixel_gets_the_last_ramp_color() {
        let bmp = create_bitmap(11, 11, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0x000000ff, 0xffffffff);
        fill_bitmap_radial_gradient(&mut r, &ramp, 5.0, 5.0, 5.0, 5.0, 5.0, GradientSpread::Pad);
        let i = (5 * 11 + 10) * 4;
        assert!(r.bitmap.data[i] >= 240);
    }

    #[test]
    fn pad_spread_clamps_beyond_radius_to_the_last_stop() {
        let bmp = create_bitmap(9, 1, None);
        let mut r = region(bmp);
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_radial_gradient(&mut r, &ramp, 4.0, 0.0, 2.0, 4.0, 0.0, GradientSpread::Pad);
        let far = get_bitmap_pixel(&r.bitmap, 0, 0);
        assert!((((far >> 8) & 0xff) as i32 - 0xff).abs() < 5);
    }

    #[test]
    fn skips_pixels_outside_bitmap_bounds() {
        let bmp = create_bitmap(2, 2, None);
        let mut r = BitmapRegion {
            bitmap: bmp,
            x: -1,
            y: 0,
            width: 4,
            height: 1,
        };
        let ramp = build_two_stop_ramp(0xff0000ff, 0x0000ffff);
        fill_bitmap_radial_gradient(&mut r, &ramp, 1.0, 0.0, 2.0, 1.0, 0.0, GradientSpread::Pad);
    }
}
