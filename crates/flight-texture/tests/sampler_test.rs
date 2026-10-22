use flight_texture::contract::*;

fn configured_sampler() -> Sampler {
    let mut sampler = create_sampler();
    sampler.anisotropy = 8.0;
    sampler.mag_filter = TextureFilter::Nearest;
    sampler.min_filter = TextureFilter::NearestMipmapNearest;
    sampler.mipmaps = false;
    sampler.wrap_u = TextureWrap::Repeat;
    sampler.wrap_v = TextureWrap::MirrorRepeat;
    return sampler;
}

mod clone_sampler {
    use super::*;

    #[test]
    fn copies_every_field_into_independent_sampling_state() {
        let source = configured_sampler();
        let mut copy = clone_sampler(&source);
        assert!(equals_sampler(Some(&copy), Some(&source)));
        copy.anisotropy = 2.0;
        assert_eq!(source.anisotropy, 8.0);
    }
}

mod copy_sampler {
    use super::*;

    #[test]
    fn writes_every_field_without_replacing_the_out_entity() {
        let source = configured_sampler();
        let mut out = create_sampler();
        copy_sampler(&mut out, &source);
        assert!(equals_sampler(Some(&out), Some(&source)));
    }
}

mod create_anisotropic_sampler {
    use super::*;

    #[test]
    fn changes_only_the_anisotropy_level() {
        let sampler = create_anisotropic_sampler(16.0);
        assert_eq!(sampler.anisotropy, 16.0);
        assert_eq!(sampler.min_filter, TextureFilter::LinearMipmapLinear);
        assert!(sampler.mipmaps);
    }
}

mod create_clamp_linear_sampler {
    use super::*;

    #[test]
    fn creates_the_default_sampling_state() {
        assert!(equals_sampler(
            Some(&create_clamp_linear_sampler()),
            Some(&create_sampler()),
        ));
    }
}

mod create_pixel_art_sampler {
    use super::*;

    #[test]
    fn uses_nearest_filters_without_mipmaps() {
        let sampler = create_pixel_art_sampler();
        assert_eq!(sampler.mag_filter, TextureFilter::Nearest);
        assert_eq!(sampler.min_filter, TextureFilter::Nearest);
        assert!(!sampler.mipmaps);
    }
}

mod create_sampler {
    use super::*;

    #[test]
    fn establishes_defaults_before_caller_authored_assignment() {
        let mut sampler = create_sampler();
        assert_eq!(sampler.anisotropy, 1.0);
        assert_eq!(sampler.mag_filter, TextureFilter::Linear);
        assert_eq!(sampler.min_filter, TextureFilter::LinearMipmapLinear);
        assert!(sampler.mipmaps);
        assert_eq!(sampler.wrap_u, TextureWrap::ClampToEdge);
        assert_eq!(sampler.wrap_v, TextureWrap::ClampToEdge);

        sampler.anisotropy = 4.0;
        sampler.wrap_u = TextureWrap::Repeat;
        assert_eq!(sampler.anisotropy, 4.0);
        assert_eq!(sampler.wrap_u, TextureWrap::Repeat);
        assert_eq!(sampler.wrap_v, TextureWrap::ClampToEdge);
    }
}

mod create_tiling_sampler {
    use super::*;

    #[test]
    fn repeats_both_axes_with_trilinear_filtering() {
        let sampler = create_tiling_sampler();
        assert_eq!(sampler.wrap_u, TextureWrap::Repeat);
        assert_eq!(sampler.wrap_v, TextureWrap::Repeat);
        assert_eq!(sampler.min_filter, TextureFilter::LinearMipmapLinear);
    }
}

mod equals_sampler {
    use super::*;

    #[test]
    fn compares_all_state_and_rejects_null_operands() {
        let a = configured_sampler();
        let b = configured_sampler();
        assert!(equals_sampler(Some(&a), Some(&a)));
        assert!(equals_sampler(Some(&a), Some(&b)));
        assert!(!equals_sampler(Some(&a), None));
        assert!(!equals_sampler(None, None));
        let different = create_sampler();
        assert!(!equals_sampler(Some(&a), Some(&different)));
    }
}

mod initialize_sampler {
    use super::*;

    #[test]
    fn restores_defaults_without_replacing_entity_identity() {
        let mut out = configured_sampler();
        let uid = flight_entity::get_entity_uid(&mut out);
        initialize_sampler(&mut out);
        assert_eq!(out.anisotropy, 1.0);
        assert_eq!(out.mag_filter, TextureFilter::Linear);
        assert_eq!(out.min_filter, TextureFilter::LinearMipmapLinear);
        assert!(out.mipmaps);
        assert_eq!(out.wrap_u, TextureWrap::ClampToEdge);
        assert_eq!(out.wrap_v, TextureWrap::ClampToEdge);
        assert_eq!(flight_entity::get_entity_uid(&mut out), uid);
    }
}
