use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

fn apply_to(rgba: u32, matrix: &[f32]) -> Vec<u8> {
    let bmp = create_bitmap(1, 1, Some(rgba));
    let mut out = vec![0u8; 4];
    color_matrix_bitmap(&mut out, &region(bmp), matrix);
    return out;
}

mod build_bitmap_brightness_color_matrix_fn {
    use super::*;

    #[test]
    fn multiplies_rgb_by_amount() {
        let mut m = [0.0f32; 20];
        build_bitmap_brightness_color_matrix(&mut m, 0.5);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 100);
        assert_eq!(out[1], 50);
        assert_eq!(out[2], 25);
        assert_eq!(out[3], 0xff);
    }
}

mod build_bitmap_contrast_color_matrix_fn {
    use super::*;

    #[test]
    fn amount_0_flattens_every_channel_to_mid_grey() {
        let mut m = [0.0f32; 20];
        build_bitmap_contrast_color_matrix(&mut m, 0.0);
        let out = apply_to(0xc80000ff, &m);
        assert_eq!(out[0], 128);
        assert_eq!(out[1], 128);
    }
}

mod build_bitmap_grayscale_color_matrix_fn {
    use super::*;

    #[test]
    fn maps_pure_red_to_luma() {
        let mut m = [0.0f32; 20];
        build_bitmap_grayscale_color_matrix(&mut m);
        let out = apply_to(0xff0000ff, &m);
        assert_eq!(out[0], 54);
        assert_eq!(out[1], 54);
        assert_eq!(out[2], 54);
    }
}

mod build_bitmap_hue_rotation_color_matrix_fn {
    use super::*;

    #[test]
    fn leaves_grey_unchanged_at_any_angle() {
        let mut m = [0.0f32; 20];
        build_bitmap_hue_rotation_color_matrix(&mut m, 70.7);
        let out = apply_to(0x808080ff, &m);
        assert_eq!(out[0], 128);
        assert_eq!(out[1], 128);
        assert_eq!(out[2], 128);
    }

    #[test]
    fn is_identity_at_0_degrees() {
        let mut m = [0.0f32; 20];
        build_bitmap_hue_rotation_color_matrix(&mut m, 0.0);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
    }

    #[test]
    fn is_identity_at_360_degrees() {
        let mut m = [0.0f32; 20];
        build_bitmap_hue_rotation_color_matrix(&mut m, 360.0);
        let out = apply_to(0xc86432ff, &m);
        assert!((out[0] as f32 - 200.0).abs() < 1.5);
        assert!((out[1] as f32 - 100.0).abs() < 1.5);
        assert!((out[2] as f32 - 50.0).abs() < 1.5);
    }
}

mod build_bitmap_invert_color_matrix_fn {
    use super::*;

    #[test]
    fn inverts_rgb_preserves_alpha() {
        let mut m = [0.0f32; 20];
        build_bitmap_invert_color_matrix(&mut m);
        let out = apply_to(0xc83200ff, &m);
        assert_eq!(out[0], 55);
        assert_eq!(out[1], 205);
        assert_eq!(out[2], 255);
        assert_eq!(out[3], 0xff);
    }
}

mod build_bitmap_saturation_color_matrix_fn {
    use super::*;

    #[test]
    fn amount_1_is_identity() {
        let mut m = [0.0f32; 20];
        build_bitmap_saturation_color_matrix(&mut m, 1.0);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
    }

    #[test]
    fn amount_0_equals_grayscale() {
        let mut m = [0.0f32; 20];
        build_bitmap_saturation_color_matrix(&mut m, 0.0);
        let out = apply_to(0xff0000ff, &m);
        assert_eq!(out[0], 54);
        assert_eq!(out[1], 54);
    }
}

mod build_bitmap_sepia_color_matrix_fn {
    use super::*;

    #[test]
    fn maps_pure_red_to_sepia_tone() {
        let mut m = [0.0f32; 20];
        build_bitmap_sepia_color_matrix(&mut m);
        let out = apply_to(0xff0000ff, &m);
        assert_eq!(out[0], 100);
        assert_eq!(out[1], 89);
        assert_eq!(out[2], 69);
    }
}

