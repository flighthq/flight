use flight_bitmap::*;

mod compare_bitmap_fn {
    use super::*;

    #[test]
    #[should_panic(expected = "dimensions do not match")]
    fn panics_when_widths_differ() {
        let a = create_bitmap(4, 4, 0);
        let b = create_bitmap(8, 4, 0);
        compare_bitmap(&a, &b);
    }

    #[test]
    #[should_panic(expected = "dimensions do not match")]
    fn panics_when_heights_differ() {
        let a = create_bitmap(4, 4, 0);
        let b = create_bitmap(4, 8, 0);
        compare_bitmap(&a, &b);
    }

    #[test]
    fn returns_none_for_identical_images() {
        let a = create_bitmap(4, 4, 0x0000ffff);
        let b = clone_bitmap(&a);
        assert!(compare_bitmap(&a, &b).is_none());
    }

    #[test]
    fn returns_diff_bitmap_for_different_pixels() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = create_bitmap(2, 1, 0x000000ff);
        set_bitmap_pixel(&mut b, 0, 0, 0x102030ff);
        let result = compare_bitmap(&a, &b).unwrap();
        assert_eq!(result.width, 2);
        assert_eq!(result.height, 1);
        assert_eq!(result.data[0], 0x10);
        assert_eq!(result.data[1], 0x20);
        assert_eq!(result.data[2], 0x30);
        assert_eq!(result.data[3], 255);
        assert_eq!(result.data[4], 0);
        assert_eq!(result.data[5], 0);
        assert_eq!(result.data[6], 0);
        assert_eq!(result.data[7], 0);
    }

    #[test]
    fn diff_pixel_alpha_is_255_when_any_channel_differs() {
        let a = create_bitmap(1, 1, 0x000000ff);
        let b = create_bitmap(1, 1, 0x00000080);
        let result = compare_bitmap(&a, &b).unwrap();
        assert_eq!(result.data[3], 255);
    }

    #[test]
    fn unchanged_pixels_in_diff_have_zero_alpha() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = clone_bitmap(&a);
        set_bitmap_pixel(&mut b, 1, 0, 0xff0000ff);
        let result = compare_bitmap(&a, &b).unwrap();
        assert_eq!(result.data[3], 0);
        assert_eq!(result.data[7], 255);
    }
}

mod get_bitmap_mismatch_fn {
    use super::*;

    #[test]
    #[should_panic(expected = "dimensions do not match")]
    fn panics_when_dimensions_differ() {
        let a = create_bitmap(4, 4, 0);
        let b = create_bitmap(4, 8, 0);
        get_bitmap_mismatch(&a, &b, 0);
    }

    #[test]
    fn reports_zero_mismatch_for_identical_bitmaps() {
        let a = create_bitmap(4, 4, 0x0000ffff);
        let b = clone_bitmap(&a);
        let result = get_bitmap_mismatch(&a, &b, 0);
        assert_eq!(result.mismatched_pixels, 0);
        assert_eq!(result.total_pixels, 16);
        assert_eq!(result.fraction, 0.0);
        assert_eq!(result.max_channel_delta, 0);
    }

    #[test]
    fn counts_pixels_whose_max_channel_delta_exceeds_the_tolerance() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = create_bitmap(2, 1, 0x000000ff);
        set_bitmap_pixel(&mut b, 0, 0, 0x0a0000ff);
        assert_eq!(get_bitmap_mismatch(&a, &b, 0).mismatched_pixels, 1);
        assert_eq!(get_bitmap_mismatch(&a, &b, 9).mismatched_pixels, 1);
        assert_eq!(get_bitmap_mismatch(&a, &b, 10).mismatched_pixels, 0);
    }

    #[test]
    fn reports_the_largest_channel_delta_and_the_mismatch_fraction() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = create_bitmap(2, 1, 0x000000ff);
        set_bitmap_pixel(&mut b, 1, 0, 0x804020ff);
        let result = get_bitmap_mismatch(&a, &b, 0);
        assert_eq!(result.max_channel_delta, 128);
        assert_eq!(result.mismatched_pixels, 1);
        assert_eq!(result.fraction, 0.5);
    }
}
