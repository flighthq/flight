use flight_bitmap::contract::*;

mod create_bitmap_region_fn {
    use super::*;

    #[test]
    fn covers_the_whole_bitmap_with_default_bounds() {
        let bmp = create_bitmap(7, 5, None);
        let r = create_bitmap_region(bmp, 0, 0, 7, 5);
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 7);
        assert_eq!(r.height, 5);
    }

    #[test]
    fn uses_the_supplied_bounds() {
        let bmp = create_bitmap(8, 8, None);
        let r = create_bitmap_region(bmp, 1, 2, 3, 4);
        assert_eq!(r.x, 1);
        assert_eq!(r.y, 2);
        assert_eq!(r.width, 3);
        assert_eq!(r.height, 4);
        assert_eq!(r.bitmap.width, 8);
    }
}

mod set_bitmap_region_fn {
    use super::*;

    #[test]
    fn mutates_the_existing_region() {
        let mut r = BitmapRegion::default();
        let bmp = create_bitmap(8, 8, None);
        set_bitmap_region(&mut r, bmp, 2, 3, 4, 5);
        assert_eq!(r.x, 2);
        assert_eq!(r.y, 3);
        assert_eq!(r.width, 4);
        assert_eq!(r.height, 5);
        assert_eq!(r.bitmap.width, 8);
    }

    #[test]
    fn covers_the_whole_bitmap_with_full_dimensions() {
        let a = create_bitmap(2, 2, None);
        let b = create_bitmap(6, 9, None);
        let mut r = create_bitmap_region(a, 0, 0, 2, 2);
        set_bitmap_region(&mut r, b, 0, 0, 6, 9);
        assert_eq!(r.bitmap.width, 6);
        assert_eq!(r.bitmap.height, 9);
        assert_eq!(r.width, 6);
        assert_eq!(r.height, 9);
    }
}
