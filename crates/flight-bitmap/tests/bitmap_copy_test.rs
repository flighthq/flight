use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod copy_bitmap_channel_fn {
    use super::*;

    #[test]
    fn copies_the_red_channel_to_the_blue_channel() {
        let mut src = create_bitmap(2, 2, None);
        src.data[0] = 0xab;
        let dst = create_bitmap(2, 2, None);
        let mut dr = region(dst);
        copy_bitmap_channel(&mut dr, ImageChannel::Blue, &region(src), ImageChannel::Red);
        assert_eq!(dr.bitmap.data[2], 0xab);
    }

    #[test]
    fn copies_the_alpha_channel_independently() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x000000de);
        let dst = create_bitmap(1, 1, None);
        let mut dr = region(dst);
        copy_bitmap_channel(&mut dr, ImageChannel::Alpha, &region(src), ImageChannel::Alpha);
        assert_eq!(dr.bitmap.data[3], 0xde);
    }
}

mod copy_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn copies_a_region_without_alpha_blend() {
        let src = create_bitmap(2, 2, Some(0xaabbccff));
        let dst = create_bitmap(4, 4, None);
        let mut dr = region_at(dst, 1, 1, 2, 2);
        let sr = region(src);
        copy_bitmap_pixels(&mut dr, &sr, false);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 1, 1), 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0x00000000);
    }

    #[test]
    fn alpha_composites_when_composite_is_true() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff000080);
        let mut dst = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut dst, 0, 0, 0x0000ffff);
        let sr = region(src);
        let mut dr = region(dst);
        copy_bitmap_pixels(&mut dr, &sr, true);
        let result = get_bitmap_pixel(&dr.bitmap, 0, 0);
        assert_eq!(result & 0xff, 0xff);
        assert!((result >> 24) & 0xff > 0);
        assert!((result >> 8) & 0xff > 0);
    }
}
