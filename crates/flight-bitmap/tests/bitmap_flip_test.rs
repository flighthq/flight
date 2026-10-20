use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod flip_bitmap_horizontal_fn {
    use super::*;

    #[test]
    fn mirrors_left_to_right() {
        let mut src = create_bitmap(3, 1, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 2, 0, 0x00ff00ff);
        let dest = create_bitmap(3, 1, 0);
        let sr = region(src);
        let mut dr = region(dest);
        flip_bitmap_horizontal(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00ff00ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 2, 0), 0xff0000ff);
    }
}

mod flip_bitmap_vertical_fn {
    use super::*;

    #[test]
    fn mirrors_top_to_bottom() {
        let mut src = create_bitmap(1, 3, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 0, 2, 0x00ff00ff);
        let dest = create_bitmap(1, 3, 0);
        let sr = region(src);
        let mut dr = region(dest);
        flip_bitmap_vertical(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00ff00ff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 2), 0xff0000ff);
    }
}
