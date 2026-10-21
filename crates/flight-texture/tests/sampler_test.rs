use flight_texture::contract::*;

fn options() -> SamplerOptions {
    return SamplerOptions {
        anisotropy: Some(8.0),
        mag_filter: Some(TextureFilter::Nearest),
        min_filter: Some(TextureFilter::NearestMipmapNearest),
        mipmaps: Some(false),
        wrap_u: Some(TextureWrap::Repeat),
        wrap_v: Some(TextureWrap::MirrorRepeat),
    };
}

mod clone_sampler {
    use super::*;

    #[test]
    fn copies_every_field_into_independent_sampling_state() {
        let source = create_sampler(Some(&options()));
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
        let source = create_sampler(Some(&options()));
        let mut out = create_sampler(None);
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
            Some(&create_sampler(None)),
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
    fn applies_defaults_and_individual_overrides() {
        let defaults = create_sampler(None);
        assert_eq!(defaults.anisotropy, 1.0);
        assert_eq!(defaults.mag_filter, TextureFilter::Linear);
        assert_eq!(defaults.min_filter, TextureFilter::LinearMipmapLinear);
        assert!(defaults.mipmaps);
        assert_eq!(defaults.wrap_u, TextureWrap::ClampToEdge);
        assert_eq!(defaults.wrap_v, TextureWrap::ClampToEdge);

        let sampler = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(4.0),
            mag_filter: None,
            min_filter: None,
            mipmaps: None,
            wrap_u: Some(TextureWrap::Repeat),
            wrap_v: None,
        }));
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
        let a = create_sampler(Some(&options()));
        let b = create_sampler(Some(&options()));
        assert!(equals_sampler(Some(&a), Some(&a)));
        assert!(equals_sampler(Some(&a), Some(&b)));
        assert!(!equals_sampler(Some(&a), None));
        assert!(!equals_sampler(None, None));
        let different = create_sampler(None);
        assert!(!equals_sampler(Some(&a), Some(&different)));
    }
}

mod initialize_sampler {
    use super::*;

    #[test]
    fn reinitializes_preallocated_sampling_state() {
        let mut out = create_sampler(None);
        initialize_sampler(&mut out, Some(&options()));
        assert_eq!(out.anisotropy, 8.0);
        assert_eq!(out.wrap_v, TextureWrap::MirrorRepeat);
    }
}
