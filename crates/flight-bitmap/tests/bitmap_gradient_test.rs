use flight_bitmap::*;

mod build_bitmap_gradient_ramp_fn {
    use super::*;

    #[test]
    fn single_color_fills_entire_ramp() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0xff0000], &[1.0], &[0.0]);
        // First entry
        assert_eq!(ramp[0], 0xff);
        assert_eq!(ramp[1], 0x00);
        assert_eq!(ramp[2], 0x00);
        assert_eq!(ramp[3], 255);
        // Last entry
        assert_eq!(ramp[255 * 4], 0xff);
        assert_eq!(ramp[255 * 4 + 3], 255);
    }

    #[test]
    fn two_color_ramp_interpolates() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0x000000, 0xffffff], &[1.0, 1.0], &[0.0, 255.0]);
        // Midpoint should be approximately 128
        let mid = 128 * 4;
        assert!((ramp[mid] as i32 - 128).abs() <= 1);
    }

    #[test]
    fn empty_ratios_fills_zeros() {
        let mut ramp = vec![0xffu8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[], &[], &[]);
        assert_eq!(ramp[0], 0);
        assert_eq!(ramp[1023], 0);
    }
}

mod gradient_glow_bitmap_fn {
    use super::*;

    fn region(bmp: Bitmap) -> BitmapRegion {
        let w = bmp.width as i32;
        let h = bmp.height as i32;
        BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
    }

    #[test]
    fn produces_non_zero_output_for_opaque_source() {
        let src = create_bitmap(8, 8, 0xffffffff);
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0xff0000], &[1.0], &[128.0]);
        let opts = BitmapGradientGlowOptions {
            intensity: Some(1.0),
            radius_x: Some(1.0),
            radius_y: Some(1.0),
            passes: Some(1),
        };
        gradient_glow_bitmap(&mut out, &mut scratch, &sr, &ramp, &opts);
        let has_nonzero = out.iter().any(|&b| b != 0);
        assert!(has_nonzero);
    }
}
