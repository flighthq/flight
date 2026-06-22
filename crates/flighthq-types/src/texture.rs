//! Texture / sampler / cubemap header types for the 3D material seam.
//!
//! The universal image bridge for materials: an [`ImageResource`] pixel source
//! plus the sampling state and color space that govern how a material reads it.

use crate::entity::Entity;
use crate::geometry::Vector2;
use crate::resource::ImageResource;

/// Texture-coordinate wrap behavior on one axis, mirroring the GL/Wgpu address
/// modes.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextureWrap {
    #[default]
    Repeat,
    ClampToEdge,
    MirrorRepeat,
}

/// Minification/magnification filtering, mirroring the GL/Wgpu filter modes. The
/// mip-aware modes apply only when `mipmaps` is true on the [`Sampler`].
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextureFilter {
    Nearest,
    #[default]
    Linear,
    NearestMipmapNearest,
    LinearMipmapNearest,
    NearestMipmapLinear,
    LinearMipmapLinear,
}

/// How the texture's pixels are interpreted at sample time. `baseColor`/
/// `emissive` maps are `Srgb` (decoded to linear on read); data maps — normal,
/// metallic-roughness, occlusion — are `Linear` and must not be gamma-decoded.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum TextureColorSpace {
    #[default]
    Linear,
    Srgb,
}

/// Sampling state shared by a [`Texture`]: per-axis wrap, min/mag filters,
/// anisotropy, and whether a mip chain is generated and sampled. Plain data;
/// the backend translates it to a GL sampler / `GPUSampler`. `anisotropy` of 1
/// disables anisotropic filtering.
#[derive(Copy, Clone, PartialEq, Debug)]
pub struct Sampler {
    pub anisotropy: f32,
    pub mag_filter: TextureFilter,
    pub min_filter: TextureFilter,
    pub mipmaps: bool,
    pub wrap_u: TextureWrap,
    pub wrap_v: TextureWrap,
}

impl Entity for Sampler {}

impl Default for Sampler {
    fn default() -> Self {
        Self {
            anisotropy: 1.0,
            mag_filter: TextureFilter::default(),
            min_filter: TextureFilter::default(),
            mipmaps: false,
            wrap_u: TextureWrap::default(),
            wrap_v: TextureWrap::default(),
        }
    }
}

/// The universal image bridge for materials. `image` is `None` for an unbound
/// slot (the material treats it as absent). The uv-transform fields are the
/// `KHR_texture_transform` model — `uv_offset`/`uv_scale` shift and tile the
/// coordinates and `uv_rotation` (radians) spins them — applied before sampling.
#[derive(Clone, Debug)]
pub struct Texture {
    pub color_space: TextureColorSpace,
    pub image: Option<ImageResource>,
    pub sampler: Sampler,
    pub uv_offset: Vector2,
    pub uv_rotation: f32,
    pub uv_scale: Vector2,
}

impl Entity for Texture {}

/// A cubemap texture: six face images in the canonical `+X, -X, +Y, -Y, +Z, -Z`
/// order, sharing one [`Sampler`] and color space. A face is `None` when
/// unbound; a complete cube has all six set.
#[derive(Clone, Debug)]
pub struct CubeTexture {
    pub color_space: TextureColorSpace,
    pub faces: [Option<ImageResource>; 6],
    pub sampler: Sampler,
}

impl Entity for CubeTexture {}
