use std::fmt;

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref};
use flight_geometry::{Aabb, Vector3, create_aabb, create_vector3};
use flight_texture::Texture;

// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural trait accessors preserve the open Light family and are contract dispatch, not convenience methods

pub const AMBIENT_LIGHT_KIND: &str = "AmbientLight";
pub const AREA_LIGHT_KIND: &str = "AreaLight";
pub const DIRECTIONAL_LIGHT_KIND: &str = "DirectionalLight";
pub const ENVIRONMENT_KIND: &str = "Environment";
pub const HEMISPHERE_LIGHT_KIND: &str = "HemisphereLight";
pub const POINT_LIGHT_KIND: &str = "PointLight";
pub const SPOT_LIGHT_KIND: &str = "SpotLight";

pub const ALL_LIGHT_LAYERS: i32 = -1;
pub const DIRECTIONAL_SHADOW_MAP_SIZE: u32 = 1024;
pub const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS: u32 = 2;
pub const LIGHT_PROBE_SH_FLOATS: usize = 27;
pub const MAX_FORWARD_LIGHTS: usize = 4;
pub const SCENE_LIGHT_DIRECTIONAL_DIRECTION_OFFSET: usize = 0;
pub const SCENE_LIGHT_DIRECTIONAL_RADIANCE_OFFSET: usize = 4;
pub const SCENE_LIGHT_AMBIENT_RADIANCE_OFFSET: usize = 8;
pub const SCENE_LIGHT_HEAD_FLOATS: usize = 12;
pub const SCENE_LIGHT_POINT_OFFSET: usize = SCENE_LIGHT_HEAD_FLOATS;
pub const SCENE_LIGHT_POINT_STRIDE: usize = 8;
pub const SCENE_LIGHT_SPOT_OFFSET: usize =
    SCENE_LIGHT_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
pub const SCENE_LIGHT_SPOT_STRIDE: usize = 16;
pub const SCENE_LIGHT_HEMISPHERE_OFFSET: usize =
    SCENE_LIGHT_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
pub const SCENE_LIGHT_HEMISPHERE_STRIDE: usize = 12;
pub const SCENE_LIGHT_BLOCK_FLOATS: usize =
    SCENE_LIGHT_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum LightUnit {
    Candela,
    Lumen,
    Lux,
    #[default]
    Unitless,
}

pub const CANDELA_LIGHT_UNIT: LightUnit = LightUnit::Candela;
pub const LUMEN_LIGHT_UNIT: LightUnit = LightUnit::Lumen;
pub const LUX_LIGHT_UNIT: LightUnit = LightUnit::Lux;
pub const UNITLESS_LIGHT_UNIT: LightUnit = LightUnit::Unitless;

#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum Scene3DForwardLightSelectionReason {
    SelectionPrepared,
    SelectionRequired,
    #[default]
    WithinBudget,
}

/// Open base contract for every light. Custom kinds can opt into the enabled and shadow gates by
/// overriding the optional structural accessors; absence retains the TypeScript defaults.
pub trait Light: Entity + fmt::Debug + Send + Sync {
    fn kind(&self) -> &str;
    fn enabled_value(&self) -> Option<bool> {
        return None;
    }
    fn casts_shadow_value(&self) -> Option<bool> {
        return None;
    }
    fn colored_intensity(&self) -> Option<(u32, f32)> {
        return None;
    }
    fn hemisphere_intensity(&self) -> Option<(u32, u32, f32)> {
        return None;
    }
    fn spatial_influence(&self) -> Option<(&Vector3, f32)> {
        return None;
    }
}

pub trait PunctualLight: Light {
    fn position(&self) -> &Vector3;
    fn range(&self) -> f32;
    fn decay(&self) -> f32;
    fn spot_cone(&self) -> Option<(&Vector3, f32, f32)> {
        return None;
    }
}

pub trait PhotometricLightLike {
    fn intensity(&self) -> f32;
    fn intensity_mut(&mut self) -> &mut f32;
    fn intensity_unit(&self) -> LightUnit;
}

pub type LightRef = Ref<dyn Light>;

