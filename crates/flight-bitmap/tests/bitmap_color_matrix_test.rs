use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

fn apply_to(rgba: u32, matrix: &[f32]) -> Vec<u8> {
    let bmp = create_bitmap(1, 1, rgba);
    let mut out = vec![0u8; 4];
    color_matrix_bitmap(&mut out, &region(bmp), matrix);
    out
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
