use flight_bitmap::contract::*;
use flight_entity::{allocate_entity, get_entity_uid, set_entity_uid};

mod bitmap_fingerprint_computation_id {
    use super::*;

    #[test]
    fn is_a_non_empty_string_identifying_the_current_computation() {
        assert!(!BITMAP_FINGERPRINT_COMPUTATION_ID.is_empty());
    }
}

mod compare_bitmap_fingerprints {
    use super::*;

    #[test]
    #[should_panic(expected = "gridSize mismatch")]
    fn panics_when_grid_sizes_differ() {
        let a = create_bitmap_fingerprint(&create_bitmap(4, 4, None), 2);
        let b = create_bitmap_fingerprint(&create_bitmap(4, 4, None), 4);
        compare_bitmap_fingerprints(&a, &b);
    }

    #[test]
    fn reports_0_for_identical_fingerprints() {
        let fp = create_bitmap_fingerprint(&create_bitmap(8, 8, Some(0x336699ff)), 4);
        assert_eq!(compare_bitmap_fingerprints(&fp, &fp), 0.0);
    }

    #[test]
    fn reports_the_mean_absolute_per_channel_difference() {
        let a = create_bitmap_fingerprint(&create_bitmap(4, 4, Some(0x000000ff)), 1);
        let b = create_bitmap_fingerprint(&create_bitmap(4, 4, Some(0x0c0c0cff)), 1);
        assert_eq!(compare_bitmap_fingerprints(&a, &b), 12.0);
    }

    #[test]
    fn stays_small_for_noise_but_large_for_colour_swap() {
        let base = create_bitmap(16, 16, Some(0x2040a0ff));
        let mut noisy = create_bitmap(16, 16, Some(0x2040a0ff));
        set_bitmap_pixel(&mut noisy, 0, 0, 0x2442a2ff);
        set_bitmap_pixel(&mut noisy, 5, 5, 0x1e3e9eff);
        let swapped = create_bitmap(16, 16, Some(0xa04020ff));
        let fp = create_bitmap_fingerprint(&base, 16);
        assert!(compare_bitmap_fingerprints(&fp, &create_bitmap_fingerprint(&noisy, 16)) < 2.0);
        assert!(compare_bitmap_fingerprints(&fp, &create_bitmap_fingerprint(&swapped, 16)) > 50.0);
    }
}

mod create_bitmap_fingerprint {
    use super::*;

    #[test]
    fn averages_a_solid_bitmap_to_that_colour_in_every_cell() {
        let fp = create_bitmap_fingerprint(&create_bitmap(8, 8, Some(0x336699ff)), 4);
        assert_eq!(fp.grid_size, 4);
        assert_eq!(fp.cells.len(), 4 * 4 * 3);
        assert_eq!(&fp.cells[0..3], &[0x33, 0x66, 0x99]);
        let n = fp.cells.len();
        assert_eq!(&fp.cells[n - 3..], &[0x33, 0x66, 0x99]);
    }

    #[test]
    fn places_a_coloured_quadrant_in_the_matching_grid_cell() {
        let mut bmp = create_bitmap(2, 2, Some(0x000000ff));
        set_bitmap_pixel(&mut bmp, 0, 0, 0xff0000ff);
        let fp = create_bitmap_fingerprint(&bmp, 2);
        assert_eq!(&fp.cells[0..3], &[255, 0, 0]);
        assert_eq!(&fp.cells[3..6], &[0, 0, 0]);
    }

    #[test]
    #[should_panic(expected = "gridSize must be >= 1")]
    fn panics_on_a_non_positive_grid_size() {
        create_bitmap_fingerprint(&create_bitmap(4, 4, None), 0);
    }

    #[test]
    fn returns_an_all_zero_grid_for_an_empty_bitmap() {
        let fp = create_bitmap_fingerprint(&create_bitmap(0, 0, None), 2);
        assert!(fp.cells.iter().all(|&v| v == 0));
    }

    #[test]
    fn derives_owned_cells_from_source_pixels_and_grid_size() {
        let mut bitmap = create_bitmap(2, 1, None);
        set_bitmap_pixel(&mut bitmap, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut bitmap, 1, 0, 0x0000ffff);
        let fingerprint = create_bitmap_fingerprint(&bitmap, 1);
        assert_eq!(fingerprint.grid_size, 1);
        assert_eq!(fingerprint.cells, vec![128, 0, 128]);
    }
}

mod format_bitmap_fingerprint {
    use super::*;

    #[test]
    fn round_trips_through_parse_bitmap_fingerprint() {
        let mut bmp = create_bitmap(8, 8, Some(0x000000ff));
        set_bitmap_pixel(&mut bmp, 1, 1, 0x12ab34ff);
        set_bitmap_pixel(&mut bmp, 6, 6, 0xfe01dcff);
        let fp = create_bitmap_fingerprint(&bmp, 4);
        let parsed = parse_bitmap_fingerprint(&format_bitmap_fingerprint(&fp)).unwrap();
        assert_eq!(parsed.grid_size, 4);
        assert_eq!(parsed.cells, fp.cells);
        assert_eq!(compare_bitmap_fingerprints(&fp, &parsed), 0.0);
    }

    #[test]
    fn encodes_grid_size_and_lowercase_hex_cells() {
        let fp = create_bitmap_fingerprint(&create_bitmap(4, 4, Some(0x0a0b0cff)), 1);
        assert_eq!(format_bitmap_fingerprint(&fp), "1:0a0b0c");
    }
}

mod initialize_bitmap_fingerprint {
    use super::*;

    #[test]
    fn sets_grid_size_and_cells() {
        let mut fp: BitmapFingerprint = allocate_entity();
        set_entity_uid(&mut fp, "fingerprint".to_string());
        let cells = vec![1, 2, 3];
        let cells_pointer = cells.as_ptr();
        initialize_bitmap_fingerprint(&mut fp, 3, cells);
        assert_eq!(fp.grid_size, 3);
        assert_eq!(fp.cells, vec![1, 2, 3]);
        assert_eq!(get_entity_uid(&mut fp), "fingerprint");
        assert_eq!(fp.cells.as_ptr(), cells_pointer);
    }
}

mod parse_bitmap_fingerprint {
    use super::*;

    #[test]
    fn returns_none_for_malformed_text() {
        assert!(parse_bitmap_fingerprint("garbage").is_none());
        assert!(parse_bitmap_fingerprint("").is_none());
        assert!(parse_bitmap_fingerprint("2:abcd").is_none());
        assert!(parse_bitmap_fingerprint("1:0a0b0").is_none());
        assert!(parse_bitmap_fingerprint("1:0a0b0z").is_none());
    }

    #[test]
    fn parses_a_valid_single_cell_fingerprint() {
        let parsed = parse_bitmap_fingerprint("1:0a0b0c").unwrap();
        assert_eq!(parsed.cells, vec![0x0a, 0x0b, 0x0c]);
    }
}
