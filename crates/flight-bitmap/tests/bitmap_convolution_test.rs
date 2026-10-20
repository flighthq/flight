use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod convolve_bitmap_fn {
    use super::*;

    #[test]
    fn applies_convolution_matrix() {
        let mut source = create_bitmap(3, 1, 0);
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
    fn preserves_source_alpha_by_default() {
        let source = create_bitmap(1, 1, 0x00000044);
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
}
