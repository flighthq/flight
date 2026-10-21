use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod dilate_bitmap_fn {
    use super::*;

    #[test]
    fn expands_a_single_bright_pixel_into_its_neighborhood() {
        let mut src = create_bitmap(3, 1, None);
        src.data[1 * 4 + 3] = 255;
        let mut out = vec![0u8; 3 * 4];
        dilate_bitmap(&mut out, &region(src), 1);
        assert_eq!(out[0 * 4 + 3], 255);
        assert_eq!(out[1 * 4 + 3], 255);
        assert_eq!(out[2 * 4 + 3], 255);
    }

    #[test]
    fn with_radius_0_is_an_identity_copy() {
        let mut src = create_bitmap(3, 1, None);
        src.data[0] = 10; src.data[1] = 20; src.data[2] = 30; src.data[3] = 100;
        src.data[4] = 50; src.data[5] = 60; src.data[6] = 70; src.data[7] = 200;
        let mut out = vec![0u8; 3 * 4];
        dilate_bitmap(&mut out, &region(src), 0);
        assert_eq!(out[0], 10);
        assert_eq!(out[4], 50);
    }

    #[test]
    fn is_dual_to_erode_bitmap() {
        let mut src = create_bitmap(5, 1, None);
        for i in 1..4 {
            src.data[i * 4 + 3] = 255;
        }
        let mut eroded = vec![0u8; 5 * 4];
        let mut dilated = vec![0u8; 5 * 4];
        erode_bitmap(&mut eroded, &region(src.clone()), 1);
        dilate_bitmap(&mut dilated, &region(src.clone()), 1);
        assert!(dilated[1 * 4 + 3] >= src.data[1 * 4 + 3]);
        assert!(eroded[1 * 4 + 3] <= src.data[1 * 4 + 3]);
    }
}

mod erode_bitmap_fn {
    use super::*;

    #[test]
    fn shrinks_an_isolated_bright_pixel_to_dark() {
        let mut src = create_bitmap(3, 1, None);
        src.data[1 * 4 + 3] = 255;
        let mut out = vec![0u8; 3 * 4];
        erode_bitmap(&mut out, &region(src), 1);
        assert_eq!(out[1 * 4 + 3], 0);
    }

    #[test]
    fn with_radius_0_is_an_identity_copy() {
        let mut src = create_bitmap(3, 1, None);
        src.data[4] = 10; src.data[7] = 100;
        let mut out = vec![0u8; 3 * 4];
        erode_bitmap(&mut out, &region(src), 0);
        assert_eq!(out[4], 10);
        assert_eq!(out[7], 100);
    }

    #[test]
    fn preserves_a_fully_opaque_field() {
        let src = create_bitmap(5, 1, Some(0xffffffff));
        let mut out = vec![0u8; 5 * 4];
        erode_bitmap(&mut out, &region(src), 2);
        for i in 0..5 {
            assert_eq!(out[i * 4 + 3], 255);
        }
    }
}
