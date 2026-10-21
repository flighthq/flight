use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod merge_bitmap_channels_fn {
    use super::*;

    #[test]
    fn combines_one_channel_from_each_input_into_the_output() {
        let r_surf = create_bitmap(1, 1, Some(0xff000000));
        let g_surf = create_bitmap(1, 1, Some(0x00ff0000));
        let b_surf = create_bitmap(1, 1, Some(0x0000ff00));
        let a_surf = create_bitmap(1, 1, Some(0x000000ff));
        let out = create_bitmap(1, 1, None);
        let mut or_ = region(out);
        merge_bitmap_channels(&mut or_, &region(r_surf), &region(g_surf), &region(b_surf), &region(a_surf));
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 0, 0), 0xffffffff);
    }

    #[test]
    fn uses_the_minimum_dimension_overlap() {
        let r = create_bitmap(3, 1, Some(0xff000000));
        let g = create_bitmap(3, 1, Some(0x00ff0000));
        let b = create_bitmap(3, 1, Some(0x0000ff00));
        let a = create_bitmap(3, 1, Some(0x000000ff));
        let out = create_bitmap(3, 1, None);
        let mut or_ = region(out);
        merge_bitmap_channels(
            &mut or_,
            &region_at(r, 0, 0, 1, 1),
            &region(g),
            &region(b),
            &region(a),
        );
        assert_eq!((get_bitmap_pixel(&or_.bitmap, 0, 0) >> 24) & 0xff, 0xff);
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 1, 0), 0x00000000);
    }
}

mod split_bitmap_channels_fn {
    use super::*;

    #[test]
    fn returns_four_bitmaps_of_the_same_dimensions() {
        let src = create_bitmap(3, 2, Some(0x112233ff));
        let channels = split_bitmap_channels(&src);
        assert_eq!(channels[0].width, 3);
        assert_eq!(channels[0].height, 2);
        assert_eq!(channels[1].width, 3);
        assert_eq!(channels[2].height, 2);
        assert_eq!(channels[3].width, 3);
    }

    #[test]
    fn each_channel_bitmap_is_a_grayscale_copy_of_that_channel() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x11223344);
        let channels = split_bitmap_channels(&src);
        assert_eq!((get_bitmap_pixel(&channels[0], 0, 0) >> 24) & 0xff, 0x11);
        assert_eq!((get_bitmap_pixel(&channels[0], 0, 0) >> 16) & 0xff, 0x11);
        assert_eq!((get_bitmap_pixel(&channels[1], 0, 0) >> 24) & 0xff, 0x22);
        assert_eq!((get_bitmap_pixel(&channels[2], 0, 0) >> 24) & 0xff, 0x33);
        assert_eq!((get_bitmap_pixel(&channels[3], 0, 0) >> 24) & 0xff, 0x44);
    }

    #[test]
    fn round_trip_split_then_merge_reconstructs_the_original() {
        let mut src = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xaabbccdd);
        set_bitmap_pixel(&mut src, 1, 0, 0x11223344);
        let [r, g, b, a] = split_bitmap_channels(&src);
        let out = create_bitmap(2, 2, None);
        let mut or_ = region(out);
        merge_bitmap_channels(&mut or_, &region(r), &region(g), &region(b), &region(a));
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 0, 0), 0xaabbccdd);
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 1, 0), 0x11223344);
    }
}
