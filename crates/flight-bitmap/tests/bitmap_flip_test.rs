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

fn ramp(width: u32, height: u32) -> Bitmap {
    let mut bmp = create_bitmap(width, height, None);
    for i in 0..(width * height) as usize {
        bmp.data[i * 4] = i as u8;
        bmp.data[i * 4 + 3] = 255;
    }
    return bmp;
}

// Flips alternating solid sources into one shared destination on a writer thread while a reader
// samples (version, pixel) pairs under read locks. Flip N publishes version N + 1 with source N's
// color, so a sample pairing a new color with an old version means a reader saw the copy before
// its invalidation: the two were not published under one write lock.
fn count_unpublished_flip_samples(flip: fn(&mut BitmapRegion, &BitmapRegion)) -> usize {
    let dest = share_bitmap(create_bitmap(8, 8, None));
    let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let writer = {
        let dest = dest.clone();
        let done = done.clone();
        std::thread::spawn(move || {
            let sources = [
                region(create_bitmap(8, 8, Some(0x111111ff))),
                region(create_bitmap(8, 8, Some(0x222222ff))),
            ];
            let mut dr = shared_region(&dest);
            for i in 0..20_000 {
                flip(&mut dr, &sources[i % 2]);
            }
            done.store(true, std::sync::atomic::Ordering::Release);
        })
    };
    let mut violations = 0;
    while !done.load(std::sync::atomic::Ordering::Acquire) {
        let bitmap = dest.read().unwrap();
        let expected = match bitmap.version {
            0 => 0x00,
            version if version % 2 == 1 => 0x11,
            _ => 0x22,
        };
        if bitmap.data[0] != expected {
            violations += 1;
        }
    }
    writer.join().unwrap();
    return violations;
}

mod flip_bitmap_horizontal {
    use super::*;

    #[test]
    fn publishes_the_copied_pixels_and_the_new_version_under_one_write_lock() {
        assert_eq!(count_unpublished_flip_samples(flip_bitmap_horizontal), 0);
    }

    #[test]
    fn mirrors_columns_left_to_right_into_a_separate_dest() {
        let source = ramp(3, 1);
        let out = create_bitmap(3, 1, None);
        let sr = region(source);
        let mut dr = region(out);
        flip_bitmap_horizontal(&mut dr, &sr);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 2);
        assert_eq!(dr.bitmap.read().unwrap().data[4], 1);
        assert_eq!(dr.bitmap.read().unwrap().data[8], 0);
    }

    #[test]
    fn mirrors_in_place_when_dest_and_source_are_the_same_region() {
        let bmp = ramp(4, 1);
        let shared = share_bitmap(bmp);
        let sr = shared_region(&shared);
        let mut dr = shared_region(&shared);
        flip_bitmap_horizontal(&mut dr, &sr);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 3);
        assert_eq!(dr.bitmap.read().unwrap().data[4], 2);
        assert_eq!(dr.bitmap.read().unwrap().data[8], 1);
        assert_eq!(dr.bitmap.read().unwrap().data[12], 0);
    }
}

mod flip_bitmap_vertical {
    use super::*;

    #[test]
    fn publishes_the_copied_pixels_and_the_new_version_under_one_write_lock() {
        assert_eq!(count_unpublished_flip_samples(flip_bitmap_vertical), 0);
    }

    #[test]
    fn mirrors_rows_top_to_bottom_into_a_separate_dest() {
        let source = ramp(1, 3);
        let out = create_bitmap(1, 3, None);
        let sr = region(source);
        let mut dr = region(out);
        flip_bitmap_vertical(&mut dr, &sr);
        assert_eq!(
            get_bitmap_pixel(&dr.bitmap.read().unwrap(), 0, 0),
            get_bitmap_pixel(&sr.bitmap.read().unwrap(), 0, 2)
        );
        assert_eq!(
            get_bitmap_pixel(&dr.bitmap.read().unwrap(), 0, 2),
            get_bitmap_pixel(&sr.bitmap.read().unwrap(), 0, 0)
        );
    }

    #[test]
    fn mirrors_in_place_when_dest_and_source_are_the_same_region() {
        let bmp = ramp(1, 4);
        let shared = share_bitmap(bmp);
        let sr = shared_region(&shared);
        let mut dr = shared_region(&shared);
        flip_bitmap_vertical(&mut dr, &sr);
        assert_eq!(dr.bitmap.read().unwrap().data[0], 3);
        assert_eq!(dr.bitmap.read().unwrap().data[12], 0);
    }
}
