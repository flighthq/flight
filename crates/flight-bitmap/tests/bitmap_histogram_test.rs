use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod get_bitmap_histogram_fn {
    use super::*;

    #[test]
    fn counts_pixel_values_per_channel() {
        let mut bmp = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0x0a000000);
        set_bitmap_pixel(&mut bmp, 1, 0, 0x0a0000ff);
        let hist = get_bitmap_histogram(&region(bmp));
        assert_eq!(hist.red[0x0a], 2);
        assert_eq!(hist.alpha[0], 1);
        assert_eq!(hist.alpha[255], 1);
        assert_eq!(hist.green[0], 2);
    }

    #[test]
    fn returns_all_zero_bins_for_an_empty_region() {
        let bmp = create_bitmap(2, 2, Some(0xffffffff));
        let hist = get_bitmap_histogram(&region_at(bmp, 0, 0, 0, 0));
        let total: u32 = hist.red.iter().sum();
        assert_eq!(total, 0);
        assert_eq!(hist.red.len(), 256);
    }

    #[test]
    fn counts_only_a_sub_region() {
        let mut bmp = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0x10000000);
        set_bitmap_pixel(&mut bmp, 1, 0, 0x20000000);
        let hist = get_bitmap_histogram(&region_at(bmp, 1, 0, 1, 1));
        assert_eq!(hist.red[0x20], 1);
        assert_eq!(hist.red[0x10], 0);
    }
}

mod equalize_bitmap_histogram_fn {
    use super::*;

    #[test]
    fn spreads_a_narrow_tonal_range_to_fill_0_255() {
        let mut src = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x000000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x808000ff);
        let dest = create_bitmap(2, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        equalize_bitmap_histogram(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[4], 255);
    }

    #[test]
    fn is_safe_in_place() {
        let mut bmp = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut bmp, 0, 0, 0x000000ff);
        set_bitmap_pixel(&mut bmp, 1, 0, 0xff0000ff);
        let sr = region(bmp.clone());
        let mut dr = region(bmp);
        equalize_bitmap_histogram(&mut dr, &sr);
    }

    #[test]
    fn preserves_alpha_unchanged() {
        let src = create_bitmap(1, 1, Some(0x40404080));
        let dest = create_bitmap(1, 1, None);
        let sr = region(src);
        let mut dr = region(dest);
        equalize_bitmap_histogram(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[3], 0x80);
    }
}
