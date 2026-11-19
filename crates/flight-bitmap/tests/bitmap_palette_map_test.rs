//! flight-compiler: target-native

use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion {
        bitmap: std::sync::Arc::new(std::sync::RwLock::new(bmp)),
        x: 0,
        y: 0,
        width: w,
        height: h,
    };
}

fn shared_region(bitmap: &std::sync::Arc<std::sync::RwLock<Bitmap>>) -> BitmapRegion {
    let (width, height) = {
        let bitmap = bitmap.read().unwrap();
        (bitmap.width as i32, bitmap.height as i32)
    };
    return create_bitmap_region(bitmap, 0, 0, width, height);
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion {
        bitmap: std::sync::Arc::new(std::sync::RwLock::new(bmp)),
        x,
        y,
        width,
        height,
    };
}

fn invert_table() -> Vec<u8> {
    return (0..256).map(|i| (255 - i) as u8).collect();
}

mod apply_bitmap_palette_map {
    use super::*;

    #[test]
    fn maps_between_disjoint_rectangles_of_one_shared_bitmap() {
        let shared = share_bitmap(create_bitmap(2, 1, Some(0x00ff00ff)));
        let inv = invert_table();
        let source = create_bitmap_region(&shared, 0, 0, 1, 1);
        let mut dest = create_bitmap_region(&shared, 1, 0, 1, 1);
        apply_bitmap_palette_map(&mut dest, &source, Some(&inv), Some(&inv), Some(&inv), None);
        let bitmap = shared.read().unwrap();
        assert_eq!(&bitmap.data[4..8], &[255, 0, 255, 255]);
        assert_eq!(&bitmap.data[0..4], &[0, 255, 0, 255]);
    }

    #[test]
    fn remaps_a_channel_through_its_lookup_table() {
        let src = create_bitmap(1, 1, Some(0x10203040));
        let out = create_bitmap(1, 1, None);
        let mut dr = region(out);
        apply_bitmap_palette_map(
            &mut dr,
            &region(src),
            Some(&invert_table()),
            None,
            None,
            None,
        );
        assert_eq!(dr.bitmap.read().unwrap().data[0], 255 - 0x10);
        assert_eq!(dr.bitmap.read().unwrap().data[1], 0x20);
        assert_eq!(dr.bitmap.read().unwrap().data[2], 0x30);
        assert_eq!(dr.bitmap.read().unwrap().data[3], 0x40);
    }

    #[test]
    fn none_maps_leave_every_channel_unchanged() {
        let src = create_bitmap(1, 1, Some(0x11223344));
        let out = create_bitmap(1, 1, None);
        let mut dr = region(out);
        apply_bitmap_palette_map(&mut dr, &region(src), None, None, None, None);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 0x11);
        assert_eq!(dr.bitmap.read().unwrap().data[3], 0x44);
    }

    #[test]
    fn is_safe_in_place() {
        let img = create_bitmap(1, 1, Some(0x00ff00ff));
        let inv = invert_table();
        let shared = share_bitmap(img);
        let sr = shared_region(&shared);
        let mut dr = shared_region(&shared);
        apply_bitmap_palette_map(&mut dr, &sr, Some(&inv), Some(&inv), Some(&inv), None);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 255);
        assert_eq!(dr.bitmap.read().unwrap().data[1], 0);
        assert_eq!(dr.bitmap.read().unwrap().data[2], 255);
        assert_eq!(dr.bitmap.read().unwrap().data[3], 0xff);
    }

    #[test]
    fn maps_only_the_given_sub_region() {
        let src = create_bitmap(2, 1, Some(0x80808080));
        let out = create_bitmap(2, 1, None);
        let mut dr = region_at(out, 1, 0, 1, 1);
        apply_bitmap_palette_map(
            &mut dr,
            &region_at(src, 1, 0, 1, 1),
            Some(&invert_table()),
            None,
            None,
            None,
        );
        assert_eq!(dr.bitmap.read().unwrap().data[4], 255 - 0x80);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 0);
    }
}
