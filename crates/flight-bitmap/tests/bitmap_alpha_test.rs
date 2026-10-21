use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod copy_bitmap_alpha {
    use super::*;

    #[test]
    fn copies_alpha_from_source_to_dest_leaving_rgb_unchanged() {
        let mut src = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x00000080);
        set_bitmap_pixel(&mut src, 1, 0, 0x000000ff);
        let dst = create_bitmap(2, 1, Some(0xff00ffff));
        let mut dr = region(dst);
        let sr = region(src);
        copy_bitmap_alpha(&mut dr, &sr);
        assert_eq!((get_bitmap_pixel(&dr.bitmap, 0, 0) >> 24) & 0xff, 0xff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0) & 0xff, 0x80);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0) & 0xff, 0xff);
    }

    #[test]
    fn same_bitmap_region_is_a_noop_on_alpha() {
        let surf = create_bitmap(2, 1, Some(0x112233aa));
        let mut dr = region(surf.clone());
        let sr = region(surf);
        copy_bitmap_alpha(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0) & 0xff, 0xaa);
    }

    #[test]
    fn operates_only_on_the_overlap_of_both_regions() {
        let src = create_bitmap(3, 1, Some(0x00000080));
        let dst = create_bitmap(3, 1, None);
        let mut dr = region_at(dst, 0, 0, 1, 1);
        let sr = region_at(src, 0, 0, 1, 1);
        copy_bitmap_alpha(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0) & 0xff, 0x80);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0) & 0xff, 0x00);
    }
}

mod multiply_bitmap_alpha {
    use super::*;

    #[test]
    fn factor_0_makes_region_fully_transparent() {
        let surf = create_bitmap(2, 2, Some(0xff0000ff));
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 0.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 1, 1) & 0xff, 0);
    }

    #[test]
    fn factor_1_leaves_alpha_unchanged() {
        let surf = create_bitmap(1, 1, Some(0xff0000ab));
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 1.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0xab);
    }

    #[test]
    fn factor_half_halves_the_alpha() {
        let surf = create_bitmap(1, 1, Some(0xff0000fe));
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 0.5);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 127);
    }

    #[test]
    fn clamps_factor_to_0_1() {
        let surf = create_bitmap(1, 1, Some(0xff0000aa));
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 2.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0xaa);
    }

    #[test]
    fn leaves_rgb_channels_unchanged() {
        let surf = create_bitmap(1, 1, Some(0x123456ff));
        let mut r = region(surf);
        multiply_bitmap_alpha(&mut r, 0.5);
        let p = get_bitmap_pixel(&r.bitmap, 0, 0);
        assert_eq!((p >> 24) & 0xff, 0x12);
        assert_eq!((p >> 16) & 0xff, 0x34);
        assert_eq!((p >> 8) & 0xff, 0x56);
    }
}

mod set_bitmap_alpha {
    use super::*;

    #[test]
    fn writes_a_constant_alpha_to_all_pixels_in_region() {
        let surf = create_bitmap(3, 3, Some(0xff0000ff));
        let mut r = region(surf);
        set_bitmap_alpha(&mut r, 0x40 as f32);
        for y in 0..3 {
            for x in 0..3 {
                assert_eq!(get_bitmap_pixel(&r.bitmap, x, y) & 0xff, 0x40);
            }
        }
    }

    #[test]
    fn clamps_alpha_to_0_255() {
        let surf = create_bitmap(1, 1, Some(0xff0000ff));
        let mut r = region(surf);
        set_bitmap_alpha(&mut r, -10.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0);
        set_bitmap_alpha(&mut r, 300.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 255);
    }

    #[test]
    fn leaves_rgb_unchanged() {
        let surf = create_bitmap(1, 1, Some(0x112233ff));
        let mut r = region(surf);
        set_bitmap_alpha(&mut r, 0x80 as f32);
        let p = get_bitmap_pixel(&r.bitmap, 0, 0);
        assert_eq!((p >> 24) & 0xff, 0x11);
        assert_eq!((p >> 16) & 0xff, 0x22);
        assert_eq!((p >> 8) & 0xff, 0x33);
        assert_eq!(p & 0xff, 0x80);
    }

    #[test]
    fn only_affects_the_specified_sub_region() {
        let surf = create_bitmap(4, 1, Some(0xff0000ff));
        let mut r = region_at(surf, 1, 0, 2, 1);
        set_bitmap_alpha(&mut r, 0.0);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0) & 0xff, 0xff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 1, 0) & 0xff, 0x00);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 2, 0) & 0xff, 0x00);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 3, 0) & 0xff, 0xff);
    }
}