mod color_matrix_bitmap_fn {
    use super::*;

    #[test]
    fn applies_a_4x5_color_matrix_to_source_region() {
        let source = create_bitmap(1, 1, Some(0x204060ff));
        let mut out = vec![0u8; 4];
        let m: [f32; 20] = [0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 0.0, 20.0, 0.0, 0.0, 0.0, 0.0, 30.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        color_matrix_bitmap(&mut out, &region(source), &m);
        assert_eq!(out[0], 10);
        assert_eq!(out[1], 20);
        assert_eq!(out[2], 30);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn is_safe_when_out_aliases_source_bitmap_data() {
        let mut bitmap = create_bitmap(1, 1, Some(0x010203ff));
        let m: [f32; 20] = [1.0, 0.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0, 0.0, 20.0, 0.0, 0.0, 1.0, 0.0, 30.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let r = region(bitmap);
        let mut data = r.bitmap.data.clone();
        color_matrix_bitmap(&mut data, &r, &m);
        assert_eq!(data[0], 11);
        assert_eq!(data[1], 22);
        assert_eq!(data[2], 33);
        assert_eq!(data[3], 0xff);
    }

    #[test]
    fn clamps_output_to_0_255() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let mut out = vec![0u8; 4];
        let m: [f32; 20] = [10.0, 0.0, 0.0, 0.0, 100.0, 0.0, 0.0, 0.0, 0.0, -50.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        color_matrix_bitmap(&mut out, &region(source), &m);
        assert_eq!(out[0], 255);
        assert_eq!(out[1], 0);
    }

    #[test]
    #[should_panic(expected = "Color matrix filter requires 20 values")]
    fn panics_when_matrix_is_too_short() {
        let source = create_bitmap(1, 1, None);
        let mut out = vec![0u8; 4];
        color_matrix_bitmap(&mut out, &region(source), &[]);
    }

    #[test]
    fn silently_skips_pixels_outside_source_bounds() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let mut out = vec![0u8; 4 * 4];
        let identity: [f32; 20] = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        color_matrix_bitmap(&mut out, &region_at(source, -1, -1, 2, 2), &identity);
        let i = (1 * 2 + 1) * 4;
        assert_eq!(out[i], 0xff);
        assert_eq!(out[0], 0);
    }
}

mod concat_bitmap_color_matrix_fn {
    use super::*;

    #[test]
    fn composes_two_matrices() {
        let mut bright2 = [0.0f32; 20];
        let mut half = [0.0f32; 20];
        build_bitmap_brightness_color_matrix(&mut bright2, 2.0);
        build_bitmap_brightness_color_matrix(&mut half, 0.5);
        let mut out = [0.0f32; 20];
        concat_bitmap_color_matrix(&mut out, &bright2, &half);
        let pixel = apply_to(0xc86432ff, &out);
        assert_eq!(pixel[0], 200);
        assert_eq!(pixel[1], 100);
        assert_eq!(pixel[2], 50);
    }

    #[test]
    fn carries_the_offset_through_composition() {
        let mut identity = [0.0f32; 20];
        let mut invert = [0.0f32; 20];
        set_bitmap_color_matrix_identity(&mut identity);
        build_bitmap_invert_color_matrix(&mut invert);
        let mut out = [0.0f32; 20];
        concat_bitmap_color_matrix(&mut out, &identity, &invert);
        let pixel = apply_to(0xc80000ff, &out);
        assert_eq!(pixel[0], 55);
    }
}

mod set_bitmap_color_matrix_identity_fn {
    use super::*;

    #[test]
    fn leaves_pixel_unchanged() {
        let mut m = [0.0f32; 20];
        set_bitmap_color_matrix_identity(&mut m);
        let out = apply_to(0xc86432ff, &m);
        assert_eq!(out[0], 200);
        assert_eq!(out[1], 100);
        assert_eq!(out[2], 50);
        assert_eq!(out[3], 0xff);
    }
}
