use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
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
    fn copies_source_to_out_without_spreading_when_radius_is_0() {
        let source = vec![0u8, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 8];
        blur_bitmap_pixels_horizontal(&mut out, &source, 2, 1, 0);
        assert_eq!(out[3], 255);
        assert_eq!(out[7], 0);
    }

    #[test]
    fn premultiplying_before_blur_avoids_dark_halo_artifact() {
        let buf = vec![255u8, 0, 0, 255, 0, 0, 0, 0];

        let mut straight = vec![0u8; 8];
        blur_bitmap_pixels_horizontal(&mut straight, &buf, 2, 1, 1);
        assert_eq!(straight[4], 128);

        let mut premul = vec![0u8; 8];
        premultiply_bitmap_pixels(&mut premul, &buf, 8);
        let mut blurred = vec![0u8; 8];
        blur_bitmap_pixels_horizontal(&mut blurred, &premul, 2, 1, 1);
        let mut result = vec![0u8; 8];
        unpremultiply_bitmap_pixels(&mut result, &blurred, 8);
        assert_eq!(result[4], 255);
        assert_eq!(result[7], 128);
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

mod blur_bitmap_pixels_horizontal_weighted_fn {
    use super::*;

    #[test]
    fn applies_gaussian_weights_to_horizontal_neighbors() {
        let mut kernel = vec![0.0f32; 3];
        compute_gaussian_kernel(&mut kernel, 1, 0.8);
        let source = vec![0u8, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 12];
        blur_bitmap_pixels_horizontal_weighted(&mut out, &source, 3, 1, &kernel);
        assert!(out[7] > out[3]);
        assert!(out[7] > out[11]);
    }

    #[test]
    fn identity_kernel_leaves_source_unchanged() {
        let kernel = vec![1.0f32];
        let source = vec![0x11u8, 0x22, 0x33, 0xff];
        let mut out = vec![0u8; 4];
        blur_bitmap_pixels_horizontal_weighted(&mut out, &source, 1, 1, &kernel);
        assert_eq!(out[0], 0x11);
        assert_eq!(out[3], 0xff);
    }
}

mod blur_bitmap_pixels_vertical_fn {
    use super::*;

    #[test]
    fn spreads_alpha_into_vertical_neighbors() {
        let source = vec![0u8, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 12];
        blur_bitmap_pixels_vertical(&mut out, &source, 1, 3, 1);
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }
}

mod blur_bitmap_pixels_vertical_weighted_fn {
    use super::*;

    #[test]
    fn applies_gaussian_weights_to_vertical_neighbors() {
        let mut kernel = vec![0.0f32; 3];
        compute_gaussian_kernel(&mut kernel, 1, 0.8);
        let source = vec![0u8, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0];
        let mut out = vec![0u8; 12];
        blur_bitmap_pixels_vertical_weighted(&mut out, &source, 1, 3, &kernel);
        assert!(out[7] > out[3]);
    }
}

mod box_blur_bitmap_fn {
    use super::*;

    #[test]
    fn spreads_alpha() {
        let mut source = create_bitmap(3, 1, None);
        source.data[7] = 255;
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapBoxBlurOptions { radius_x: Some(2), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert!(out[3] > 0);
        assert!(out[11] > 0);
    }

    #[test]
    fn writes_source_into_out_when_blur_is_zero() {
        let source = create_bitmap(1, 1, Some(0x336699ff));
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapBoxBlurOptions { radius_x: Some(0), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn result_always_lands_in_out_regardless_of_pass_parity() {
        let source = create_bitmap(3, 3, Some(0xffffff88));
        let mut out = vec![0u8; 3 * 3 * 4];
        let mut scratch = vec![0u8; 3 * 3 * 4];
        let opts = BitmapBoxBlurOptions { radius_x: Some(2), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert!(out[3] > 0);
    }

    #[test]
    fn bitmap_data_can_be_used_as_out_for_full_bitmap() {
        let mut bitmap = create_bitmap(3, 1, None);
        bitmap.data[7] = 255;
        let mut scratch = vec![0u8; 3 * 4];
        let r = region(bitmap);
        let mut data = r.bitmap.data.clone();
        let opts = BitmapBoxBlurOptions { radius_x: Some(2), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut data, &mut scratch, &r, &opts);
        assert!(data[3] > 0);
        assert!(data[11] > 0);
    }

    #[test]
    fn blurs_only_the_offset_sub_region() {
        let mut bitmap = create_bitmap(4, 1, None);
        bitmap.data[1 * 4 + 3] = 255;
        bitmap.data[2 * 4 + 3] = 100;
        let mut out = vec![0u8; 2 * 4];
        let mut scratch = vec![0u8; 2 * 4];
        let opts = BitmapBoxBlurOptions { radius_x: Some(2), radius_y: Some(0), passes: None };
        box_blur_bitmap(&mut out, &mut scratch, &region_at(bitmap, 1, 0, 2, 1), &opts);
        assert_eq!(out[3], 178);
        assert_eq!(out[7], 178);
    }
}

mod gaussian_blur_bitmap_fn {
    use super::*;

    #[test]
    fn spreads_alpha_into_neighboring_pixels() {
        let mut source = create_bitmap(5, 1, None);
        source.data[2 * 4 + 3] = 255;
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        gaussian_blur_bitmap(&mut out, &mut scratch, &region(source), 1.0, 1.0, 1);
        assert!(out[3] > 0);
        assert!(out[4 * 4 + 3] > 0);
    }

    #[test]
    fn center_pixel_retains_more_weight_than_edges() {
        let mut source = create_bitmap(5, 1, None);
        source.data[2 * 4 + 3] = 255;
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        gaussian_blur_bitmap(&mut out, &mut scratch, &region(source), 0.8, 0.8, 1);
        assert!(out[2 * 4 + 3] > out[3]);
    }

    #[test]
    fn sigma_zero_writes_source_unchanged() {
        let source = create_bitmap(1, 1, Some(0x336699ff));
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        gaussian_blur_bitmap(&mut out, &mut scratch, &region(source), 0.0, 0.0, 1);
        assert_eq!(out[0], 0x33);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn result_always_lands_in_out_regardless_of_pass_parity() {
        let source = create_bitmap(3, 3, Some(0xffffff88));
        let mut out = vec![0u8; 3 * 3 * 4];
        let mut scratch = vec![0u8; 3 * 3 * 4];
        gaussian_blur_bitmap(&mut out, &mut scratch, &region(source), 1.0, 1.0, 1);
        assert!(out[3] > 0);
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

    #[test]
    fn radius_0_produces_single_weight_of_1() {
        let mut kernel = vec![0.0f32; 1];
        compute_gaussian_kernel(&mut kernel, 0, 1.0);
        assert!((kernel[0] - 1.0).abs() < 1e-10);
    }

    #[test]
    fn sigma_zero_produces_unit_impulse() {
        let mut kernel = vec![9.0f32; 5];
        compute_gaussian_kernel(&mut kernel, 2, 0.0);
        assert_eq!(kernel[2], 1.0);
        assert_eq!(kernel[0], 0.0);
        assert_eq!(kernel[4], 0.0);
        assert!(kernel.iter().all(|v| !v.is_nan()));
    }
}
