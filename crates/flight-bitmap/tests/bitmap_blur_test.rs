use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod blur_bitmap_pixels_horizontal_fn {
    use super::*;

    #[test]
    fn spreads_alpha_into_horizontal_neighbors() {
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 12];
        blur_bitmap_pixels_horizontal(&mut out, &source, 3, 1, 1);
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }

    #[test]
    fn correct_edge_average_for_single_row() {
        let source = vec![0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 12];
        blur_bitmap_pixels_horizontal(&mut out, &source, 3, 1, 1);
        assert_eq!(out[3], 128);
        assert_eq!(out[7], 85);
        assert_eq!(out[11], 128);
    }
}

mod compute_gaussian_kernel_fn {
    use super::*;

    #[test]
    fn sums_to_one() {
        let mut kernel = vec![0.0f32; 7];
        compute_gaussian_kernel(&mut kernel, 3, 1.0);
        let sum: f32 = kernel.iter().sum();
        assert!((sum - 1.0).abs() < 1e-5);
    }

    #[test]
    fn is_symmetric() {
        let mut kernel = vec![0.0f32; 9];
        compute_gaussian_kernel(&mut kernel, 4, 1.5);
        for i in 0..4 {
            assert!((kernel[i] - kernel[8 - i]).abs() < 1e-10);
        }
    }

    #[test]
    fn center_weight_is_largest() {
        let mut kernel = vec![0.0f32; 5];
        compute_gaussian_kernel(&mut kernel, 2, 1.0);
        assert!(kernel[2] > kernel[1]);
        assert!(kernel[1] > kernel[0]);
    }
}

mod box_blur_bitmap_fn {
    use super::*;

    #[test]
    fn spreads_alpha() {
        let mut source = create_bitmap(3, 1, 0);
        source.data[7] = 255;
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapBoxBlurOptions { radius_x: Some(2), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }
}
