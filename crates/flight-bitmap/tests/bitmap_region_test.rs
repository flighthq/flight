use flight_bitmap::*;

mod create_bitmap_region_fn {
    use super::*;

    #[test]
    fn creates_region_with_given_parameters() {
        let bmp = create_bitmap(10, 10, 0);
        let r = create_bitmap_region(bmp, 2, 3, 4, 5);
        assert_eq!(r.x, 2);
        assert_eq!(r.y, 3);
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 5);
        assert_eq!(r.bitmap.width, 10);
    }
}

mod set_bitmap_region_fn {
    use super::*;

    #[test]
    fn overwrites_all_fields() {
        let mut r = BitmapRegion::default();
        let bmp = create_bitmap(8, 8, 0);
        set_bitmap_region(&mut r, bmp, 1, 2, 3, 4);
        assert_eq!(r.x, 1);
        assert_eq!(r.y, 2);
        assert_eq!(r.width, 3);
        assert_eq!(r.height, 4);
        assert_eq!(r.bitmap.width, 8);
    }
}
