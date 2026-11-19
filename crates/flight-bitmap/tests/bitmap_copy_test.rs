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

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion {
        bitmap: std::sync::Arc::new(std::sync::RwLock::new(bmp)),
        x,
        y,
        width,
        height,
    };
}

mod copy_bitmap_channel {
    use super::*;

    #[test]
    fn copies_the_red_channel_to_the_blue_channel() {
        let mut src = create_bitmap(2, 2, None);
        src.data[0] = 0xab;
        let dst = create_bitmap(2, 2, None);
        let mut dr = region(dst);
        copy_bitmap_channel(&mut dr, ImageChannel::Blue, &region(src), ImageChannel::Red);
        assert_eq!(dr.bitmap.read().unwrap().data[2], 0xab);
    }

    #[test]
    fn copies_the_alpha_channel_independently() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x000000de);
        let dst = create_bitmap(1, 1, None);
        let mut dr = region(dst);
        copy_bitmap_channel(
            &mut dr,
            ImageChannel::Alpha,
            &region(src),
            ImageChannel::Alpha,
        );
        assert_eq!(dr.bitmap.read().unwrap().data[3], 0xde);
    }
}

mod copy_bitmap_pixels {
    use super::*;

    #[test]
    fn copies_between_disjoint_rectangles_of_one_shared_bitmap() {
        let mut bmp = create_bitmap(4, 1, None);
        for (i, value) in [0x10u8, 0x20, 0x30, 0x40].into_iter().enumerate() {
            bmp.data[i * 4] = value;
            bmp.data[i * 4 + 3] = 255;
        }
        let shared = share_bitmap(bmp);
        let source = create_bitmap_region(&shared, 0, 0, 2, 1);
        let mut dest = create_bitmap_region(&shared, 2, 0, 2, 1);
        copy_bitmap_pixels(&mut dest, &source, false);
        let bitmap = shared.read().unwrap();
        assert_eq!(
            [
                bitmap.data[0],
                bitmap.data[4],
                bitmap.data[8],
                bitmap.data[12]
            ],
            [0x10, 0x20, 0x10, 0x20]
        );
    }

    #[test]
    fn runs_opposite_role_copies_on_two_threads_without_deadlock() {
        let a = share_bitmap(create_bitmap(64, 64, Some(0x112233ff)));
        let b = share_bitmap(create_bitmap(64, 64, Some(0x445566ff)));
        let spawn = |from: std::sync::Arc<std::sync::RwLock<Bitmap>>,
                     to: std::sync::Arc<std::sync::RwLock<Bitmap>>| {
            std::thread::spawn(move || {
                let source = create_bitmap_region(&from, 0, 0, 64, 64);
                let mut dest = create_bitmap_region(&to, 0, 0, 64, 64);
                for _ in 0..500 {
                    copy_bitmap_pixels(&mut dest, &source, false);
                }
            })
        };
        let forward = spawn(a.clone(), b.clone());
        let backward = spawn(b.clone(), a.clone());
        forward.join().unwrap();
        backward.join().unwrap();
        assert_eq!(a.read().unwrap().data, b.read().unwrap().data);
    }

    #[test]
    fn copies_a_region_without_alpha_blend() {
        let src = create_bitmap(2, 2, Some(0xaabbccff));
        let dst = create_bitmap(4, 4, None);
        let mut dr = region_at(dst, 1, 1, 2, 2);
        let sr = region(src);
        copy_bitmap_pixels(&mut dr, &sr, false);
        assert_eq!(
            get_bitmap_pixel(&dr.bitmap.read().unwrap(), 1, 1),
            0xaabbccff
        );
        assert_eq!(
            get_bitmap_pixel(&dr.bitmap.read().unwrap(), 0, 0),
            0x00000000
        );
    }

    #[test]
    fn alpha_composites_when_composite_is_true() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff000080);
        let mut dst = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut dst, 0, 0, 0x0000ffff);
        let sr = region(src);
        let mut dr = region(dst);
        copy_bitmap_pixels(&mut dr, &sr, true);
        let result = get_bitmap_pixel(&dr.bitmap.read().unwrap(), 0, 0);
        assert_eq!(result & 0xff, 0xff);
        assert!((result >> 24) & 0xff > 0);
        assert!((result >> 8) & 0xff > 0);
    }
}
