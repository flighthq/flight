use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_anisotropic_sampler(level: f32) -> Sampler {
    return create_sampler(Some(&SamplerOptions {
        anisotropy: Some(level),
        ..SamplerOptions::default()
    }));
}

pub fn create_clamp_linear_sampler() -> Sampler {
    return create_sampler(None);
}

pub fn create_pixel_art_sampler() -> Sampler {
    return create_sampler(Some(&SamplerOptions {
        mag_filter: Some(TextureFilter::Nearest),
        min_filter: Some(TextureFilter::Nearest),
        mipmaps: Some(false),
        ..SamplerOptions::default()
    }));
}

pub fn create_sampler(opts: Option<&SamplerOptions>) -> Sampler {
    let mut out: Sampler = allocate_entity();
    initialize_sampler(&mut out, opts);
    return out;
}

pub fn create_tiling_sampler() -> Sampler {
    return create_sampler(Some(&SamplerOptions {
        wrap_u: Some(TextureWrap::Repeat),
        wrap_v: Some(TextureWrap::Repeat),
        ..SamplerOptions::default()
    }));
}

pub fn initialize_sampler(out: &mut Sampler, opts: Option<&SamplerOptions>) {
    out.anisotropy = opts.and_then(|value| value.anisotropy).unwrap_or(1.0);
    out.mag_filter = opts
        .and_then(|value| value.mag_filter)
        .unwrap_or(TextureFilter::Linear);
    out.min_filter = opts
        .and_then(|value| value.min_filter)
        .unwrap_or(TextureFilter::LinearMipmapLinear);
    out.mipmaps = opts.and_then(|value| value.mipmaps).unwrap_or(true);
    out.wrap_u = opts
        .and_then(|value| value.wrap_u)
        .unwrap_or(TextureWrap::ClampToEdge);
    out.wrap_v = opts
        .and_then(|value| value.wrap_v)
        .unwrap_or(TextureWrap::ClampToEdge);
}

pub fn clone_sampler(source: &Sampler) -> Sampler {
    let mut out: Sampler = allocate_entity();
    copy_sampler(&mut out, source);
    return out;
}

pub fn copy_sampler(out: &mut Sampler, source: &Sampler) {
    let anisotropy = source.anisotropy;
    let mag_filter = source.mag_filter;
    let min_filter = source.min_filter;
    let mipmaps = source.mipmaps;
    let wrap_u = source.wrap_u;
    let wrap_v = source.wrap_v;
    out.anisotropy = anisotropy;
    out.mag_filter = mag_filter;
    out.min_filter = min_filter;
    out.mipmaps = mipmaps;
    out.wrap_u = wrap_u;
    out.wrap_v = wrap_v;
}

pub fn equals_sampler(a: Option<&Sampler>, b: Option<&Sampler>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => {
            std::ptr::eq(a, b)
                || (a.anisotropy == b.anisotropy
                    && a.mag_filter == b.mag_filter
                    && a.min_filter == b.min_filter
                    && a.mipmaps == b.mipmaps
                    && a.wrap_u == b.wrap_u
                    && a.wrap_v == b.wrap_v)
        }
        _ => false,
    };
}
