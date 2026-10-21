//! 2D local transform field group initialization (TS `hasTransform2d.ts`).

use crate::types::*;

/// Options for `init_transform2d_trait` (TS `Partial<HasTransform2D>`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HasTransform2DOptions {
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: Option<f32>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub skew_x: Option<f32>,
    pub skew_y: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// Methods a 2D runtime owner may supply (TS `MethodsOf<HasTransform2DRuntime>`; none today).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Transform2DRuntimeMethods {}

/// Resets the 2D matrix caches (TS `initTransform2DRuntimeTrait`).
pub fn init_transform2d_runtime_trait(
    target: &mut HasTransform2DRuntime,
    _methods: Option<&Transform2DRuntimeMethods>,
) {
    target.local_matrix = None;
    target.rotation_angle = 0.0;
    target.rotation_cosine = 1.0;
    target.rotation_sine = 0.0;
    target.world_matrix = None;
}

/// Applies the 2D transform defaults and any supplied options (TS `initTransform2DTrait`).
pub fn init_transform2d_trait(target: &mut HasTransform2D, obj: Option<&HasTransform2DOptions>) {
    target.pivot_x = obj.and_then(|obj| obj.pivot_x).unwrap_or(0.0);
    target.pivot_y = obj.and_then(|obj| obj.pivot_y).unwrap_or(0.0);
    target.rotation = obj.and_then(|obj| obj.rotation).unwrap_or(0.0);
    target.scale_x = obj.and_then(|obj| obj.scale_x).unwrap_or(1.0);
    target.scale_y = obj.and_then(|obj| obj.scale_y).unwrap_or(1.0);
    target.skew_x = obj.and_then(|obj| obj.skew_x).unwrap_or(0.0);
    target.skew_y = obj.and_then(|obj| obj.skew_y).unwrap_or(0.0);
    target.x = obj.and_then(|obj| obj.x).unwrap_or(0.0);
    target.y = obj.and_then(|obj| obj.y).unwrap_or(0.0);
}
