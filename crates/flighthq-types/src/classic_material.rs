//! Classic (non-PBR) surface material header types: [`BlinnPhongMaterial`],
//! [`LambertMaterial`], [`PhongMaterial`].
//!
//! Ports `@flighthq/types`' `BlinnPhongMaterial.ts` / `LambertMaterial.ts` /
//! `PhongMaterial.ts`. Constructors and kind ids live in `flighthq-materials`
//! (`classic_materials.rs`), mirroring the `@flighthq/materials`
//! `classicMaterials.ts` split between header (this file) and implementation.

use crate::alpha::AlphaType;
use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::kind::KindId;
use crate::material::Material;
use crate::pbr_material::{MaterialAlphaMode, SurfaceMaterial};
use crate::texture::Texture;

/// Classic Blinn-Phong shading: diffuse plus a half-vector specular lobe
/// (cheaper, smoother highlights than reflection-vector Phong). `diffuse`/
/// `specular` are packed sRGB-albedo RGBA (with their maps); `shininess` is
/// the specular exponent; `normal_map`/`normal_scale` perturb the surface
/// normal.
#[derive(Clone, Debug)]
pub struct BlinnPhongMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: Option<Texture>,
    pub normal_map: Option<Texture>,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: Option<Texture>,
}

impl Entity for BlinnPhongMaterial {}

impl Material for BlinnPhongMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for BlinnPhongMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// Classic diffuse-only Lambertian shading. `diffuse` is packed sRGB-albedo
/// RGBA, `diffuse_map` tints it; `emissive`/`emissive_map` add
/// self-illumination.
#[derive(Clone, Debug)]
pub struct LambertMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: Option<Texture>,
    pub emissive: u32,
    pub emissive_map: Option<Texture>,
}

impl Entity for LambertMaterial {}

impl Material for LambertMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for LambertMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}

/// Classic Phong shading: diffuse plus a reflection-vector specular lobe.
/// `diffuse`/`specular` are packed sRGB-albedo RGBA (with their maps);
/// `shininess` is the specular exponent; `normal_map`/`normal_scale` perturb
/// the surface normal.
#[derive(Clone, Debug)]
pub struct PhongMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub diffuse: u32,
    pub diffuse_map: Option<Texture>,
    pub normal_map: Option<Texture>,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: Option<Texture>,
}

impl Entity for PhongMaterial {}

impl Material for PhongMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for PhongMaterial {
    fn alpha_cutoff(&self) -> f32 {
        self.alpha_cutoff
    }
    fn alpha_mode(&self) -> MaterialAlphaMode {
        self.alpha_mode
    }
    fn alpha_type(&self) -> AlphaType {
        self.alpha_type
    }
    fn blend_mode(&self) -> BlendMode {
        self.blend_mode
    }
    fn double_sided(&self) -> bool {
        self.double_sided
    }
}
