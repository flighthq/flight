use flight_bitmap::contract::*;

mod crop_bitmap {
    use super::*;

    #[test]
    fn returns_a_bitmap_with_the_requested_dimensions() {
        let src = create_bitmap(10, 10, Some(0xff0000ff));
        let rect = RectangleLike { x: 2.0, y: 3.0, width: 4.0, height: 5.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(out.width, 4);
        assert_eq!(out.height, 5);
    }

    #[test]
    fn copies_pixels_from_the_source_region() {
        let mut src = create_bitmap(4, 4, None);
        set_bitmap_pixel(&mut src, 2, 1, 0x00ff00ff);
        let rect = RectangleLike { x: 2.0, y: 1.0, width: 2.0, height: 2.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0x00ff00ff);
    }

    #[test]
    fn preserves_source_gamut_and_alpha_type() {
        let src = create_bitmap(2, 2, Some(0xff0000ff));
        let rect = RectangleLike { x: 0.0, y: 0.0, width: 2.0, height: 2.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(out.gamut, src.gamut);
        assert_eq!(out.alpha_type, src.alpha_type);
    }

    #[test]
    fn fills_pixels_outside_the_source_with_transparent_black() {
        let src = create_bitmap(2, 2, Some(0xffffffff));
        let rect = RectangleLike { x: 1.0, y: 1.0, width: 3.0, height: 3.0 };
        let out = crop_bitmap(&src, &rect);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0xffffffff);
        assert_eq!(get_bitmap_pixel(&out, 2, 2), 0x00000000);
    }

    #[test]
    fn returns_a_distinct_bitmap_object() {
        let source = create_bitmap(2, 2, Some(0xff0000ff));
        let mut cropped = crop_bitmap(&source, &RectangleLike { x: 0.0, y: 0.0, width: 2.0, height: 2.0 });
        cropped.data[0] = 0;
        assert_eq!(source.data[0], 0xff);
    }
}

mod extend_bitmap {
    use super::*;

    #[test]
    fn returns_a_bitmap_padded_by_the_correct_number_of_pixels() {
        let src = create_bitmap(2, 2, Some(0x0000ffff));
        let out = extend_bitmap(&src, 1, 2, 3, 4, BitmapEdgeMode::Transparent, 0);
        assert_eq!(out.width, 2 + 1 + 3);
        assert_eq!(out.height, 2 + 2 + 4);
    }

    #[test]
    fn copies_source_pixels_into_the_center_region() {
        let src = create_bitmap(2, 2, Some(0xabcdefff));
        let out = extend_bitmap(&src, 1, 1, 1, 1, BitmapEdgeMode::Transparent, 0);
        assert_eq!(get_bitmap_pixel(&out, 1, 1), 0xabcdefff);
    }

    #[test]
    fn transparent_edge_mode_fills_padding_with_transparent_black() {
        let src = create_bitmap(2, 2, Some(0xff0000ff));
        let out = extend_bitmap(&src, 1, 1, 1, 1, BitmapEdgeMode::Transparent, 0);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0x00000000);
    }

    #[test]
    fn transparent_edge_mode_uses_fill_color_when_provided() {
        let src = create_bitmap(2, 2, Some(0xff0000ff));
        let out = extend_bitmap(&src, 1, 1, 1, 1, BitmapEdgeMode::Transparent, 0xffffffff);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0xffffffff);
    }

    #[test]
    fn clamp_edge_mode_repeats_border_pixels_in_padding() {
        let mut src = create_bitmap(2, 2, Some(0x0000ffff));
        set_bitmap_pixel(&mut src, 0, 0, 0x123456ff);
        let out = extend_bitmap(&src, 1, 1, 0, 0, BitmapEdgeMode::Clamp, 0);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0x123456ff);
    }

    #[test]
    fn wrap_edge_mode_tiles_the_source_in_padding() {
        let mut src = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xff0000ff);
        set_bitmap_pixel(&mut src, 1, 0, 0x00ff00ff);
        let out = extend_bitmap(&src, 0, 0, 2, 0, BitmapEdgeMode::Wrap, 0);
        assert_eq!(get_bitmap_pixel(&out, 2, 0), 0xff0000ff);
        assert_eq!(get_bitmap_pixel(&out, 3, 0), 0x00ff00ff);
    }
}

mod trim_bitmap {
    use super::*;

    #[test]
    fn removes_transparent_border_rows_and_columns() {
        let mut src = create_bitmap(5, 5, None);
        set_bitmap_pixel(&mut src, 2, 2, 0xff0000ff);
        let out = trim_bitmap(&src);
        assert_eq!(out.width, 1);
        assert_eq!(out.height, 1);
        assert_eq!(get_bitmap_pixel(&out, 0, 0), 0xff0000ff);
    }

    #[test]
    fn returns_1x1_transparent_bitmap_for_fully_transparent_input() {
        let src = create_bitmap(3, 3, None);
        let out = trim_bitmap(&src);
        assert_eq!(out.width, 1);
        assert_eq!(out.height, 1);
        assert_eq!(get_bitmap_pixel(&out, 0, 0) & 0xff, 0);
    }

    #[test]
    fn returns_bitmap_equal_to_source_when_no_transparent_border() {
        let src = create_bitmap(2, 2, Some(0xff0000ff));
        let out = trim_bitmap(&src);
        assert_eq!(out.width, 2);
        assert_eq!(out.height, 2);
    }
}
