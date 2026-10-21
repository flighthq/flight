use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn ramp(width: u32, height: u32) -> Bitmap {
    let mut bmp = create_bitmap(width, height, None);
    for i in 0..(width * height) as usize {
        bmp.data[i * 4] = i as u8;
        bmp.data[i * 4 + 3] = 255;
    }
    return bmp;
}

mod flip_bitmap_horizontal_fn {
    use super::*;

    #[test]
    fn mirrors_columns_left_to_right_into_a_separate_dest() {
        let source = ramp(3, 1);
        let out = create_bitmap(3, 1, None);
        let sr = region(source);
        let mut dr = region(out);
        flip_bitmap_horizontal(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 2);
        assert_eq!(dr.bitmap.data[4], 1);
        assert_eq!(dr.bitmap.data[8], 0);
    }

    #[test]
    fn mirrors_in_place_when_dest_and_source_are_the_same_region() {
        let bmp = ramp(4, 1);
        let sr = region(bmp.clone());
        let mut dr = region(bmp);
        flip_bitmap_horizontal(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 3);
        assert_eq!(dr.bitmap.data[4], 2);
        assert_eq!(dr.bitmap.data[8], 1);
        assert_eq!(dr.bitmap.data[12], 0);
    }
}

mod flip_bitmap_vertical_fn {
    use super::*;

    #[test]
    fn mirrors_rows_top_to_bottom_into_a_separate_dest() {
        let source = ramp(1, 3);
        let out = create_bitmap(1, 3, None);
        let sr = region(source);
        let mut dr = region(out);
        flip_bitmap_vertical(&mut dr, &sr);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), get_bitmap_pixel(&sr.bitmap, 0, 2));
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 2), get_bitmap_pixel(&sr.bitmap, 0, 0));
    }

    #[test]
    fn mirrors_in_place_when_dest_and_source_are_the_same_region() {
        let bmp = ramp(1, 4);
        let sr = region(bmp.clone());
        let mut dr = region(bmp);
        flip_bitmap_vertical(&mut dr, &sr);
        assert_eq!(dr.bitmap.data[0], 3);
        assert_eq!(dr.bitmap.data[12], 0);
    }
}
