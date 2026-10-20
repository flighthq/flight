use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod copy_bitmap_alpha_fn {
    use super::*;

    #[test]
    fn copies_alpha_leaving_rgb_unchanged() {
        let mut src = create_bitmap(2, 1, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0x00000080);
        set_bitmap_pixel(&mut src, 1, 0, 0x000000ff);
        let dst = create_bitmap(2, 1, 0xff00ffff);
        let mut dr = region(dst);
        let sr = region(src);
        copy_bitmap_alpha(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0) & 0xff, 0x80);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0) & 0xff, 0xff);
    }
}

mod multiply_bitmap_alpha_fn {
    use super::*;

    #[test]
    fn factor_zero_makes_transparent() {
        let surf = create_bitmap(2, 2, 0xff0000ff);
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 0.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0);
    }

    #[test]
    fn factor_one_leaves_unchanged() {
        let surf = create_bitmap(1, 1, 0xff0000ab);
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 1.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0xab);
    }

    #[test]
    fn factor_half_halves_alpha() {
        let surf = create_bitmap(1, 1, 0xff0000fe);
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 0.5);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 127);
    }
}

mod set_bitmap_alpha_fn {
    use super::*;

    #[test]
    fn writes_constant_alpha() {
        let surf = create_bitmap(3, 3, 0xff0000ff);
        let mut r = region(surf);
        set_bitmap_alpha(&mut r, 0x40 as f32);
        for y in 0..3 {
            for x in 0..3 {
                assert_eq!(get_bitmap_pixel(&r.bitmap, x, y) & 0xff, 0x40);
            }
        }
    }
}
