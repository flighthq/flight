use flight_entity::allocate_entity;

use crate::types::*;

pub fn create_anisotropic_sampler(level: f32) -> Sampler {
    let mut out = create_sampler();
    out.anisotropy = level;
    return out;
}

pub fn create_clamp_linear_sampler() -> Sampler {
    return create_sampler();
}

pub fn create_pixel_art_sampler() -> Sampler {
    let mut out = create_sampler();
    out.mag_filter = TextureFilter::Nearest;
    out.min_filter = TextureFilter::Nearest;
    out.mipmaps = false;
    return out;
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored sampling fields after canonical construction
pub fn create_sampler() -> Sampler {
    let mut out: Sampler = allocate_entity();
    initialize_sampler(&mut out);
    return out;
}

pub fn create_tiling_sampler() -> Sampler {
    let mut out = create_sampler();
    out.wrap_u = TextureWrap::Repeat;
    out.wrap_v = TextureWrap::Repeat;
    return out;
}

// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization establishes canonical sampling defaults before caller-authored assignment
pub fn initialize_sampler(out: &mut Sampler) {
    out.anisotropy = 1.0;
    out.mag_filter = TextureFilter::Linear;
    out.min_filter = TextureFilter::LinearMipmapLinear;
    out.mipmaps = true;
    out.wrap_u = TextureWrap::ClampToEdge;
    out.wrap_v = TextureWrap::ClampToEdge;
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
