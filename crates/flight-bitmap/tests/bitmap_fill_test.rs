use flight_bitmap::*;

mod fill_bitmap_rectangle_fn {
    use super::*;

    #[test]
    fn fills_specified_region() {
        let img = create_bitmap(4, 4, 0);
        let mut r = BitmapRegion { bitmap: img, x: 1, y: 1, width: 2, height: 2 };
        fill_bitmap_rectangle(&mut r, 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 1, 1), 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 2, 2), 0xaabbccff);
    }

    #[test]
    fn does_not_affect_outside() {
        let img = create_bitmap(4, 4, 0);
        let mut r = BitmapRegion { bitmap: img, x: 1, y: 1, width: 2, height: 2 };
        fill_bitmap_rectangle(&mut r, 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0), 0x00000000);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 3, 3), 0x00000000);
    }
}

mod flood_fill_bitmap_fn {
    use super::*;

    #[test]
    fn fills_connected_region() {
        let mut img = create_bitmap(3, 3, 0xffffffff);
        flood_fill_bitmap(&mut img, 0, 0, 0x000000ff);
        for py in 0..3 {
            for px in 0..3 {
                assert_eq!(get_bitmap_pixel(&img, px, py), 0x000000ff);
            }
        }
    }

    #[test]
    fn does_not_cross_barrier() {
        let mut img = create_bitmap(3, 3, 0xffffffff);
        // Barrier in column 1
        for py in 0..3 {
            let i = (py * 3 + 1) * 4;
            img.data[i as usize] = 0;
            img.data[i as usize + 1] = 0;
            img.data[i as usize + 2] = 0;
            img.data[i as usize + 3] = 0xff;
        }
        flood_fill_bitmap(&mut img, 0, 0, 0x0000ffff);
        assert_eq!(get_bitmap_pixel(&img, 0, 0), 0x0000ffff);
        assert_eq!(get_bitmap_pixel(&img, 2, 0), 0xffffffff);
    }

    #[test]
    fn noop_when_fill_matches_target() {
        let mut img = create_bitmap(2, 2, 0x112233ff);
        flood_fill_bitmap(&mut img, 0, 0, 0x112233ff);
        assert_eq!(get_bitmap_pixel(&img, 0, 0), 0x112233ff);
    }
}
