use flight_bitmap::contract::*;
use flight_entity::allocate_entity;
use flight_texture::{AlphaType, PixelFormat, TextureGamut};

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion {
        bitmap: bmp,
        x: 0,
        y: 0,
        width: w,
        height: h,
    };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion {
        bitmap: bmp,
        x,
        y,
        width,
        height,
    };
}

mod initialize_bitmap {
    use super::*;

    #[test]
    fn writes_every_bitmap_field_and_the_bitmap_kind() {
        let mut out: Bitmap = allocate_entity();
        let data: Box<[u8]> = vec![1, 2, 3, 4].into_boxed_slice();
        initialize_bitmap(
            &mut out,
            AlphaType::Premultiplied,
            data,
            PixelFormat::Rgba8Unorm,
            TextureGamut::DisplayP3,
            1,
            1,
        );
        assert_eq!(out.alpha_type, AlphaType::Premultiplied);
        assert_eq!(&out.data[..], &[1, 2, 3, 4]);
        assert_eq!(out.format, PixelFormat::Rgba8Unorm);
        assert_eq!(out.gamut, TextureGamut::DisplayP3);
        assert_eq!(out.height, 1);
        assert_eq!(out.width, 1);
        assert_eq!(out.kind, BITMAP_TEXTURE_SOURCE_KIND);
        assert_eq!(out.version, 0);
    }
}

mod merge_bitmap_channels {
    use super::*;

    #[test]
    fn combines_one_channel_from_each_input_into_the_output() {
        let r_surf = create_bitmap(1, 1, Some(0xff000000));
        let g_surf = create_bitmap(1, 1, Some(0x00ff0000));
        let b_surf = create_bitmap(1, 1, Some(0x0000ff00));
        let a_surf = create_bitmap(1, 1, Some(0x000000ff));
        let out = create_bitmap(1, 1, None);
        let mut or_ = region(out);
        merge_bitmap_channels(
            &mut or_,
            &region(r_surf),
            &region(g_surf),
            &region(b_surf),
            &region(a_surf),
        );
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 0, 0), 0xffffffff);
    }

    #[test]
    fn uses_the_minimum_dimension_overlap() {
        let r = create_bitmap(3, 1, Some(0xff000000));
        let g = create_bitmap(3, 1, Some(0x00ff0000));
        let b = create_bitmap(3, 1, Some(0x0000ff00));
        let a = create_bitmap(3, 1, Some(0x000000ff));
        let out = create_bitmap(3, 1, None);
        let mut or_ = region(out);
        merge_bitmap_channels(
            &mut or_,
            &region_at(r, 0, 0, 1, 1),
            &region(g),
            &region(b),
            &region(a),
        );
        assert_eq!((get_bitmap_pixel(&or_.bitmap, 0, 0) >> 24) & 0xff, 0xff);
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 1, 0), 0x00000000);
    }
}

mod split_bitmap_channels {
    use super::*;

    #[test]
    fn returns_four_bitmaps_of_the_same_dimensions() {
        let src = create_bitmap(3, 2, Some(0x112233ff));
        let channels = split_bitmap_channels(&src);
        assert_eq!(channels[0].width, 3);
        assert_eq!(channels[0].height, 2);
        assert_eq!(channels[1].width, 3);
        assert_eq!(channels[2].height, 2);
        assert_eq!(channels[3].width, 3);
    }

    #[test]
    fn each_channel_bitmap_is_a_grayscale_copy_of_that_channel() {
        let mut src = create_bitmap(1, 1, None);
        set_bitmap_pixel(&mut src, 0, 0, 0x11223344);
        let channels = split_bitmap_channels(&src);
        assert_eq!((get_bitmap_pixel(&channels[0], 0, 0) >> 24) & 0xff, 0x11);
        assert_eq!((get_bitmap_pixel(&channels[0], 0, 0) >> 16) & 0xff, 0x11);
        assert_eq!((get_bitmap_pixel(&channels[0], 0, 0) >> 8) & 0xff, 0x11);
        assert_eq!(get_bitmap_pixel(&channels[0], 0, 0) & 0xff, 0xff);
        assert_eq!((get_bitmap_pixel(&channels[1], 0, 0) >> 24) & 0xff, 0x22);
        assert_eq!((get_bitmap_pixel(&channels[2], 0, 0) >> 24) & 0xff, 0x33);
        assert_eq!((get_bitmap_pixel(&channels[3], 0, 0) >> 24) & 0xff, 0x44);
        assert_eq!(get_bitmap_pixel(&channels[3], 0, 0) & 0xff, 0x44);
    }

    #[test]
    fn round_trip_split_then_merge_reconstructs_the_original() {
        let mut src = create_bitmap(2, 2, None);
        set_bitmap_pixel(&mut src, 0, 0, 0xaabbccdd);
        set_bitmap_pixel(&mut src, 1, 0, 0x11223344);
        let [r, g, b, a] = split_bitmap_channels(&src);
        let out = create_bitmap(2, 2, None);
        let mut or_ = region(out);
        merge_bitmap_channels(&mut or_, &region(r), &region(g), &region(b), &region(a));
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 0, 0), 0xaabbccdd);
        assert_eq!(get_bitmap_pixel(&or_.bitmap, 1, 0), 0x11223344);
    }

    #[test]
    fn returns_distinct_bitmap_objects() {
        let source = create_bitmap(1, 1, Some(0x10203040));
        let mut channels = split_bitmap_channels(&source);
        channels[0].data[0] = 99;
        assert_ne!(channels[1].data[0], 99);
        assert_ne!(channels[2].data[0], 99);
        assert_ne!(channels[3].data[0], 99);
        assert_eq!(source.data[0], 0x10);
    }
}
