//! `Sampler` constructors and comparison helpers.

use flighthq_types::{Sampler, TextureFilter, TextureWrap};

/// Partial overrides for [`create_sampler`], mirroring the TS
/// `Readonly<Partial<SamplerLike>>` constructor argument. Each `None` field
/// keeps the AAA default.
#[derive(Copy, Clone, Default)]
pub struct SamplerOptions {
    pub anisotropy: Option<f32>,
    pub mag_filter: Option<TextureFilter>,
    pub min_filter: Option<TextureFilter>,
    pub mipmaps: Option<bool>,
    pub wrap_u: Option<TextureWrap>,
    pub wrap_v: Option<TextureWrap>,
}

/// Allocates an independent [`Sampler`] with the same sampling state. A
/// [`Sampler`] holds only plain values, so the clone shares nothing mutable
/// with its source.
pub fn clone_sampler(source: &Sampler) -> Sampler {
    *source
}

/// Copies every sampling field from `source` into `out` in place. Safe when
/// `out` aliases `source`: each field is read and written independently.
pub fn copy_sampler(out: &mut Sampler, source: &Sampler) {
    out.anisotropy = source.anisotropy;
    out.mag_filter = source.mag_filter;
    out.min_filter = source.min_filter;
    out.mipmaps = source.mipmaps;
    out.wrap_u = source.wrap_u;
    out.wrap_v = source.wrap_v;
}

/// Builds a [`Sampler`] with the AAA-default sampling state: clamp-to-edge on
/// both axes, linear magnification, trilinear minification, a generated mip
/// chain, and anisotropy disabled (1). Pass [`SamplerOptions`] to override any
/// of these.
pub fn create_sampler(opts: Option<&SamplerOptions>) -> Sampler {
    Sampler {
        anisotropy: opts.and_then(|o| o.anisotropy).unwrap_or(1.0),
        mag_filter: opts
            .and_then(|o| o.mag_filter)
            .unwrap_or(TextureFilter::Linear),
        min_filter: opts
            .and_then(|o| o.min_filter)
            .unwrap_or(TextureFilter::LinearMipmapLinear),
        mipmaps: opts.and_then(|o| o.mipmaps).unwrap_or(true),
        wrap_u: opts
            .and_then(|o| o.wrap_u)
            .unwrap_or(TextureWrap::ClampToEdge),
        wrap_v: opts
            .and_then(|o| o.wrap_v)
            .unwrap_or(TextureWrap::ClampToEdge),
    }
}

/// True when both samplers describe identical sampling state. Returns false for
/// absent (`None`) operands so callers can compare nullable references directly.
pub fn equals_sampler(a: Option<&Sampler>, b: Option<&Sampler>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_sampler_copies_every_field_into_an_independent_value() {
        let source = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(8.0),
            mag_filter: Some(TextureFilter::Nearest),
            min_filter: Some(TextureFilter::NearestMipmapNearest),
            mipmaps: Some(false),
            wrap_u: Some(TextureWrap::Repeat),
            wrap_v: Some(TextureWrap::MirrorRepeat),
        }));

        let mut copy = clone_sampler(&source);

        assert!(equals_sampler(Some(&copy), Some(&source)));

        copy.anisotropy = 2.0;
        assert_eq!(copy.anisotropy, 2.0);
        assert_eq!(source.anisotropy, 8.0);
    }

    #[test]
    fn copy_sampler_writes_every_field_from_source_into_a_distinct_out() {
        let source = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(4.0),
            mipmaps: Some(false),
            wrap_u: Some(TextureWrap::Repeat),
            ..Default::default()
        }));
        let mut out = create_sampler(None);

        copy_sampler(&mut out, &source);

        assert!(equals_sampler(Some(&out), Some(&source)));
    }

    #[test]
    fn copy_sampler_is_safe_when_out_aliases_source() {
        let mut source = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(4.0),
            wrap_v: Some(TextureWrap::MirrorRepeat),
            ..Default::default()
        }));

        let snapshot = source;
        copy_sampler(&mut source, &snapshot);

        assert_eq!(source.anisotropy, 4.0);
        assert_eq!(source.wrap_v, TextureWrap::MirrorRepeat);
    }

    #[test]
    fn create_sampler_applies_the_default_sampling_state() {
        let sampler = create_sampler(None);

        assert_eq!(sampler.anisotropy, 1.0);
        assert_eq!(sampler.mag_filter, TextureFilter::Linear);
        assert_eq!(sampler.min_filter, TextureFilter::LinearMipmapLinear);
        assert!(sampler.mipmaps);
        assert_eq!(sampler.wrap_u, TextureWrap::ClampToEdge);
        assert_eq!(sampler.wrap_v, TextureWrap::ClampToEdge);
    }

    #[test]
    fn create_sampler_overrides_only_the_supplied_fields() {
        let sampler = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(16.0),
            wrap_u: Some(TextureWrap::Repeat),
            ..Default::default()
        }));

        assert_eq!(sampler.anisotropy, 16.0);
        assert_eq!(sampler.wrap_u, TextureWrap::Repeat);
        assert_eq!(sampler.wrap_v, TextureWrap::ClampToEdge);
        assert!(sampler.mipmaps);
    }

    #[test]
    fn equals_sampler_is_true_for_identical_state_and_the_same_reference() {
        let a = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(4.0),
            ..Default::default()
        }));
        let b = create_sampler(Some(&SamplerOptions {
            anisotropy: Some(4.0),
            ..Default::default()
        }));

        assert!(equals_sampler(Some(&a), Some(&b)));
        assert!(equals_sampler(Some(&a), Some(&a)));
    }

    #[test]
    fn equals_sampler_is_false_when_any_field_differs() {
        let a = create_sampler(None);
        let b = create_sampler(Some(&SamplerOptions {
            mipmaps: Some(false),
            ..Default::default()
        }));

        assert!(!equals_sampler(Some(&a), Some(&b)));
    }

    #[test]
    fn equals_sampler_is_false_for_absent_operands() {
        let a = create_sampler(None);

        assert!(!equals_sampler(Some(&a), None));
        assert!(!equals_sampler(None, Some(&a)));
        assert!(!equals_sampler(None, None));
    }
}
