//! `flighthq-texture` — textures and samplers: image-backed material texture
//! bindings and cubemaps.
//!
//! Ports the TypeScript `@flighthq/texture` package. The [`flighthq_types::Texture`],
//! [`flighthq_types::Sampler`], and [`flighthq_types::CubeTexture`] header types
//! live in `flighthq-types`; this crate owns their constructors and helpers.
//!
//! The TS constructors take a `Readonly<Partial<…Like>>` overrides object;
//! Rust expresses that with a per-constructor `*Options` struct of `Option`
//! fields (`Default`), passed as `Option<&…Options>` to mirror the `opts?`
//! argument.

pub mod cube_texture;
pub mod sampler;
pub mod texture;

use flighthq_types::ImageResource;

/// Value-equality of two optional image bindings. TS compares image bindings by
/// reference (`a.image === b.image`); the Rust port stores images by value (the
/// recorded value-type seam divergence), so identity is compared field-wise.
pub(crate) fn equals_image_binding(a: &Option<ImageResource>, b: &Option<ImageResource>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => {
            a.alpha_type == b.alpha_type
                && a.data == b.data
                && a.format == b.format
                && a.height == b.height
                && a.version == b.version
                && a.width == b.width
        }
        (None, None) => true,
        _ => false,
    }
}

pub use cube_texture::{
    CubeTextureOptions, clone_cube_texture, copy_cube_texture, create_cube_texture,
    equals_cube_texture, get_cube_texture_face_size, is_cube_texture_complete,
    set_cube_texture_face,
};
pub use sampler::{
    SamplerOptions, clone_sampler, copy_sampler, create_anisotropic_sampler,
    create_clamp_linear_sampler, create_pixel_art_sampler, create_sampler, create_tiling_sampler,
    equals_sampler,
};
pub use texture::{
    TextureOptions, clone_texture, copy_texture, create_texture, equals_texture,
    get_texture_height, get_texture_uv_matrix, get_texture_width, is_texture_ready,
    set_texture_image, set_texture_uv_offset, set_texture_uv_rotation, set_texture_uv_scale,
};
