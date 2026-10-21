use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod median_bitmap_fn {
    use super::*;

    #[test]
    fn removes_an_isolated_salt_pixel_without_blurring() {
        let mut src = create_bitmap(3, 3, None);
        for i in 0..9 {
            src.data[i * 4 + 3] = 255;
        }
        src.data[4 * 4] = 255;
        let mut out = vec![0u8; 3 * 3 * 4];
        median_bitmap(&mut out, &region(src), 1);
        assert_eq!(out[4 * 4], 0);
    }

    #[test]
    fn preserves_a_hard_edge() {
        let mut src = create_bitmap(4, 1, None);
        src.data[0] = 0;
        src.data[4] = 0;
        src.data[8] = 255;
        src.data[12] = 255;
        let mut out = vec![0u8; 4 * 4];
        median_bitmap(&mut out, &region(src), 1);
        assert_eq!(out[4], 0);
        assert_eq!(out[8], 255);
    }

    #[test]
    fn radius_0_copies_the_source() {
        let src = create_bitmap(1, 1, Some(0x123456ff));
        let mut out = vec![0u8; 4];
        median_bitmap(&mut out, &region(src), 0);
        assert_eq!(out[0], 0x12);
        assert_eq!(out[3], 0xff);
    }
}
