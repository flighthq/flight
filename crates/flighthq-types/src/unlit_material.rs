//! Lighting-independent and pass-infrastructure surface material header
//! types: [`DepthMaterial`], [`EmissiveMaterial`], [`MatcapMaterial`],
//! [`NormalMaterial`], [`ToonMaterial`], [`UnlitMaterial`],
//! [`VertexColorMaterial`], [`WireframeMaterial`].
//!
//! Ports `@flighthq/types`' `DepthMaterial.ts` / `EmissiveMaterial.ts` /
//! `MatcapMaterial.ts` / `NormalMaterial.ts` / `ToonMaterial.ts` /
//! `UnlitMaterial.ts` / `VertexColorMaterial.ts` / `WireframeMaterial.ts`.
//! Constructors and kind ids live in `flighthq-materials`
//! (`unlit_materials.rs`), mirroring the `@flighthq/materials`
//! `unlitMaterials.ts` split between header (this file) and implementation.

use crate::alpha::AlphaType;
use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::kind::KindId;
use crate::material::Material;
use crate::pbr_material::{MaterialAlphaMode, SurfaceMaterial};
use crate::texture::Texture;

/// Pass-infrastructure material: outputs linearized view-space depth, used by
/// shadow and depth-of-field/velocity passes. `near`/`far` set the
/// linearization range when the material is used as a standalone
/// depth-visualization; the depth pass supplies the camera range otherwise.
#[derive(Clone, Debug)]
pub struct DepthMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub far: f32,
    pub near: f32,
}

impl Entity for DepthMaterial {}

impl Material for DepthMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for DepthMaterial {
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

/// Self-illuminating, lighting-independent material. `emissive` is packed
/// sRGB-albedo RGBA, `emissive_map` modulates it, and `emissive_strength`
/// scales linear radiance — values > 1 drive bloom on GPU backends. Full
/// fidelity on every backend.
#[derive(Clone, Debug)]
pub struct EmissiveMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub emissive: u32,
    pub emissive_map: Option<Texture>,
    pub emissive_strength: f32,
}

impl Entity for EmissiveMaterial {}

impl Material for EmissiveMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for EmissiveMaterial {
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

/// Material-capture shading: a prebaked lit sphere sampled by the view-space
/// normal, giving full stylized "lighting" with no scene lights. `matcap` is
/// the capture texture; `tint` is a packed sRGB-albedo RGBA multiplier.
/// Lighting-independent, so full fidelity on every backend.
#[derive(Clone, Debug)]
pub struct MatcapMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub matcap: Option<Texture>,
    pub tint: u32,
}

impl Entity for MatcapMaterial {}

impl Material for MatcapMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for MatcapMaterial {
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

/// Pass-infrastructure material: outputs the world- (or view-) space surface
/// normal as color, used by normal-buffer-driven passes. `normal_map`
/// perturbs the geometric normal; `normal_scale` scales the tangent-space
/// perturbation.
#[derive(Clone, Debug)]
pub struct NormalMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub normal_map: Option<Texture>,
    pub normal_scale: f32,
}

impl Entity for NormalMaterial {}

impl Material for NormalMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for NormalMaterial {
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

/// Cel shading: diffuse N·L is quantized through a 1D `ramp` texture into
/// stepped bands. `base_color` is packed sRGB-albedo RGBA, `base_color_map`
/// tints it, and `steps` is the band count used when no ramp is bound.
#[derive(Clone, Debug)]
pub struct ToonMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub base_color: u32,
    pub base_color_map: Option<Texture>,
    pub ramp: Option<Texture>,
    pub steps: u32,
}

impl Entity for ToonMaterial {}

impl Material for ToonMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for ToonMaterial {
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

/// Lighting-independent flat color. `base_color` is packed sRGB-albedo RGBA;
/// `base_color_map` tints it. Full fidelity on every backend including
/// Canvas2D.
#[derive(Clone, Debug)]
pub struct UnlitMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub base_color: u32,
    pub base_color_map: Option<Texture>,
}

impl Entity for UnlitMaterial {}

impl Material for UnlitMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for UnlitMaterial {
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

/// Uses the mesh's reserved `color0` vertex attribute directly as unlit
/// surface color. `tint` is a packed sRGB-albedo RGBA multiplier over the
/// interpolated vertex color. No maps. Full fidelity on every backend.
#[derive(Clone, Debug)]
pub struct VertexColorMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub tint: u32,
}

impl Entity for VertexColorMaterial {}

impl Material for VertexColorMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for VertexColorMaterial {
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

/// Edge-only debug shading via barycentric/fwidth line rendering. `color` is
/// the packed sRGB-albedo RGBA line color; `thickness` is the line width in
/// pixels. No maps.
#[derive(Clone, Debug)]
pub struct WireframeMaterial {
    pub kind: KindId,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub alpha_type: AlphaType,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
    pub color: u32,
    pub thickness: f32,
}

impl Entity for WireframeMaterial {}

impl Material for WireframeMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

impl SurfaceMaterial for WireframeMaterial {
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
