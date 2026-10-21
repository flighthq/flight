use flight_entity::{EntityRuntime, Float32Array, allocate_entity};
use std::sync::LazyLock;
use crate::Vector3;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Vector2 {
    pub runtime: EntityRuntime,
    pub x: f32,
    pub y: f32,
}

pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    let mut out: Vector2 = allocate_entity();
    initialize_vector2(&mut out, x, y);
    return out;
}

pub fn create_vector2_from_polar(length: f32, angle: f32) -> Vector2 {
    let mut out = create_vector2(0.0, 0.0);
    set_vector2_from_polar(&mut out, length, angle);
    return out;
}

pub fn initialize_vector2(out: &mut Vector2, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}

pub fn add_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + bx;
    out.y = ay + by;
}

pub fn clamp_vector2(out: &mut Vector2, value: &Vector2, min: &Vector2, max: &Vector2) {
    let vx = value.x;
    let vy = value.y;
    let min_x = min.x;
    let min_y = min.y;
    let max_x = max.x;
    let max_y = max.y;
    out.x = if vx < min_x { min_x } else if vx > max_x { max_x } else { vx };
    out.y = if vy < min_y { min_y } else if vy > max_y { max_y } else { vy };
}

pub fn clone_vector2(source: &Vector2) -> Vector2 {
    return create_vector2(source.x, source.y);
}

pub fn copy_vector2(out: &mut Vector2, source: &Vector2) {
    let x = source.x;
    let y = source.y;
    out.x = x;
    out.y = y;
}

pub fn cross_vector2(a: &Vector2, b: &Vector2) -> f32 {
    return a.x * b.y - a.y * b.x;
}

pub fn divide_vector2(out: &mut Vector2, source: &Vector2, divisor: &Vector2) {
    let sx = source.x;
    let sy = source.y;
    let dx = divisor.x;
    let dy = divisor.y;
    out.x = if dx != 0.0 { sx / dx } else { 0.0 };
    out.y = if dy != 0.0 { sy / dy } else { 0.0 };
}

pub fn equals_vector2(a: Option<&Vector2>, b: Option<&Vector2>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}

pub fn get_vector2_angle(source: &Vector2) -> f32 {
    if source.x == 0.0 && source.y == 0.0 {
        return 0.0;
    }
    return source.y.atan2(source.x);
}

pub fn get_vector2_angle_between(a: &Vector2, b: &Vector2) -> f32 {
    let la = get_vector2_length(a);
    let lb = get_vector2_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector2_dot(a, b) / (la * lb);
    return dot.clamp(-1.0, 1.0).acos();
}

pub fn get_vector2_distance(a: &Vector2, b: &Vector2) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return (dx * dx + dy * dy).sqrt();
}

pub fn get_vector2_distance_squared(a: &Vector2, b: &Vector2) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return dx * dx + dy * dy;
}

pub fn get_vector2_dot(a: &Vector2, b: &Vector2) -> f32 {
    return a.x * b.x + a.y * b.y;
}

pub fn get_vector2_length(source: &Vector2) -> f32 {
    return (source.x * source.x + source.y * source.y).sqrt();
}

pub fn get_vector2_length_squared(source: &Vector2) -> f32 {
    return source.x * source.x + source.y * source.y;
}

pub fn interpolate_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2, t: f32) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + t * (bx - ax);
    out.y = ay + t * (by - ay);
}

pub fn max_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = if ax > bx { ax } else { bx };
    out.y = if ay > by { ay } else { by };
}

pub fn min_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = if ax < bx { ax } else { bx };
    out.y = if ay < by { ay } else { by };
}

pub fn multiply_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax * bx;
    out.y = ay * by;
}

pub fn near_equals_vector2(a: &Vector2, b: &Vector2, tolerance: f32) -> bool {
    return (a.x - b.x).abs() < tolerance && (a.y - b.y).abs() < tolerance;
}

pub fn negate_vector2(out: &mut Vector2, source: &Vector2) {
    let x = source.x;
    let y = source.y;
    out.x = x * -1.0;
    out.y = y * -1.0;
}

pub fn normalize_vector2(out: &mut Vector2, source: &Vector2) -> f32 {
    let x = source.x;
    let y = source.y;
    let l = (x * x + y * y).sqrt();
    if l != 0.0 {
        out.x = x / l;
        out.y = y / l;
    } else {
        out.x = 0.0;
        out.y = 0.0;
    }
    return l;
}

pub fn offset_vector2(out: &mut Vector2, source: &Vector2, dx: f32, dy: f32) {
    let x = source.x;
    let y = source.y;
    out.x = x + dx;
    out.y = y + dy;
}

pub fn reflect_vector2(out: &mut Vector2, incident: &Vector2, normal: &Vector2) {
    let ix = incident.x;
    let iy = incident.y;
    let nx = normal.x;
    let ny = normal.y;
    let two_dot = 2.0 * (ix * nx + iy * ny);
    out.x = ix - two_dot * nx;
    out.y = iy - two_dot * ny;
}

pub fn rotate_vector2(out: &mut Vector2, source: &Vector2, angle: f32) {
    let c = angle.cos();
    let s = angle.sin();
    let x = source.x;
    let y = source.y;
    out.x = x * c - y * s;
    out.y = x * s + y * c;
}