#[derive(Clone, Debug)]
pub struct AmbientLight {
    runtime: EntityRuntimeSlot,
    pub color: u32,
    pub enabled: bool,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub kind: Kind,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AmbientLightOptions {
    pub color: Option<u32>,
    pub enabled: Option<bool>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
}

#[derive(Clone, Debug)]
pub struct DirectionalLight {
    runtime: EntityRuntimeSlot,
    pub cascade_count: u32,
    pub cascade_splits: Vec<f32>,
    pub casts_shadow: bool,
    pub color: u32,
    pub direction: Vector3,
    pub enabled: bool,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub kind: Kind,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub shadow_bias: f32,
    pub shadow_far: f32,
    pub shadow_map_size: u32,
    pub shadow_near: f32,
    pub shadow_strength: f32,
}

#[derive(Clone, Debug, Default)]
pub struct DirectionalLightOptions {
    pub cascade_count: Option<u32>,
    pub cascade_splits: Option<Vec<f32>>,
    pub casts_shadow: Option<bool>,
    pub color: Option<u32>,
    pub direction: Option<Vector3>,
    pub enabled: Option<bool>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
    pub normal_bias: Option<f32>,
    pub pcf_radius: Option<f32>,
    pub shadow_bias: Option<f32>,
    pub shadow_far: Option<f32>,
    pub shadow_map_size: Option<u32>,
    pub shadow_near: Option<f32>,
    pub shadow_strength: Option<f32>,
}

#[derive(Clone, Debug)]
pub struct PointLight {
    runtime: EntityRuntimeSlot,
    pub casts_shadow: bool,
    pub color: u32,
    pub decay: f32,
    pub enabled: bool,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub layer_mask: i32,
    pub priority: f32,
    pub kind: Kind,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub shadow_bias: f32,
    pub shadow_far: f32,
    pub shadow_map_size: u32,
    pub shadow_near: f32,
    pub shadow_strength: f32,
}

#[derive(Clone, Debug, Default)]
pub struct PointLightOptions {
    pub casts_shadow: Option<bool>,
    pub color: Option<u32>,
    pub decay: Option<f32>,
    pub enabled: Option<bool>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
    pub layer_mask: Option<i32>,
    pub priority: Option<f32>,
    pub normal_bias: Option<f32>,
    pub pcf_radius: Option<f32>,
    pub position: Option<Vector3>,
    pub range: Option<f32>,
    pub shadow_bias: Option<f32>,
    pub shadow_far: Option<f32>,
    pub shadow_map_size: Option<u32>,
    pub shadow_near: Option<f32>,
    pub shadow_strength: Option<f32>,
}

#[derive(Clone, Debug)]
pub struct SpotLight {
    runtime: EntityRuntimeSlot,
    pub casts_shadow: bool,
    pub color: u32,
    pub decay: f32,
    pub direction: Vector3,
    pub enabled: bool,
    pub inner_cone_cos: f32,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub layer_mask: i32,
    pub priority: f32,
    pub kind: Kind,
    pub normal_bias: f32,
    pub outer_cone_cos: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub shadow_bias: f32,
    pub shadow_far: f32,
    pub shadow_map_size: u32,
    pub shadow_near: f32,
    pub shadow_strength: f32,
    pub spot_blend: f32,
}

#[derive(Clone, Debug, Default)]
pub struct SpotLightOptions {
    pub casts_shadow: Option<bool>,
    pub color: Option<u32>,
    pub decay: Option<f32>,
    pub direction: Option<Vector3>,
    pub enabled: Option<bool>,
    pub inner_cone_degrees: Option<f32>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
    pub layer_mask: Option<i32>,
    pub priority: Option<f32>,
    pub normal_bias: Option<f32>,
    pub outer_cone_degrees: Option<f32>,
    pub pcf_radius: Option<f32>,
    pub position: Option<Vector3>,
    pub range: Option<f32>,
    pub shadow_bias: Option<f32>,
    pub shadow_far: Option<f32>,
    pub shadow_map_size: Option<u32>,
    pub shadow_near: Option<f32>,
    pub shadow_strength: Option<f32>,
    pub spot_blend: Option<f32>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpotLightConeAngles {
    pub inner_degrees: f32,
    pub outer_degrees: f32,
}

#[derive(Clone, Debug)]
pub struct HemisphereLight {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
    pub ground_color: u32,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub kind: Kind,
    pub sky_color: u32,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct HemisphereLightOptions {
    pub enabled: Option<bool>,
    pub ground_color: Option<u32>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
    pub sky_color: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct AreaLight {
    runtime: EntityRuntimeSlot,
    pub casts_shadow: bool,
    pub color: u32,
    pub decay: f32,
    pub direction: Vector3,
    pub enabled: bool,
    pub intensity: f32,
    pub intensity_unit: LightUnit,
    pub kind: Kind,
    pub normal_bias: f32,
    pub pcf_radius: f32,
    pub position: Vector3,
    pub range: f32,
    pub right: Vector3,
    pub shadow_bias: f32,
    pub shadow_far: f32,
    pub shadow_map_size: u32,
    pub shadow_near: f32,
    pub shadow_strength: f32,
    pub up: Vector3,
}

#[derive(Clone, Debug, Default)]
pub struct AreaLightOptions {
    pub casts_shadow: Option<bool>,
    pub color: Option<u32>,
    pub decay: Option<f32>,
    pub direction: Option<Vector3>,
    pub enabled: Option<bool>,
    pub intensity: Option<f32>,
    pub intensity_unit: Option<LightUnit>,
    pub normal_bias: Option<f32>,
    pub pcf_radius: Option<f32>,
    pub position: Option<Vector3>,
    pub range: Option<f32>,
    pub right: Option<Vector3>,
    pub shadow_bias: Option<f32>,
    pub shadow_far: Option<f32>,
    pub shadow_map_size: Option<u32>,
    pub shadow_near: Option<f32>,
    pub shadow_strength: Option<f32>,
    pub up: Option<Vector3>,
}

#[derive(Clone, Debug)]
pub struct Environment {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
    pub environment: Option<Ref<Texture>>,
    pub intensity: f32,
    pub kind: Kind,
}

#[derive(Clone, Debug, Default)]
pub struct EnvironmentOptions {
    pub enabled: Option<bool>,
    pub environment: Option<Ref<Texture>>,
    pub intensity: Option<f32>,
}

#[derive(Clone, Debug)]
pub struct LightProbe {
    runtime: EntityRuntimeSlot,
    pub enabled: bool,
    pub position: Vector3,
    pub sh_coefficients: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct LightProbeGrid {
    runtime: EntityRuntimeSlot,
    pub bounds: Aabb,
    pub enabled: bool,
    pub probes: Vec<Ref<LightProbe>>,
    pub resolution: Vector3,
}

#[derive(Clone, Debug, Default)]
pub struct Scene3DLights {
    runtime: EntityRuntimeSlot,
    pub ambient: Option<Ref<AmbientLight>>,
    pub directional: Option<Ref<DirectionalLight>>,
    pub hemisphere: Vec<Ref<HemisphereLight>>,
    pub point: Vec<Ref<PointLight>>,
    pub spot: Vec<Ref<SpotLight>>,
}

pub type Scene3DLightsLike = Scene3DLights;

#[derive(Clone, Debug, Default)]
pub struct Scene3DLightsOptions {
    pub ambient: Option<Ref<AmbientLight>>,
    pub directional: Option<Ref<DirectionalLight>>,
    pub hemisphere: Option<Vec<Ref<HemisphereLight>>>,
    pub point: Option<Vec<Ref<PointLight>>>,
    pub spot: Option<Vec<Ref<SpotLight>>>,
}

#[derive(Clone, Debug, Default)]
pub struct Scene3DForwardLightSelection {
    pub indices: Vec<i32>,
    pub point: Vec<Ref<PointLight>>,
    pub spot: Vec<Ref<SpotLight>>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Scene3DForwardLightSelectionExplanation {
    pub point_light_count: usize,
    pub reason: Scene3DForwardLightSelectionReason,
    pub selection_prepared: bool,
    pub spot_light_count: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Scene3DLightBlock {
    pub ambient_count: usize,
    pub data: Vec<f32>,
    pub directional_count: usize,
    pub hemisphere_count: usize,
    pub point_count: usize,
    pub spot_count: usize,
    pub version: u32,
}

impl Default for AmbientLight {
    fn default() -> Self {
        return AmbientLight {
            runtime: EntityRuntimeSlot::default(),
            color: 0xffff_ffff,
            enabled: true,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            kind: AMBIENT_LIGHT_KIND.to_string(),
        };
    }
}

impl Default for DirectionalLight {
    fn default() -> Self {
        return DirectionalLight {
            runtime: EntityRuntimeSlot::default(),
            cascade_count: 1,
            cascade_splits: vec![1.0],
            casts_shadow: false,
            color: 0xffff_ffff,
            direction: create_vector3(0.0, -1.0, 0.0),
            enabled: true,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            kind: DIRECTIONAL_LIGHT_KIND.to_string(),
            normal_bias: 0.0,
            pcf_radius: 0.0,
            shadow_bias: 0.0,
            shadow_far: 500.0,
            shadow_map_size: 1024,
            shadow_near: 0.5,
            shadow_strength: 1.0,
        };
    }
}

impl Default for PointLight {
    fn default() -> Self {
        return PointLight {
            runtime: EntityRuntimeSlot::default(),
            casts_shadow: false,
            color: 0xffff_ffff,
            decay: 2.0,
            enabled: true,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            layer_mask: ALL_LIGHT_LAYERS,
            priority: 0.0,
            kind: POINT_LIGHT_KIND.to_string(),
            normal_bias: 0.0,
            pcf_radius: 0.0,
            position: create_vector3(0.0, 0.0, 0.0),
            range: -1.0,
            shadow_bias: 0.0,
            shadow_far: 500.0,
            shadow_map_size: 1024,
            shadow_near: 0.5,
            shadow_strength: 1.0,
        };
    }
}

impl Default for SpotLight {
    fn default() -> Self {
        return SpotLight {
            runtime: EntityRuntimeSlot::default(),
            casts_shadow: false,
            color: 0xffff_ffff,
            decay: 2.0,
            direction: create_vector3(0.0, -1.0, 0.0),
            enabled: true,
            inner_cone_cos: 1.0,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            layer_mask: ALL_LIGHT_LAYERS,
            priority: 0.0,
            kind: SPOT_LIGHT_KIND.to_string(),
            normal_bias: 0.0,
            outer_cone_cos: std::f32::consts::FRAC_1_SQRT_2,
            pcf_radius: 0.0,
            position: create_vector3(0.0, 0.0, 0.0),
            range: -1.0,
            shadow_bias: 0.0,
            shadow_far: 500.0,
            shadow_map_size: 1024,
            shadow_near: 0.5,
            shadow_strength: 1.0,
            spot_blend: 0.0,
        };
    }
}

impl Default for HemisphereLight {
    fn default() -> Self {
        return HemisphereLight {
            runtime: EntityRuntimeSlot::default(),
            enabled: true,
            ground_color: 0xffff_ffff,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            kind: HEMISPHERE_LIGHT_KIND.to_string(),
            sky_color: 0xffff_ffff,
        };
    }
}

impl Default for AreaLight {
    fn default() -> Self {
        return AreaLight {
            runtime: EntityRuntimeSlot::default(),
            casts_shadow: false,
            color: 0xffff_ffff,
            decay: 2.0,
            direction: create_vector3(0.0, -1.0, 0.0),
            enabled: true,
            intensity: 1.0,
            intensity_unit: LightUnit::Unitless,
            kind: AREA_LIGHT_KIND.to_string(),
            normal_bias: 0.0,
            pcf_radius: 0.0,
            position: create_vector3(0.0, 0.0, 0.0),
            range: -1.0,
            right: create_vector3(1.0, 0.0, 0.0),
            shadow_bias: 0.0,
            shadow_far: 500.0,
            shadow_map_size: 1024,
            shadow_near: 0.5,
            shadow_strength: 1.0,
            up: create_vector3(0.0, 0.0, 1.0),
        };
    }
}

impl Default for Environment {
    fn default() -> Self {
        return Environment {
            runtime: EntityRuntimeSlot::default(),
            enabled: true,
            environment: None,
            intensity: 1.0,
            kind: ENVIRONMENT_KIND.to_string(),
        };
    }
}

impl Default for LightProbe {
    fn default() -> Self {
        return LightProbe {
            runtime: EntityRuntimeSlot::default(),
            enabled: true,
            position: create_vector3(0.0, 0.0, 0.0),
            sh_coefficients: vec![0.0; LIGHT_PROBE_SH_FLOATS],
        };
    }
}

impl Default for LightProbeGrid {
    fn default() -> Self {
        return LightProbeGrid {
            runtime: EntityRuntimeSlot::default(),
            bounds: create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
            enabled: true,
            probes: Vec::new(),
            resolution: create_vector3(0.0, 0.0, 0.0),
        };
    }
}

macro_rules! impl_entity_direct {
    ($($type:ty),+ $(,)?) => {
        $(flight_entity::impl_entity!($type);)+
    };
}

impl_entity_direct!(
    AmbientLight,
    AreaLight,
    DirectionalLight,
    Environment,
    HemisphereLight,
    LightProbe,
    LightProbeGrid,
    PointLight,
    Scene3DLights,
    SpotLight,
);

macro_rules! impl_colored_light {
    ($type:ty) => {
        impl Light for $type {
            fn kind(&self) -> &str {
                return &self.kind;
            }
            fn enabled_value(&self) -> Option<bool> {
                return Some(self.enabled);
            }
            fn casts_shadow_value(&self) -> Option<bool> {
                return Some(self.casts_shadow);
            }
            fn colored_intensity(&self) -> Option<(u32, f32)> {
                return Some((self.color, self.intensity));
            }
            fn spatial_influence(&self) -> Option<(&Vector3, f32)> {
                return Some((&self.position, self.range));
            }
        }
        impl PhotometricLightLike for $type {
            fn intensity(&self) -> f32 {
                return self.intensity;
            }
            fn intensity_mut(&mut self) -> &mut f32 {
                return &mut self.intensity;
            }
            fn intensity_unit(&self) -> LightUnit {
                return self.intensity_unit;
            }
        }
    };
}

impl Light for AmbientLight {
    fn colored_intensity(&self) -> Option<(u32, f32)> {
        return Some((self.color, self.intensity));
    }
    fn enabled_value(&self) -> Option<bool> {
        return Some(self.enabled);
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
}

impl Light for DirectionalLight {
    fn casts_shadow_value(&self) -> Option<bool> {
        return Some(self.casts_shadow);
    }
    fn colored_intensity(&self) -> Option<(u32, f32)> {
        return Some((self.color, self.intensity));
    }
    fn enabled_value(&self) -> Option<bool> {
        return Some(self.enabled);
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
}

impl_colored_light!(PointLight);
impl_colored_light!(SpotLight);
impl_colored_light!(AreaLight);

impl Light for HemisphereLight {
    fn enabled_value(&self) -> Option<bool> {
        return Some(self.enabled);
    }
    fn hemisphere_intensity(&self) -> Option<(u32, u32, f32)> {
        return Some((self.ground_color, self.sky_color, self.intensity));
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
}

impl Light for Environment {
    fn enabled_value(&self) -> Option<bool> {
        return Some(self.enabled);
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
}

impl PunctualLight for PointLight {
    fn decay(&self) -> f32 {
        return self.decay;
    }
    fn position(&self) -> &Vector3 {
        return &self.position;
    }
    fn range(&self) -> f32 {
        return self.range;
    }
}

impl PunctualLight for SpotLight {
    fn decay(&self) -> f32 {
        return self.decay;
    }
    fn position(&self) -> &Vector3 {
        return &self.position;
    }
    fn range(&self) -> f32 {
        return self.range;
    }
    fn spot_cone(&self) -> Option<(&Vector3, f32, f32)> {
        return Some((&self.direction, self.inner_cone_cos, self.outer_cone_cos));
    }
}

macro_rules! impl_photometric {
    ($($type:ty),+ $(,)?) => {
        $(impl PhotometricLightLike for $type {
            fn intensity(&self) -> f32 { return self.intensity; }
            fn intensity_mut(&mut self) -> &mut f32 { return &mut self.intensity; }
            fn intensity_unit(&self) -> LightUnit { return self.intensity_unit; }
        })+
    };
}

impl_photometric!(AmbientLight, DirectionalLight, HemisphereLight);
