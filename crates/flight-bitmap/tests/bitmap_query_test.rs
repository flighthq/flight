use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod get_bitmap_color_bounds_rectangle_fn {
    use super::*;

    #[test]
    fn finds_matching_pixels() {
        let mut bmp = create_bitmap(4, 4, 0x000000ff);
        set_bitmap_pixel(&mut bmp, 1, 1, 0xff0000ff);
        set_bitmap_pixel(&mut bmp, 2, 2, 0xff0000ff);
        let r = region(bmp);
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xffffff00, 0xff000000, true).unwrap();
        assert_eq!(rect.x, 1.0);
        assert_eq!(rect.y, 1.0);
        assert_eq!(rect.width, 2.0);
        assert_eq!(rect.height, 2.0);
    }

    #[test]
    fn returns_none_when_no_match() {
        let bmp = create_bitmap(4, 4, 0x000000ff);
        let r = region(bmp);
        let result = get_bitmap_color_bounds_rectangle(&r, 0xffffff00, 0xff000000, true);
        assert!(result.is_none());
    }

    #[test]
    fn find_color_false_matches_nonmatching() {
        let bmp = create_bitmap(2, 2, 0x000000ff);
        let r = region(bmp);
        // find_color=false with color=0xff0000ff mask=0xffffffff should find all pixels
        let rect = get_bitmap_color_bounds_rectangle(&r, 0xffffffff, 0xff0000ff, false).unwrap();
        assert_eq!(rect.width, 2.0);
        assert_eq!(rect.height, 2.0);
    }
}
