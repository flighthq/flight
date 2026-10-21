use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod pixelate_bitmap_fn {
    use super::*;

    #[test]
    fn averages_a_block_to_a_single_uniform_color() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 0;
        src.data[4] = 100;
        src.data[3] = 255;
        src.data[7] = 255;
        let mut out = vec![0u8; 2 * 4];
        pixelate_bitmap(&mut out, &region(src), 2);
        assert_eq!(out[0], 50);
        assert_eq!(out[4], 50);
    }

    #[test]
    fn keeps_each_block_independent_at_block_size_1() {
        let mut src = create_bitmap(2, 1, None);
        src.data[0] = 10;
        src.data[4] = 200;
        let mut out = vec![0u8; 2 * 4];
        pixelate_bitmap(&mut out, &region(src), 1);
        assert_eq!(out[0], 10);
        assert_eq!(out[4], 200);
    }

    #[test]
    fn can_use_source_bitmap_data_as_out_for_a_full_bitmap_region() {
        let mut bmp = create_bitmap(2, 1, None);
        bmp.data[0] = 0;
        bmp.data[4] = 80;
        let r = region(bmp);
        let mut data = r.bitmap.data.clone();
        pixelate_bitmap(&mut data, &r, 2);
        assert_eq!(data[0], 40);
        assert_eq!(data[4], 40);
    }
}
