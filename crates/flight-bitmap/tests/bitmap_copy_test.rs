use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod copy_bitmap_channel_fn {
    use super::*;

    #[test]
    fn copies_red_to_blue() {
        let mut src = create_bitmap(2, 2, 0);
        src.data[0] = 0xab;
        let dst = create_bitmap(2, 2, 0);
        let mut dr = region(dst);
        copy_bitmap_channel(&mut dr, ImageChannel::Blue, &region(src), ImageChannel::Red);
        assert_eq!(dr.bitmap.data[2], 0xab);
    }
}

mod copy_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn copies_without_alpha_blend() {
        let src = create_bitmap(2, 2, 0xaabbccff);
        let dst = create_bitmap(4, 4, 0);
        let mut dr = BitmapRegion { bitmap: dst, x: 1, y: 1, width: 2, height: 2 };
        let sr = region(src);
        copy_bitmap_pixels(&mut dr, &sr, false);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }
}
