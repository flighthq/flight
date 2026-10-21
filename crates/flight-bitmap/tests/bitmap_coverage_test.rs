use flight_bitmap::*;

mod get_bitmap_coverage_fn {
    use super::*;

    #[test]
    fn returns_0_for_a_bitmap_entirely_the_background_color() {
        assert_eq!(get_bitmap_coverage(&create_bitmap(4, 4, Some(0x123456ff)), 0x123456ff, 0), 0.0);
    }

    #[test]
    fn returns_0_for_a_fully_transparent_bitmap_against_transparent_background() {
        assert_eq!(get_bitmap_coverage(&create_bitmap(4, 4, None), 0x00000000, 0), 0.0);
    }

    #[test]
    fn counts_pixels_that_differ_from_the_background_on_any_channel() {
        let mut bmp = create_bitmap(2, 2, Some(0x000000ff));
        set_bitmap_pixel(&mut bmp, 0, 0, 0xff0000ff);
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 0), 0.25);
    }

    #[test]
    fn measures_a_fully_painted_bitmap_as_full_coverage() {
        let mut bmp = create_bitmap(2, 2, Some(0x000000ff));
        for y in 0..2 {
            for x in 0..2 {
                set_bitmap_pixel(&mut bmp, x, y, 0xffffffff);
            }
        }
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 0), 1.0);
    }

    #[test]
    fn ignores_differences_within_the_channel_tolerance() {
        let mut bmp = create_bitmap(2, 1, Some(0x000000ff));
        set_bitmap_pixel(&mut bmp, 0, 0, 0x050505ff);
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 5), 0.0);
        assert_eq!(get_bitmap_coverage(&bmp, 0x000000ff, 4), 0.5);
    }

    #[test]
    fn returns_0_for_an_empty_bitmap() {
        assert_eq!(get_bitmap_coverage(&create_bitmap(0, 0, None), 0x000000ff, 0), 0.0);
    }
}
