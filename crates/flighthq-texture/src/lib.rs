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

pub use cube_texture::{CubeTextureOptions, clone_cube_texture, create_cube_texture};
pub use sampler::{SamplerOptions, clone_sampler, copy_sampler, create_sampler, equals_sampler};
pub use texture::{
    TextureOptions, clone_texture, copy_texture, create_texture, is_texture_ready,
    set_texture_image,
};
