use std::sync::Arc;

use crate::support::create_test_parse_state;
use flight_swf::contract::*;
use flight_texture::{Texture, TextureFilter, TextureWrap};

mod acquire_swf_image_texture {
    use super::*;

    #[test]
    fn allocates_a_texture_without_a_source() {
        let mut owner = create_owner();
        let texture = acquire_swf_image_texture(&mut owner, 1, false, true);
        let texture = texture.read().unwrap();
        let Texture::Texture2D(texture) = &*texture else {
            panic!("expected Texture2D");
        };
        assert!(texture.source.is_none());
    }

    #[test]
    fn builds_the_requested_sampler() {
        let mut owner = create_owner();
        let smooth_repeat = acquire_swf_image_texture(&mut owner, 1, true, true);
        {
            let guard = smooth_repeat.read().unwrap();
            let Texture::Texture2D(texture) = &*guard else {
                panic!("expected Texture2D");
            };
            assert_eq!(texture.sampler.mag_filter, TextureFilter::Linear);
            assert!(texture.sampler.mipmaps);
            assert_eq!(texture.sampler.wrap_u, TextureWrap::Repeat);
        }

        let sharp_clamp = acquire_swf_image_texture(&mut owner, 1, false, false);
        let sharp_clamp = sharp_clamp.read().unwrap();
        let Texture::Texture2D(sharp_clamp) = &*sharp_clamp else {
            panic!("expected Texture2D");
        };
        assert_eq!(sharp_clamp.sampler.mag_filter, TextureFilter::Nearest);
        assert!(!sharp_clamp.sampler.mipmaps);
        assert_eq!(sharp_clamp.sampler.wrap_u, TextureWrap::ClampToEdge);
    }

    #[test]
    fn keeps_characters_apart() {
        let mut owner = create_owner();
        let first = acquire_swf_image_texture(&mut owner, 1, false, true);
        let second = acquire_swf_image_texture(&mut owner, 2, false, true);
        assert!(!Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn returns_a_distinct_texture_per_sampling_variant() {
        let mut owner = create_owner();
        let clamped = acquire_swf_image_texture(&mut owner, 7, false, true);
        let repeated = acquire_swf_image_texture(&mut owner, 7, true, true);
        let sharp = acquire_swf_image_texture(&mut owner, 7, false, false);
        assert!(!Arc::ptr_eq(&repeated, &clamped));
        assert!(!Arc::ptr_eq(&sharp, &clamped));
        assert_eq!(
            owner.image_textures.read().unwrap().get(&7).unwrap().len(),
            3
        );
    }

    #[test]
    fn returns_the_same_texture_for_the_same_sampling() {
        let mut owner = create_owner();
        let first = acquire_swf_image_texture(&mut owner, 7, false, true);
        let second = acquire_swf_image_texture(&mut owner, 7, false, true);
        assert!(Arc::ptr_eq(&first, &second));
    }
}

fn create_owner() -> SwfTagParseState {
    return create_test_parse_state();
}
