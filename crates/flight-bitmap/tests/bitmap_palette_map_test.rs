use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod apply_bitmap_palette_map_fn {
    use super::*;

    #[test]
    fn maps_red_channel() {
        let src = create_bitmap(2, 2, 0x804020ff);
        let dest = create_bitmap(2, 2, 0);
        let mut dr = region(dest);
        // Invert red: map[i] = 255 - i
        let mut red_map = vec![0u8; 256];
        for i in 0..256 { red_map[i] = (255 - i) as u8; }
        apply_bitmap_palette_map(&mut dr, &region(src), Some(&red_map), None, None, None);
        assert_eq!(dr.bitmap.data[0], 255 - 0x80);
        // Green unchanged
        assert_eq!(dr.bitmap.data[1], 0x40);
    }

    #[test]
    fn none_maps_pass_through() {
        let src = create_bitmap(1, 1, 0xaabbccdd);
        let dest = create_bitmap(1, 1, 0);
        let mut dr = region(dest);
        apply_bitmap_palette_map(&mut dr, &region(src), None, None, None, None);
        assert_eq!(dr.bitmap.data[0], 0xaa);
        assert_eq!(dr.bitmap.data[1], 0xbb);
        assert_eq!(dr.bitmap.data[2], 0xcc);
        assert_eq!(dr.bitmap.data[3], 0xdd);
    }
}
