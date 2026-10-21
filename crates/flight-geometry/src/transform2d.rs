use crate::Matrix;
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq)]
pub struct Transform2D {
    runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub skew_x: f32,
    pub skew_y: f32,
    pub pivot_x: f32,
    pub pivot_y: f32,
}

pub fn create_transform2d(
    x: f32, y: f32, rotation: f32,
    scale_x: f32, scale_y: f32,
    skew_x: f32, skew_y: f32,
    pivot_x: f32, pivot_y: f32,
) -> Transform2D {
    let mut out: Transform2D = allocate_entity();
    initialize_transform2d(&mut out, x, y, rotation, scale_x, scale_y, skew_x, skew_y, pivot_x, pivot_y);
    return out;
}

pub fn initialize_transform2d(
    out: &mut Transform2D,
    x: f32, y: f32, rotation: f32,
    scale_x: f32, scale_y: f32,
    skew_x: f32, skew_y: f32,
    pivot_x: f32, pivot_y: f32,
) {
    out.x = x;
    out.y = y;
    out.rotation = rotation;
    out.scale_x = scale_x;
    out.scale_y = scale_y;
    out.skew_x = skew_x;
    out.skew_y = skew_y;
    out.pivot_x = pivot_x;
    out.pivot_y = pivot_y;
}

/// Decomposes a 2D affine matrix into a Transform2D's fields. Rotation/skew are in degrees.
/// Pivot is reset to the origin; x/y receive the raw translation.
pub fn decompose_matrix_to_transform2d(out: &mut Transform2D, source: &Matrix) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let scale_x = (a * a + b * b).sqrt();
    let reflected = a * d - b * c < 0.0;
    let scale_y = if reflected { -(c * c + d * d).sqrt() } else { (c * c + d * d).sqrt() };
    let skew_x_degrees = (if reflected { c.atan2(-d) } else { (-c).atan2(d) }) * RAD_TO_DEG;
    let skew_y_degrees = b.atan2(a) * RAD_TO_DEG;
    if skew_x_degrees == skew_y_degrees {
        out.rotation = skew_y_degrees;
        out.skew_x = 0.0;
        out.skew_y = 0.0;
    } else {
        out.rotation = 0.0;
        out.skew_x = skew_x_degrees;
        out.skew_y = skew_y_degrees;
    }
    out.pivot_x = 0.0;
    out.pivot_y = 0.0;
    out.scale_x = scale_x;
    out.scale_y = scale_y;
    out.x = source.tx;
    out.y = source.ty;
}

impl Default for Transform2D {
    fn default() -> Self {
        return Transform2D {
            runtime: EntityRuntimeSlot::default(),
            x: 0.0, y: 0.0, rotation: 0.0,
            scale_x: 1.0, scale_y: 1.0,
            skew_x: 0.0, skew_y: 0.0,
            pivot_x: 0.0, pivot_y: 0.0,
        };
    }
}

impl Transform2D {
    pub fn new(
        x: f32, y: f32, rotation: f32,
        scale_x: f32, scale_y: f32,
        skew_x: f32, skew_y: f32,
        pivot_x: f32, pivot_y: f32,
    ) -> Self {
        return create_transform2d(x, y, rotation, scale_x, scale_y, skew_x, skew_y, pivot_x, pivot_y);
    }
}

const RAD_TO_DEG: f32 = 180.0 / std::f32::consts::PI;
