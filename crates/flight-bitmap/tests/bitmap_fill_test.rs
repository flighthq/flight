use flight_bitmap::*;

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod fill_bitmap_rectangle_fn {
    use super::*;

    #[test]
    fn fills_the_specified_region() {
        let img = create_bitmap(4, 4, 0);
        let mut r = region_at(img, 1, 1, 2, 2);
        fill_bitmap_rectangle(&mut r, 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 1, 1), 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 2, 2), 0xaabbccff);
    }

    #[test]
    fn bumps_the_bitmap_version() {
        let img = create_bitmap(4, 4, 0);
        let before = img.version;
        let mut r = region_at(img, 1, 1, 2, 2);
        fill_bitmap_rectangle(&mut r, 0xaabbccff);
        assert!(r.bitmap.version > before);
    }

    #[test]
    fn does_not_affect_pixels_outside_the_region() {
        let img = create_bitmap(4, 4, 0);
        let mut r = region_at(img, 1, 1, 2, 2);
        fill_bitmap_rectangle(&mut r, 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0), 0x00000000);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 3, 3), 0x00000000);
    }

    #[test]
    fn skips_pixels_outside_the_bitmap_bounds() {
        let img = create_bitmap(2, 2, 0x000000ff);
        let mut r = region_at(img, -1, -1, 4, 4);
        fill_bitmap_rectangle(&mut r, 0xffffffff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 0, 0), 0xffffffff);
        assert_eq!(get_bitmap_pixel(&r.bitmap, 1, 1), 0xffffffff);
    }
}

mod flood_fill_bitmap_fn {
    use super::*;

    #[test]
    fn fills_a_connected_region() {
        let mut img = create_bitmap(3, 3, 0xffffffff);
        flood_fill_bitmap(&mut img, 0, 0, 0x000000ff);
        for py in 0..3 {
            for px in 0..3 {
                assert_eq!(get_bitmap_pixel(&img, px, py), 0x000000ff);
            }
        }
    }

    #[test]
    fn does_not_cross_a_barrier() {
        let mut img = create_bitmap(3, 3, 0xffffffff);
        for py in 0..3i32 {
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
    fn is_a_noop_when_fill_color_matches_target() {
        let mut img = create_bitmap(2, 2, 0x112233ff);
        flood_fill_bitmap(&mut img, 0, 0, 0x112233ff);
        assert_eq!(get_bitmap_pixel(&img, 0, 0), 0x112233ff);
    }

    #[test]
    fn reuses_the_scratch_buffer_across_calls() {
        let mut img = create_bitmap(4, 4, 0xffffffff);
        flood_fill_bitmap(&mut img, 0, 0, 0x000000ff);
        flood_fill_bitmap(&mut img, 0, 0, 0xffffffff);
        assert_eq!(get_bitmap_pixel(&img, 0, 0), 0xffffffff);
    }
}
