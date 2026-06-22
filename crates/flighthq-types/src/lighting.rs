//! Light DATA descriptors for single-pass forward lighting.
//!
//! Pure data — color/intensity/range/cone/shadow params only; placement comes
//! from the owning scene node's transform in a later pass, not from these
//! structs. Each variant carries a `kind` discriminant so a packer can switch
//! on light type.
//!
//! Color is packed sRGB-albedo RGBA (`0xrrggbbaa`); a packed 8-bit integer
//! cannot carry HDR, so a light's linear radiance is
//! `unpack_color_to_linear(color) * intensity`. `range` is the falloff cutoff
//! distance in world units, with `-1` meaning infinite for the punctual lights.
//!
//! Shadow params, on lights that cast: `casts_shadow` opts in; `shadow_bias`
//! and `normal_bias` fight shadow acne / peter-panning; `pcf_radius` is the
//! percentage-closer-filtering kernel radius in shadow-map texels.

use crate::entity::Entity;
use crate::geometry::Vector3;
use crate::resource::ColorSpace;
use crate::texture::CubeTexture;

/// Open enumeration of light variants. Concrete lights extend the suite with
/// their own descriptor fields. The `*_KIND_NAME` constants name each variant
/// for kind construction at the owning crate (`flighthq-lighting`).
#[derive(Clone, Debug)]
pub enum Light {
    Ambient(AmbientLight),
    Directional(DirectionalLight),
    Point(PointLight),
    Spot(SpotLight),
    Hemisphere(HemisphereLight),
    Area(AreaLight),
}

impl Entity for Light {}

/// Uniform omnidirectional fill. No position or direction; lights every surface
/// equally. Does not cast shadows.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct AmbientLight {
    pub color: u32,
    pub intensity: f32,
}

impl Entity for AmbientLight {}

/// Infinitely distant directional light (sun). `direction` is the world-space
/// travel direction of the light (normalized); surfaces are lit from
/// `-direction`.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct DirectionalLight {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Vector3,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
}

impl Entity for DirectionalLight {}

/// Omnidirectional point light. `position` is world-space; intensity falls off
/// with distance up to `range` (`-1` = infinite).
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct PointLight {
    pub casts_shadow: bool,
    pub color: u32,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub shadow_bias: f32,
}

impl Entity for PointLight {}

/// Cone-restricted point light. `position`/`direction` are world-space; the cone
/// is described by the precomputed cosines of its inner and outer half-angles
/// (`inner_cone_cos >= outer_cone_cos`). `range` is the distance cutoff
/// (`-1` = infinite).
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct SpotLight {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Vector3,
    pub inner_cone_cos: f32,
    pub intensity: f32,
    pub normal_bias: f32,
    pub outer_cone_cos: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub shadow_bias: f32,
}

impl Entity for SpotLight {}

/// Gradient ambient: `sky_color` from above, `ground_color` from below, blended
/// by the surface normal's vertical component. Does not cast shadows.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct HemisphereLight {
    pub ground_color: u32,
    pub intensity: f32,
    pub sky_color: u32,
}

impl Entity for HemisphereLight {}

/// Rectangular area light (LTC-shaded). `position` is the rectangle center,
/// `direction` its facing normal, `right`/`up` its half-extent axes (length
/// encodes half-width/half-height) in world space.
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct AreaLight {
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Vector3,
    pub intensity: f32,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub right: Vector3,
    pub shadow_bias: f32,
    pub up: Vector3,
}

impl Entity for AreaLight {}

/// Image-based environment lighting + skybox source. `environment` is the
/// radiance cubemap used for the skybox and as the IBL specular/irradiance
/// source; `intensity` scales its contribution. `None` cubemap means no
/// environment.
#[derive(Clone, Debug)]
pub struct Environment {
    pub environment: Option<CubeTexture>,
    pub intensity: f32,
}

impl Entity for Environment {}

/// Color space marker re-export so light packers can reference the SDK's single
/// sRGB->linear seam without importing the resource module directly.
pub type LightColorSpace = ColorSpace;

pub const AMBIENT_LIGHT_KIND_NAME: &str = "AmbientLight";
pub const AREA_LIGHT_KIND_NAME: &str = "AreaLight";
pub const DIRECTIONAL_LIGHT_KIND_NAME: &str = "DirectionalLight";
pub const ENVIRONMENT_KIND_NAME: &str = "Environment";
pub const HEMISPHERE_LIGHT_KIND_NAME: &str = "HemisphereLight";
pub const POINT_LIGHT_KIND_NAME: &str = "PointLight";
pub const SPOT_LIGHT_KIND_NAME: &str = "SpotLight";
