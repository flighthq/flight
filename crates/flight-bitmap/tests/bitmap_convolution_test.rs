use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod convolve_bitmap {
    use super::*;

    #[test]
    fn applies_a_convolution_matrix_to_the_source_region() {
        let mut source = create_bitmap(3, 1, None);
        source.data[0] = 10;
        source.data[4] = 20;
        source.data[8] = 30;
        let mut out = vec![0u8; 4];
        let sr = BitmapRegion { bitmap: source, x: 1, y: 0, width: 1, height: 1 };
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0, 1.0, 1.0],
            matrix_x: 3,
            matrix_y: 1,
            divisor: None,
            bias: None,
            edge: None,
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &sr, &opts);
        assert_eq!(out[0], 20);
    }

    #[test]
    fn clamp_edge_mode_repeats_the_nearest_edge_pixel() {
        let source = create_bitmap(1, 1, Some(0x606060ff));
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0, 1.0, 1.0],
            matrix_x: 3,
            matrix_y: 1,
            divisor: Some(3.0),
            bias: None,
            edge: None,
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 0x60);
    }

    #[test]
    fn mirror_edge_mode_reflects_at_boundaries() {
        let mut source = create_bitmap(3, 1, None);
        source.data[0] = 10;
        source.data[4] = 20;
        source.data[8] = 30;
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0, 0.0, 0.0, 0.0, 0.0],
            matrix_x: 5,
            matrix_y: 1,
            divisor: Some(1.0),
            bias: None,
            edge: Some(BitmapEdgeMode::Mirror),
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 20);
    }

    #[test]
    fn transparent_edge_mode_treats_out_of_bounds_as_transparent_black() {
        let source = create_bitmap(1, 1, Some(0x000000ff));
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0, 0.0, 0.0],
            matrix_x: 3,
            matrix_y: 1,
            divisor: Some(1.0),
            bias: None,
            edge: Some(BitmapEdgeMode::Transparent),
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 0);
        assert_eq!(out[3], 0);
    }

    #[test]
    fn wrap_edge_mode_tiles_the_source_toroidally() {
        let mut source = create_bitmap(3, 1, None);
        source.data[0] = 10;
        source.data[4] = 20;
        source.data[8] = 30;
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0, 0.0, 0.0],
            matrix_x: 3,
            matrix_y: 1,
            divisor: Some(1.0),
            bias: None,
            edge: Some(BitmapEdgeMode::Wrap),
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 30);
    }

    #[test]
    fn preserves_source_alpha_by_default() {
        let source = create_bitmap(1, 1, Some(0x00000044));
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0],
            matrix_x: 1,
            matrix_y: 1,
            divisor: None,
            bias: Some(255.0),
            edge: None,
            preserve_alpha: None,
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[3], 0x44);
    }

    #[test]
    #[should_panic(expected = "dimensions must be positive")]
    fn panics_when_matrix_dimensions_are_not_positive() {
        let source = create_bitmap(1, 1, None);
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![],
            matrix_x: 0,
            matrix_y: 1,
            divisor: None,
            bias: None,
            edge: None,
            preserve_alpha: None,
        };
        convolve_bitmap(&mut out, &region(source), &opts);
    }

    #[test]
    #[should_panic(expected = "does not match")]
    fn panics_when_matrix_is_too_short_for_its_declared_dimensions() {
        let source = create_bitmap(1, 1, None);
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0],
            matrix_x: 3,
            matrix_y: 3,
            divisor: None,
            bias: None,
            edge: None,
            preserve_alpha: None,
        };
        convolve_bitmap(&mut out, &region(source), &opts);
    }

    #[test]
    fn treats_explicit_divisor_of_0_as_passthrough() {
        let source = create_bitmap(1, 1, Some(0x804020ff));
        let mut out = vec![0u8; 4];
        let opts = BitmapConvolutionOptions {
            matrix: vec![1.0],
            matrix_x: 1,
            matrix_y: 1,
            divisor: Some(0.0),
            bias: None,
            edge: None,
            preserve_alpha: Some(false),
        };
        convolve_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 0x80);
    }
}
