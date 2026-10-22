use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod fill_bitmap_noise {
    use super::*;

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_bitmap(4, 4, None);
        let b = create_bitmap(4, 4, None);
        let mut ar = region(a);
        let mut br = region(b);
        fill_bitmap_noise(&mut ar, 12345, 0, 255, false);
        fill_bitmap_noise(&mut br, 12345, 0, 255, false);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn produces_different_output_for_different_seeds() {
        let a = create_bitmap(8, 8, None);
        let b = create_bitmap(8, 8, None);
        let mut ar = region(a);
        let mut br = region(b);
        fill_bitmap_noise(&mut ar, 1, 0, 255, false);
        fill_bitmap_noise(&mut br, 2, 0, 255, false);
        assert_ne!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn grayscale_gives_every_pixel_equal_rgb() {
        let bmp = create_bitmap(4, 4, None);
        let mut r = region(bmp);
        fill_bitmap_noise(&mut r, 99, 0, 255, true);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i], r.bitmap.data[i + 1]);
            assert_eq!(r.bitmap.data[i + 1], r.bitmap.data[i + 2]);
        }
    }

    #[test]
    fn respects_the_low_high_range_and_sets_alpha_opaque() {
        let bmp = create_bitmap(8, 8, None);
        let mut r = region(bmp);
        fill_bitmap_noise(&mut r, 7, 100, 110, false);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert!(r.bitmap.data[i] >= 100);
            assert!(r.bitmap.data[i] <= 110);
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }

    #[test]
    fn fills_only_the_given_sub_region() {
        let bmp = create_bitmap(2, 1, Some(0x000000ff));
        let mut r = region_at(bmp, 1, 0, 1, 1);
        fill_bitmap_noise(&mut r, 5, 200, 255, false);
        assert_eq!(r.bitmap.data[0], 0);
        assert!(r.bitmap.data[4] >= 200);
    }
}

mod fill_bitmap_perlin_noise {
    use super::*;

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_bitmap(8, 8, None);
        let b = create_bitmap(8, 8, None);
        let mut ar = region(a);
        let mut br = region(b);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_perlin_noise(&mut ar, 16.0, 16.0, 3, 42, false, false, channels);
        fill_bitmap_perlin_noise(&mut br, 16.0, 16.0, 3, 42, false, false, channels);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn keeps_values_in_range_and_alpha_opaque() {
        let bmp = create_bitmap(8, 8, None);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_perlin_noise(&mut r, 8.0, 8.0, 2, 5, false, false, channels);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            // TS checked the value stayed in [0,255]; u8 guarantees that in Rust
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }

    #[test]
    fn grayscale_gives_every_pixel_equal_rgb() {
        let bmp = create_bitmap(8, 8, None);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_perlin_noise(&mut r, 8.0, 8.0, 2, 5, true, false, channels);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i], r.bitmap.data[i + 1]);
            assert_eq!(r.bitmap.data[i + 1], r.bitmap.data[i + 2]);
        }
    }

    #[test]
    fn produces_smooth_low_frequency_fields() {
        let bmp = create_bitmap(16, 1, None);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_perlin_noise(&mut r, 32.0, 32.0, 1, 3, true, false, channels);
        let mut max_step = 0i32;
        for x in 1..16 {
            let diff = (r.bitmap.data[x * 4] as i32 - r.bitmap.data[(x - 1) * 4] as i32).abs();
            max_step = max_step.max(diff);
        }
        assert!(max_step < 64);
    }

    #[test]
    fn fills_selected_channels_only_and_leaves_alpha_opaque_by_default() {
        let bmp = create_bitmap(8, 8, Some(0x000000ff));
        let mut r = region(bmp);
        fill_bitmap_perlin_noise(&mut r, 8.0, 8.0, 2, 5, false, false, BITMAP_NOISE_CHANNEL_R);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i + 1], 0);
            assert_eq!(r.bitmap.data[i + 2], 0);
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }
}

mod fill_bitmap_turbulence {
    use super::*;

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let a = create_bitmap(8, 8, None);
        let b = create_bitmap(8, 8, None);
        let mut ar = region(a);
        let mut br = region(b);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut ar, 16.0, 16.0, 3, 42, false, false, channels);
        fill_bitmap_turbulence(&mut br, 16.0, 16.0, 3, 42, false, false, channels);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn keeps_values_in_range_and_alpha_opaque() {
        let bmp = create_bitmap(8, 8, None);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut r, 8.0, 8.0, 2, 5, false, false, channels);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            // TS checked the value stayed in [0,255]; u8 guarantees that in Rust
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }

    #[test]
    fn grayscale_gives_every_pixel_equal_rgb() {
        let bmp = create_bitmap(8, 8, None);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut r, 8.0, 8.0, 2, 5, true, false, channels);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i], r.bitmap.data[i + 1]);
            assert_eq!(r.bitmap.data[i + 1], r.bitmap.data[i + 2]);
        }
    }

    #[test]
    fn writes_noise_into_alpha_when_the_a_channel_is_selected() {
        let bmp = create_bitmap(8, 8, Some(0x000000ff));
        let mut r = region(bmp);
        fill_bitmap_turbulence(&mut r, 4.0, 4.0, 3, 9, false, false, BITMAP_NOISE_CHANNEL_A);
        let saw_non_opaque = r.bitmap.data.chunks(4).any(|px| px[3] != 255);
        assert!(saw_non_opaque);
    }

    #[test]
    fn differs_from_the_smooth_fractal_sum_for_the_same_parameters() {
        let turb = create_bitmap(8, 8, None);
        let frac = create_bitmap(8, 8, None);
        let mut tr = region(turb);
        let mut fr = region(frac);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut tr, 8.0, 8.0, 3, 7, true, false, channels);
        fill_bitmap_perlin_noise(&mut fr, 8.0, 8.0, 3, 7, true, false, channels);
        assert_ne!(tr.bitmap.data, fr.bitmap.data);
    }

    #[test]
    fn fills_only_the_given_sub_region() {
        let bmp = create_bitmap(2, 1, Some(0x010203ff));
        let mut r = region_at(bmp, 1, 0, 1, 1);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut r, 8.0, 8.0, 2, 3, false, false, channels);
        assert_eq!(r.bitmap.data[0], 1);
        assert_eq!(r.bitmap.data[1], 2);
        assert_eq!(r.bitmap.data[2], 3);
    }
}
