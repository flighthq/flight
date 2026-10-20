use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod get_bitmap_histogram_fn {
    use super::*;

    #[test]
    fn counts_uniform_image() {
        let bmp = create_bitmap(4, 4, 0xaabbccdd);
        let hist = get_bitmap_histogram(&region(bmp));
        assert_eq!(hist.red[0xaa], 16);
        assert_eq!(hist.green[0xbb], 16);
        assert_eq!(hist.blue[0xcc], 16);
        assert_eq!(hist.alpha[0xdd], 16);
    }

    #[test]
    fn sums_to_pixel_count() {
        let bmp = create_bitmap(3, 3, 0x112233ff);
        let hist = get_bitmap_histogram(&region(bmp));
        let total: u32 = hist.red.iter().sum();
        assert_eq!(total, 9);
    }
}

mod equalize_bitmap_histogram_fn {
    use super::*;

    #[test]
    fn does_not_crash_on_uniform_image() {
        let src = create_bitmap(4, 4, 0x808080ff);
        let dest = create_bitmap(4, 4, 0);
        let sr = region(src);
        let mut dr = region(dest);
        equalize_bitmap_histogram(&mut dr, &sr);
        // After equalization, all pixels are the same value (mapped from uniform distribution)
        let first_r = dr.bitmap.data[0];
        for y in 0..4 {
            for x in 0..4 {
                let i = (y * 4 + x) * 4;
                assert_eq!(dr.bitmap.data[i], first_r);
            }
        }
    }
}
