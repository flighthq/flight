use flight_bitmap::*;

mod compare_bitmap_fn {
    use super::*;

    #[test]
    fn returns_none_for_identical_images() {
        let a = create_bitmap(4, 4, 0x0000ffff);
        let b = clone_bitmap(&a);
        assert!(compare_bitmap(&a, &b).is_none());
    }

    #[test]
    fn returns_diff_for_different_pixels() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = create_bitmap(2, 1, 0x000000ff);
        set_bitmap_pixel(&mut b, 0, 0, 0x102030ff);
        let result = compare_bitmap(&a, &b).unwrap();
        assert_eq!(result.width, 2);
        assert_eq!(result.data[0], 0x10);
        assert_eq!(result.data[1], 0x20);
        assert_eq!(result.data[2], 0x30);
        assert_eq!(result.data[3], 255);
    }
}

mod get_bitmap_mismatch_fn {
    use super::*;

    #[test]
    fn zero_mismatch_for_identical() {
        let a = create_bitmap(4, 4, 0x0000ffff);
        let b = clone_bitmap(&a);
        let result = get_bitmap_mismatch(&a, &b, 0);
        assert_eq!(result.mismatched_pixels, 0);
        assert_eq!(result.total_pixels, 16);
    }

    #[test]
    fn counts_pixels_exceeding_tolerance() {
        let a = create_bitmap(2, 1, 0x000000ff);
        let mut b = create_bitmap(2, 1, 0x000000ff);
        set_bitmap_pixel(&mut b, 0, 0, 0x0a0000ff);
        assert_eq!(get_bitmap_mismatch(&a, &b, 0).mismatched_pixels, 1);
        assert_eq!(get_bitmap_mismatch(&a, &b, 9).mismatched_pixels, 1);
        assert_eq!(get_bitmap_mismatch(&a, &b, 10).mismatched_pixels, 0);
    }
}
