use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod merge_bitmap_channels_fn {
    use super::*;

    #[test]
    fn combines_channels_into_output() {
        let r_surf = create_bitmap(1, 1, 0xff000000);
        let g_surf = create_bitmap(1, 1, 0x00ff0000);
        let b_surf = create_bitmap(1, 1, 0x0000ff00);
        let a_surf = create_bitmap(1, 1, 0x000000ff);
        let out = create_bitmap(1, 1, 0);
        let mut or = region(out);
        merge_bitmap_channels(&mut or, &region(r_surf), &region(g_surf), &region(b_surf), &region(a_surf));
        assert_eq!(get_bitmap_pixel(&or.bitmap, 0, 0), 0xffffffff);
    }
}

mod split_bitmap_channels_fn {
    use super::*;

    #[test]
    fn returns_four_bitmaps_of_same_dimensions() {
        let src = create_bitmap(3, 2, 0x112233ff);
        let channels = split_bitmap_channels(&src);
        assert_eq!(channels[0].width, 3);
        assert_eq!(channels[0].height, 2);
        assert_eq!(channels[1].width, 3);
        assert_eq!(channels[2].height, 2);
        assert_eq!(channels[3].width, 3);
    }

    #[test]
    fn round_trip_split_merge_reconstructs() {
        let mut src = create_bitmap(2, 2, 0);
        set_bitmap_pixel(&mut src, 0, 0, 0xaabbccdd);
        set_bitmap_pixel(&mut src, 1, 0, 0x11223344);
        let [r, g, b, a] = split_bitmap_channels(&src);
        let out = create_bitmap(2, 2, 0);
        let mut or = region(out);
        merge_bitmap_channels(&mut or, &region(r), &region(g), &region(b), &region(a));
        assert_eq!(get_bitmap_pixel(&or.bitmap, 0, 0), 0xaabbccdd);
        assert_eq!(get_bitmap_pixel(&or.bitmap, 1, 0), 0x11223344);
    }
}
