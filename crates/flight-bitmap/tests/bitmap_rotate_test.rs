use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod rotate_bitmap_180_fn {
    use super::*;

    #[test]
    fn reverses_pixel_order() {
        let mut src = create_bitmap(3, 1, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x00ff00ff);
        set_bitmap_pixel(&mut src, 2, 0, 0x0000ffff);
        let dest = create_bitmap(3, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        rotate_bitmap_180(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x0000ffff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), 0x00ff00ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 2, 0), 0xff0000ff);
    }
}

mod rotate_bitmap_clockwise_fn {
    use super::*;

    #[test]
    fn rotates_2x2() {
        let mut src = create_bitmap(2, 2, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff); // TL -> TR
        set_bitmap_pixel(&mut src, 1, 0, 0x00ff00ff); // TR -> BR
        set_bitmap_pixel(&mut src, 0, 1, 0x0000ffff); // BL -> TL
        set_bitmap_pixel(&mut src, 1, 1, 0xffffffff); // BR -> BL
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        rotate_bitmap_clockwise(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x0000ffff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0x00ff00ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 1), 0xffffffff);
    }
}

mod rotate_bitmap_counter_clockwise_fn {
    use super::*;

    #[test]
    fn rotates_2x2() {
        let mut src = create_bitmap(2, 2, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff); // TL -> BL
        set_bitmap_pixel(&mut src, 1, 0, 0x00ff00ff); // TR -> TL
        set_bitmap_pixel(&mut src, 0, 1, 0x0000ffff); // BL -> BR
        set_bitmap_pixel(&mut src, 1, 1, 0xffffffff); // BR -> TR
        let dest = create_bitmap(2, 2, 0);
        let sr = region(src);
        let mut dr = region(dest);
        rotate_bitmap_counter_clockwise(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00ff00ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 0), 0xffffffff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 1), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0x0000ffff);
    }
}
