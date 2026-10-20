use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod fill_bitmap_noise_fn {
    use super::*;

    #[test]
    fn is_deterministic() {
        let a = create_bitmap(8, 8, 0);
        let b = create_bitmap(8, 8, 0);
        let mut ar = region(a);
        let mut br = region(b);
        fill_bitmap_noise(&mut ar, 42, 0, 255, false);
        fill_bitmap_noise(&mut br, 42, 0, 255, false);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn grayscale_has_equal_rgb() {
        let bmp = create_bitmap(4, 4, 0);
        let mut r = region(bmp);
        fill_bitmap_noise(&mut r, 7, 0, 255, true);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i], r.bitmap.data[i + 1]);
            assert_eq!(r.bitmap.data[i + 1], r.bitmap.data[i + 2]);
        }
    }

    #[test]
    fn alpha_is_always_255() {
        let bmp = create_bitmap(4, 4, 0);
        let mut r = region(bmp);
        fill_bitmap_noise(&mut r, 99, 0, 255, false);
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }
}

mod fill_bitmap_perlin_noise_fn {
    use super::*;

    #[test]
    fn fills_with_values_in_range() {
        let bmp = create_bitmap(8, 8, 0);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_perlin_noise(&mut r, 4.0, 4.0, 2, 42, false, false, channels);
        // Alpha should be 255 since BITMAP_NOISE_CHANNEL_A is not set
        for i in (0..r.bitmap.data.len()).step_by(4) {
            assert_eq!(r.bitmap.data[i + 3], 255);
        }
    }
}

mod fill_bitmap_turbulence_fn {
    use super::*;

    #[test]
    fn produces_nonzero_output() {
        let bmp = create_bitmap(8, 8, 0);
        let mut r = region(bmp);
        let channels = BITMAP_NOISE_CHANNEL_R | BITMAP_NOISE_CHANNEL_G | BITMAP_NOISE_CHANNEL_B;
        fill_bitmap_turbulence(&mut r, 4.0, 4.0, 2, 42, false, false, channels);
        let has_nonzero = r.bitmap.data.chunks(4).any(|px| px[0] > 0 || px[1] > 0 || px[2] > 0);
        assert!(has_nonzero);
    }
}
