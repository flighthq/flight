use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod dissolve_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn dissolves_at_most_pixel_count_pixels_per_call() {
        let source = create_bitmap(4, 4, Some(0x112233ff));
        let dest = create_bitmap(4, 4, None);
        let original = dest.data.clone();
        let mut dr = region(dest);
        dissolve_bitmap_pixels(&mut dr, &region(source), 0, 5, 0);
        let changed = dr.bitmap.data.chunks(4).zip(original.chunks(4))
            .filter(|(a, b)| a != b).count();
        assert_eq!(changed, 5);
    }

    #[test]
    fn eventually_covers_every_pixel_exactly_once() {
        let mut source = create_bitmap(5, 3, None);
        for i in 0..(5 * 3) {
            set_bitmap_pixel(&mut source, i % 5, i / 5, ((0x01010100u32).wrapping_mul((i + 1) as u32)));
        }
        let dest = create_bitmap(5, 3, None);
        let mut dr = region(dest);
        let sr = region(source.clone());
        let mut seed = 0u32;
        for _ in 0..8 {
            seed = dissolve_bitmap_pixels(&mut dr, &sr, seed, 2, 0);
        }
        assert_eq!(dr.bitmap.data, sr.bitmap.data);
    }

    #[test]
    fn is_deterministic_for_the_same_seed_sequence() {
        let source = create_bitmap(6, 6, Some(0xaabbccff));
        let a_dest = create_bitmap(6, 6, None);
        let b_dest = create_bitmap(6, 6, None);
        let sr = region(source.clone());
        let mut ar = region(a_dest);
        let mut br = region(b_dest);
        dissolve_bitmap_pixels(&mut ar, &sr, 3, 7, 0);
        let sr2 = region(source);
        dissolve_bitmap_pixels(&mut br, &sr2, 3, 7, 0);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }

    #[test]
    fn returns_a_terminal_seed_once_fully_dissolved() {
        let source = create_bitmap(4, 4, Some(0x445566ff));
        let dest = create_bitmap(4, 4, None);
        let sr = region(source.clone());
        let mut dr = region(dest);
        let mut seed = 0u32;
        for _ in 0..16 {
            seed = dissolve_bitmap_pixels(&mut dr, &sr, seed, 1, 0);
        }
        assert_eq!(dr.bitmap.data, sr.bitmap.data);
        let after = dissolve_bitmap_pixels(&mut dr, &sr, seed, 4, 0);
        assert_eq!(after, seed);
    }

    #[test]
    fn ignores_fill_color_and_copies_from_source_when_regions_differ() {
        let source = create_bitmap(2, 2, Some(0x0a0b0c0d));
        let dest = create_bitmap(2, 2, None);
        let mut dr = region(dest);
        let mut seed = 0u32;
        for _ in 0..4 {
            seed = dissolve_bitmap_pixels(&mut dr, &region(source.clone()), seed, 1, 0xffffffff);
        }
        assert_eq!(dr.bitmap.data, source.data);
    }

    #[test]
    fn returns_seed_unchanged_for_non_positive_pixel_count() {
        let source = create_bitmap(4, 4, Some(0x112233ff));
        let dest = create_bitmap(4, 4, None);
        let original = dest.data.clone();
        let mut dr = region(dest);
        let result = dissolve_bitmap_pixels(&mut dr, &region(source), 2, 0, 0);
        assert_eq!(result, 2);
        assert_eq!(dr.bitmap.data, original);
    }

    #[test]
    fn returns_the_seed_for_a_zero_area_region() {
        let source = create_bitmap(4, 4, Some(0x112233ff));
        let dest = create_bitmap(4, 4, None);
        let mut dr = BitmapRegion { bitmap: dest, x: 0, y: 0, width: 0, height: 0 };
        let result = dissolve_bitmap_pixels(&mut dr, &region(source), 5, 10, 0);
        assert_eq!(result, 5);
    }
}
