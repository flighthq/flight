use flight_bitmap::*;

mod create_bitmap_fingerprint_fn {
    use super::*;

    #[test]
    fn creates_correct_grid_size() {
        let bmp = create_bitmap(8, 8, 0xff0000ff);
        let fp = create_bitmap_fingerprint(&bmp, 2);
        assert_eq!(fp.grid_size, 2);
        assert_eq!(fp.cells.len(), 2 * 2 * 3);
    }

    #[test]
    fn averages_colors_in_cells() {
        let bmp = create_bitmap(2, 2, 0x804020ff);
        let fp = create_bitmap_fingerprint(&bmp, 1);
        assert_eq!(fp.cells[0], 0x80);
        assert_eq!(fp.cells[1], 0x40);
        assert_eq!(fp.cells[2], 0x20);
    }
}

mod compare_bitmap_fingerprints_fn {
    use super::*;

    #[test]
    fn identical_fingerprints_return_zero() {
        let bmp = create_bitmap(4, 4, 0xaabbccff);
        let a = create_bitmap_fingerprint(&bmp, 2);
        let b = create_bitmap_fingerprint(&bmp, 2);
        assert_eq!(compare_bitmap_fingerprints(&a, &b), 0.0);
    }

    #[test]
    fn different_fingerprints_return_nonzero() {
        let a_bmp = create_bitmap(4, 4, 0xff0000ff);
        let b_bmp = create_bitmap(4, 4, 0x00ff00ff);
        let a = create_bitmap_fingerprint(&a_bmp, 2);
        let b = create_bitmap_fingerprint(&b_bmp, 2);
        assert!(compare_bitmap_fingerprints(&a, &b) > 0.0);
    }
}

mod format_and_parse_bitmap_fingerprint {
    use super::*;

    #[test]
    fn round_trips() {
        let bmp = create_bitmap(4, 4, 0xaabbccff);
        let fp = create_bitmap_fingerprint(&bmp, 2);
        let text = format_bitmap_fingerprint(&fp);
        let parsed = parse_bitmap_fingerprint(&text).unwrap();
        assert_eq!(parsed.grid_size, fp.grid_size);
        assert_eq!(parsed.cells, fp.cells);
    }

    #[test]
    fn parse_returns_none_for_bad_input() {
        assert!(parse_bitmap_fingerprint("").is_none());
        assert!(parse_bitmap_fingerprint("no_colon").is_none());
        assert!(parse_bitmap_fingerprint(":abc").is_none());
    }
}

mod initialize_bitmap_fingerprint_fn {
    use super::*;

    #[test]
    fn sets_fields() {
        let mut fp = BitmapFingerprint::default();
        initialize_bitmap_fingerprint(&mut fp, 3, vec![1, 2, 3]);
        assert_eq!(fp.grid_size, 3);
        assert_eq!(fp.cells, vec![1, 2, 3]);
    }
}
