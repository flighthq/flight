use flight_bitmap::*;

mod get_bitmap_coverage_fn {
    use super::*;

    #[test]
    fn returns_zero_for_background_only() {
        assert_eq!(get_bitmap_coverage(&create_bitmap(4, 4, 0x123456ff), 0x123456ff, 0), 0.0);
    }

    #[test]
    fn counts_differing_pixels() {
        let mut bmp = create_bitmap(2, 2, 0x000000ff);
        set_bitmap_pixel(&mut bmp, 0, 0, 0xff0000ff);
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 0), 0.25);
    }

    #[test]
    fn full_coverage() {
        let mut bmp = create_bitmap(2, 2, 0x000000ff);
        for y in 0..2 {
            for x in 0..2 {
                set_bitmap_pixel(&mut bmp, x, y, 0xffffffff);
            }
        }
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 0), 1.0);
    }
}
