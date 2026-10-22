use flight_bitmap::contract::*;
use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_texture::{AlphaType, PixelFormat, TextureGamut, TextureSource, TextureSourceRef};

mod clone_bitmap {
    use super::*;

    #[test]
    fn produces_identical_values() {
        let img = create_bitmap(2, 2, Some(0x102030ff));
        let c = clone_bitmap(&img);
        assert_eq!(c.width, img.width);
        assert_eq!(c.height, img.height);
        assert_eq!(c.data, img.data);
    }

    #[test]
    fn is_a_deep_copy() {
        let img = create_bitmap(2, 2, Some(0x102030ff));
        let mut c = clone_bitmap(&img);
        c.data[0] = 0;
        assert_eq!(img.data[0], 0x10);
    }
}

mod convert_bitmap_alpha_type {
    use super::*;

    #[test]
    fn treats_opaque_as_a_non_premultiplied_target() {
        let mut img = create_bitmap(1, 1, Some(0x80808080));
        img.alpha_type = AlphaType::Premultiplied;
        convert_bitmap_alpha_type(&mut img, AlphaType::Opaque);
        assert_eq!(img.alpha_type, AlphaType::Opaque);
        assert_eq!(&img.data[..], &[255, 255, 255, 128]);
        assert_eq!(img.version, 1);
    }

    #[test]
    fn premultiplies_straight_alpha() {
        let mut img = create_bitmap(1, 1, Some(0x80808080));
        img.alpha_type = AlphaType::Straight;
        convert_bitmap_alpha_type(&mut img, AlphaType::Premultiplied);
        assert_eq!(img.alpha_type, AlphaType::Premultiplied);
        assert_eq!(img.data[0], 64);
        assert_eq!(img.data[3], 0x80);
    }

    #[test]
    fn unpremultiplies_premultiplied_alpha() {
        let mut img = create_bitmap(1, 1, None);
        img.alpha_type = AlphaType::Premultiplied;
        img.data[0] = 64;
        img.data[1] = 64;
        img.data[2] = 64;
        img.data[3] = 128;
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.alpha_type, AlphaType::Straight);
        assert_eq!(img.data[0], 128);
    }

    #[test]
    fn is_a_noop_when_target_matches_current() {
        let mut img = create_bitmap(1, 1, Some(0xff0000ff));
        img.alpha_type = AlphaType::Straight;
        let before = img.data.clone();
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.data, before);
    }

    #[test]
    fn handles_zero_alpha_pixels_on_unpremultiply() {
        let mut img = create_bitmap(1, 1, None);
        img.alpha_type = AlphaType::Premultiplied;
        convert_bitmap_alpha_type(&mut img, AlphaType::Straight);
        assert_eq!(img.data[0], 0);
        assert_eq!(img.data[3], 0);
    }
}

mod create_bitmap {
    use super::*;

    #[test]
    fn declares_the_canonical_texture_source_facts() {
        let bitmap = create_bitmap(3, 2, None);
        assert_eq!(bitmap.kind, BITMAP_TEXTURE_SOURCE_KIND);
        assert_eq!(bitmap.kind, "bitmap");
        assert_eq!(bitmap.alpha_type, AlphaType::Straight);
        assert_eq!(bitmap.gamut, TextureGamut::Srgb);
        assert_eq!(bitmap.format, PixelFormat::Rgba8Unorm);
        assert_eq!((bitmap.width, bitmap.height, bitmap.version), (3, 2, 0));
        assert_eq!(bitmap.data.len(), 24);
    }

    #[test]
    fn binds_directly_as_a_texture_source_sharing_one_identity() {
        let shared: Ref<Bitmap> = Arc::new(RwLock::new(create_bitmap(2, 2, None)));
        let source: TextureSourceRef = shared.clone();
        assert_eq!(
            Arc::as_ptr(&shared) as *const (),
            Arc::as_ptr(&source) as *const ()
        );
        {
            let guard = source.read().unwrap();
            let fields = guard.texture_source_fields();
            assert_eq!(
                (fields.kind.as_str(), fields.width, fields.height),
                ("bitmap", 2, 2)
            );
        }
        source.write().unwrap().texture_source_fields_mut().version = 7;
        assert_eq!(shared.read().unwrap().version, 7);
        // Deref and the TextureSource binding reach the same composed fields.
        let guard = shared.read().unwrap();
        let via_deref: &flight_texture::TextureSourceFields = &guard;
        assert!(std::ptr::eq(via_deref, guard.texture_source_fields()));
    }

    #[test]
    fn recovers_the_same_bitmap_and_mutates_its_pixel_storage() {
        let shared: Ref<Bitmap> = Arc::new(RwLock::new(create_bitmap(1, 1, None)));
        let source: TextureSourceRef = shared.clone();
        {
            let guard = source.read().unwrap();
            let any: &dyn Any = &*guard;
            let bitmap = any.downcast_ref::<Bitmap>().unwrap();
            assert_eq!(bitmap.data.as_ptr(), shared.read().unwrap().data.as_ptr());
        }
        {
            let mut guard = source.write().unwrap();
            let any: &mut dyn Any = &mut *guard;
            any.downcast_mut::<Bitmap>().unwrap().data[0] = 17;
        }
        assert_eq!(shared.read().unwrap().data[0], 17);
    }

    #[test]
    fn creates_zeroed_image_data_when_no_color_provided() {
        let img = create_bitmap(2, 2, None);
        assert_eq!(img.width, 2);
        assert_eq!(img.height, 2);
        assert_eq!(img.data.len(), 16);
        assert!(img.data.iter().all(|&v| v == 0));
    }

    #[test]
    fn fills_with_the_given_color() {
        let img = create_bitmap(2, 2, Some(0x112233ff));
        assert_eq!(img.data[0], 0x11);
        assert_eq!(img.data[1], 0x22);
        assert_eq!(img.data[2], 0x33);
        assert_eq!(img.data[3], 0xff);
    }

    #[test]
    fn derives_owned_pixel_storage_from_dimensions_and_color() {
        let img = create_bitmap(3, 2, Some(0x10203040));
        assert_eq!(img.data.len(), 3 * 2 * 4);
        assert!(
            img.data
                .chunks_exact(4)
                .all(|pixel| pixel == [0x10, 0x20, 0x30, 0x40])
        );
    }
}

mod invalidate_bitmap {
    use super::*;

    #[test]
    fn bumps_the_content_version_without_replacing_pixel_storage() {
        let mut bmp = create_bitmap(1, 1, None);
        let data = bmp.data.as_ptr();
        invalidate_bitmap(&mut bmp);
        assert_eq!(bmp.version, 1);
        assert_eq!(bmp.data.as_ptr(), data);
    }
}