pub fn scale_vector2(out: &mut Vector2, source: &Vector2, scalar: f32) {
    let x = source.x;
    let y = source.y;
    out.x = x * scalar;
    out.y = y * scalar;
}

pub fn scale_vector2_to_length(out: &mut Vector2, source: &Vector2, length: f32) {
    let x = source.x;
    let y = source.y;
    let current_length = (x * x + y * y).sqrt();
    if current_length == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
    } else {
        let scale = length / current_length;
        out.x = x * scale;
        out.y = y * scale;
    }
}

pub fn set_vector2(out: &mut Vector2, x: f32, y: f32) {
    out.x = x;
    out.y = y;
}

pub fn set_vector2_from_float32_array(out: &mut Vector2, offset: usize, source: &Float32Array) {
    out.x = source[offset];
    out.y = source[offset + 1];
}

pub fn set_vector2_from_polar(out: &mut Vector2, length: f32, angle: f32) {
    out.x = length * angle.cos();
    out.y = length * angle.sin();
}

pub fn set_vector2_from_vector3(out: &mut Vector2, source: &Vector3) {
    out.x = source.x;
    out.y = source.y;
}

pub fn subtract_vector2(out: &mut Vector2, source: &Vector2, other: &Vector2) {
    let sx = source.x;
    let sy = source.y;
    let ox = other.x;
    let oy = other.y;
    out.x = sx - ox;
    out.y = sy - oy;
}

pub fn write_vector2_to_float32_array(out: &mut [f32], offset: usize, source: &Vector2) {
    out[offset] = source.x;
    out[offset + 1] = source.y;
}

impl Vector2 {
    pub fn new(x: f32, y: f32) -> Self {
        return create_vector2(x, y);
    }

    pub fn add(&self, other: &Self) -> Self {
        let mut out = Self::default();
        add_vector2(&mut out, self, other);
        return out;
    }

    pub fn angle(&self) -> f32 {
        return get_vector2_angle(self);
    }

    pub fn angle_between(&self, other: &Self) -> f32 {
        return get_vector2_angle_between(self, other);
    }

    pub fn clamp(&self, min: &Self, max: &Self) -> Self {
        let mut out = Self::default();
        clamp_vector2(&mut out, self, min, max);
        return out;
    }

    pub fn cross(&self, other: &Self) -> f32 {
        return cross_vector2(self, other);
    }

    pub fn distance(&self, other: &Self) -> f32 {
        return get_vector2_distance(self, other);
    }

    pub fn distance_squared(&self, other: &Self) -> f32 {
        return get_vector2_distance_squared(self, other);
    }

    pub fn divide(&self, divisor: &Self) -> Self {
        let mut out = Self::default();
        divide_vector2(&mut out, self, divisor);
        return out;
    }

    pub fn dot(&self, other: &Self) -> f32 {
        return get_vector2_dot(self, other);
    }

    pub fn from_polar(length: f32, angle: f32) -> Self {
        return create_vector2_from_polar(length, angle);
    }

    pub fn interpolate(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        interpolate_vector2(&mut out, self, other, t);
        return out;
    }

    pub fn length(&self) -> f32 {
        return get_vector2_length(self);
    }

    pub fn length_squared(&self) -> f32 {
        return get_vector2_length_squared(self);
    }

    pub fn max(&self, other: &Self) -> Self {
        let mut out = Self::default();
        max_vector2(&mut out, self, other);
        return out;
    }

    pub fn min(&self, other: &Self) -> Self {
        let mut out = Self::default();
        min_vector2(&mut out, self, other);
        return out;
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_vector2(&mut out, self, other);
        return out;
    }

    pub fn near_equals(&self, other: &Self, tolerance: f32) -> bool {
        return near_equals_vector2(self, other, tolerance);
    }

    pub fn negated(&self) -> Self {
        let mut out = Self::default();
        negate_vector2(&mut out, self);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_vector2(&mut out, self);
        return out;
    }

    pub fn offset(&self, dx: f32, dy: f32) -> Self {
        let mut out = Self::default();
        offset_vector2(&mut out, self, dx, dy);
        return out;
    }

    pub fn reflected(&self, normal: &Self) -> Self {
        let mut out = Self::default();
        reflect_vector2(&mut out, self, normal);
        return out;
    }

    pub fn rotated(&self, angle: f32) -> Self {
        let mut out = Self::default();
        rotate_vector2(&mut out, self, angle);
        return out;
    }

    pub fn scaled(&self, scalar: f32) -> Self {
        let mut out = Self::default();
        scale_vector2(&mut out, self, scalar);
        return out;
    }

    pub fn scaled_to_length(&self, length: f32) -> Self {
        let mut out = Self::default();
        scale_vector2_to_length(&mut out, self, length);
        return out;
    }

    pub fn subtracted(&self, other: &Self) -> Self {
        let mut out = Self::default();
        subtract_vector2(&mut out, self, other);
        return out;
    }
}

pub static VECTOR2_X_AXIS: LazyLock<Vector2> = LazyLock::new(|| create_vector2(1.0, 0.0));
pub static VECTOR2_Y_AXIS: LazyLock<Vector2> = LazyLock::new(|| create_vector2(0.0, 1.0));
