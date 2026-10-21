use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod get_bitmap_color_bounds_rectangle {
    use super::*;

    #[test]
    fn returns_none_when_no_pixels_match() {
        let bmp = create_bitmap(4, 4, None);
        let r = region(bmp);
        let result = get_bitmap_color_bounds_rectangle(&r, 0xffffffff, 0xffffffff, true);
        assert!(result.is_none());
    }

    #[test]
    fn finds_the_bounding_rect_of_matching_pixels() {
        let mut bmp = create_bitmap(8, 8, None);
        let mut fill_r = BitmapRegion { bitmap: bmp, x: 2, y: 3, width: 3, height: 2 };
        fill_bitmap_rectangle(&mut fill_r, 0xff0000ff);
        bmp = fill_r.bitmap;
        let r = region(bmp);
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xffffffff, 0xff0000ff, true).unwrap();
        assert_eq!(rect.x, 2.0);
        assert_eq!(rect.y, 3.0);
        assert_eq!(rect.width, 3.0);
        assert_eq!(rect.height, 2.0);
    }

    #[test]
    fn finds_non_matching_pixels_when_find_color_is_false() {
        let mut bmp = create_bitmap(4, 4, Some(0xffffffff));
        let mut fill_r = BitmapRegion { bitmap: bmp, x: 1, y: 1, width: 2, height: 2 };
        fill_bitmap_rectangle(&mut fill_r, 0x000000ff);
        bmp = fill_r.bitmap;
        let r = region(bmp);
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xffffffff, 0xffffffff, false).unwrap();
        assert_eq!(rect.x, 1.0);
        assert_eq!(rect.y, 1.0);
        assert_eq!(rect.width, 2.0);
        assert_eq!(rect.height, 2.0);
    }

    #[test]
    fn respects_the_mask() {
        let bmp = create_bitmap(2, 2, Some(0x112233ff));
        let r = region(bmp);
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xff0000ff, 0x110000ff, true);
        assert!(rect.is_some());
    }

    #[test]
    fn reports_bitmap_absolute_coordinates_when_scanning_a_sub_region() {
        let mut bmp = create_bitmap(8, 8, None);
        let mut fill_r = BitmapRegion { bitmap: bmp, x: 5, y: 5, width: 2, height: 2 };
        fill_bitmap_rectangle(&mut fill_r, 0xff0000ff);
        bmp = fill_r.bitmap;
        let r = region_at(bmp, 4, 4, 4, 4);
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xffffffff, 0xff0000ff, true).unwrap();
        assert_eq!(rect.x, 5.0);
        assert_eq!(rect.y, 5.0);
        assert_eq!(rect.width, 2.0);
        assert_eq!(rect.height, 2.0);
    }
}
