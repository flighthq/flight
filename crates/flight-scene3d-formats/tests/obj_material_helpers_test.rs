use super::obj_test_helper::*;
use flight_image::ImageResourceReference;
use flight_scene3d_formats::*;
use flight_texture::{TextureColorSpace, TextureUvTransform};
use std::sync::Arc;

mod clamp_channel {
    use super::*;
    #[test]
    fn preserves_source_rounding_before_the_exact_byte_write() {
        let input = f32::from_bits(0x3f010101);
        assert_eq!((input * 255.0).round(), 129.0);
        assert_eq!(clamp_channel(input), 128.0);
        assert_eq!(pack_obj_color(&[input; 3], input), 0x80808080);
    }

    #[test]
    fn matches_source_rounding_and_clamps_while_preserving_nan_and_positive_zero() {
        for (input, expected) in [
            (0.0, 0.0),
            (1.0, 255.0),
            (0.5, 128.0),
            (-0.5, 0.0),
            (1.5, 255.0),
            (f32::INFINITY, 255.0),
        ] {
            assert_eq!(clamp_channel(input), expected);
        }
        assert!(clamp_channel(f32::NAN).is_nan());
        assert_eq!(clamp_channel(-0.0).to_bits(), 0);
    }
}

mod external_obj_texture {
    use super::*;

    #[test]
    fn resolves_the_original_diffuse_uri_as_an_srgb_texture() {
        let result = external_obj_texture(
            &mut empty_document(),
            Some("diffuse.png"),
            TextureColorSpace::Srgb,
        )
        .unwrap();
        assert_eq!(
            result.read().unwrap().texture_fields().color_space,
            TextureColorSpace::Srgb
        );
    }

    #[test]
    fn null_is_absent_and_every_texture_keeps_resource_identity_and_its_own_color_space() {
        let mut document = empty_document();
        assert!(external_obj_texture(&mut document, None, TextureColorSpace::Srgb).is_none());
        assert!(document.resources.is_empty());
        let color =
            external_obj_texture(&mut document, Some("shared.png"), TextureColorSpace::Srgb)
                .unwrap();
        let linear =
            external_obj_texture(&mut document, Some("shared.png"), TextureColorSpace::Linear)
                .unwrap();
        assert!(!Arc::ptr_eq(&color, &linear));
        assert_eq!(document.resources.len(), 1);
        assert_eq!(
            color.read().unwrap().texture_fields().color_space,
            TextureColorSpace::Srgb
        );
        assert_eq!(
            linear.read().unwrap().texture_fields().color_space,
            TextureColorSpace::Linear
        );
        let ImageResourceReference::External(resource) = &document.resources[0] else {
            panic!("external");
        };
        let resource = resource.reference.read().unwrap();
        assert!(Arc::ptr_eq(&resource.textures[0], &color));
        assert!(Arc::ptr_eq(&resource.textures[1], &linear));
        drop(resource);
        assert!(external_obj_texture(&mut document, Some(""), TextureColorSpace::Linear).is_some());
    }
}

mod pack_obj_color {
    use super::*;
    #[test]
    fn packs_unsigned_rgba_with_the_sources_bitwise_nan_coercion() {
        assert_eq!(pack_obj_color(&[1.0; 3], 1.0), 0xffffffff);
        assert_eq!(pack_obj_color(&[0.0; 3], 0.0), 0);
        assert_eq!(pack_obj_color(&[1.0, 0.0, 0.0], 1.0), 0xff0000ff);
        assert_eq!(pack_obj_color(&[f32::NAN, 0.5, 2.0], 0.5), 0x0080ff80);
    }
}
