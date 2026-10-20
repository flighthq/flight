use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

fn invert_table() -> Vec<u8> {
    return (0..256).map(|i| (255 - i) as u8).collect();
}

mod apply_bitmap_palette_map_fn {
    use super::*;

    #[test]
    fn remaps_a_channel_through_its_lookup_table() {
        let src = create_bitmap(1, 1, 0x10203040);
        let out = create_bitmap(1, 1, 0);
        let mut dr = region(out);
        apply_bitmap_palette_map(&mut dr, &region(src), Some(&invert_table()), None, None, None);
        assert_eq!(dr.bitmap.data[0], 255 - 0x10);
        assert_eq!(dr.bitmap.data[1], 0x20);
        assert_eq!(dr.bitmap.data[2], 0x30);
        assert_eq!(dr.bitmap.data[3], 0x40);
    }

    #[test]
    fn none_maps_leave_every_channel_unchanged() {
        let src = create_bitmap(1, 1, 0x11223344);
        let out = create_bitmap(1, 1, 0);
        let mut dr = region(out);
        apply_bitmap_palette_map(&mut dr, &region(src), None, None, None, None);
        assert_eq!(dr.bitmap.data[0], 0x11);
        assert_eq!(dr.bitmap.data[3], 0x44);
    }

    #[test]
    fn is_safe_in_place() {
        let img = create_bitmap(1, 1, 0x00ff00ff);
        let inv = invert_table();
        let sr = region(img.clone());
        let mut dr = region(img);
        apply_bitmap_palette_map(&mut dr, &sr, Some(&inv), Some(&inv), Some(&inv), None);
        assert_eq!(dr.bitmap.data[0], 255);
        assert_eq!(dr.bitmap.data[1], 0);
        assert_eq!(dr.bitmap.data[2], 255);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn maps_only_the_given_sub_region() {
        let src = create_bitmap(2, 1, 0x80808080);
        let out = create_bitmap(2, 1, 0);
        let mut dr = region_at(out, 1, 0, 1, 1);
        apply_bitmap_palette_map(&mut dr, &region_at(src, 1, 0, 1, 1), Some(&invert_table()), None, None, None);
        assert_eq!(dr.bitmap.data[4], 255 - 0x80);
        assert_eq!(dr.bitmap.data[0], 0);
    }
}
