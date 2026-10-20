use flight_bitmap::*;

mod crop_bitmap_fn {
    use super::*;

    #[test]
    fn returns_correct_dimensions() {
        let src = create_bitmap(10, 10, 0xff0000ff);
        let rect = RectangleLike { x: 2.0, y: 3.0, width: 4.0, height: 5.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(out.width, 4);
        assert_eq!(out.height, 5);
    }

    #[test]
    fn copies_from_source_region() {
        let mut src = create_bitmap(4, 4, 0);
        set_bitmap_pixel(&mut src, 2, 1, 0x00ff00ff);
        let rect = RectangleLike { x: 2.0, y: 1.0, width: 2.0, height: 2.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0x00ff00ff);
    }
}

mod extend_bitmap_fn {
    use super::*;

    #[test]
    fn returns_padded_bitmap() {
        let src = create_bitmap(2, 2, 0x0000ffff);
        let out = extend_bitmap(&src, 1, 2, 3, 4, BitmapEdgeMode::Transparent, 0);
        assert_eq!(out.width, 2 + 1 + 3);
        assert_eq!(out.height, 2 + 2 + 4);
    }

    #[test]
    fn copies_source_into_center() {
        let src = create_bitmap(2, 2, 0xabcdefff);
        let out = extend_bitmap(&src, 1, 1, 1, 1, BitmapEdgeMode::Transparent, 0);
        assert_eq!(get_bitmap_pixel(&out, 1, 1), 0xabcdefff);
    }
}

mod trim_bitmap_fn {
    use super::*;

    #[test]
    fn removes_transparent_border() {
        let mut src = create_bitmap(5, 5, 0);
        set_bitmap_pixel(&mut src, 2, 2, 0xff0000ff);
        let out = trim_bitmap(&src);
        assert_eq!(out.width, 1);
        assert_eq!(out.height, 1);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0xff0000ff);
    }
}
