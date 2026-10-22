use crate::Vector3;
use flight_entity::{EntityRuntimeSlot, Float32Array, allocate_entity};
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Vector4 {
    runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub w: f32,
}

/// The Vector4 class represents a vector or point in four-dimensional space using the
/// Cartesian coordinates x, y, z, and w.
///
/// In this space, each component represents an independent axis. When Vector4 is used
/// for three-dimensional graphics or homogeneous coordinates, the x, y, and z components
/// typically represent spatial position, while the w component may be used for perspective
/// projection or other higher-dimensional calculations.
pub fn create_vector4(x: f32, y: f32, z: f32, w: f32) -> Vector4 {
    let mut out: Vector4 = allocate_entity();
    initialize_vector4(&mut out, x, y, z, w);
    return out;
}

pub fn initialize_vector4(out: &mut Vector4, x: f32, y: f32, z: f32, w: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Adds the x, y, z and w components of two vector objects
/// and writes to out.
pub fn add_vector4(out: &mut Vector4, a: &Vector4, b: &Vector4) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    out.x = ax + bx;
    out.y = ay + by;
    out.z = az + bz;
    out.w = aw + bw;
}

/// Clamps each component of a Vector4 independently to [min, max].
///
/// Safe when `out` aliases `value`, `min`, or `max`.
pub fn clamp_vector4(out: &mut Vector4, value: &Vector4, min: &Vector4, max: &Vector4) {
    let vx = value.x;
    let vy = value.y;
    let vz = value.z;
    let vw = value.w;
    let min_x = min.x;
    let min_y = min.y;
    let min_z = min.z;
    let min_w = min.w;
    let max_x = max.x;
    let max_y = max.y;
    let max_z = max.z;
    let max_w = max.w;
    out.x = if vx < min_x {
        min_x
    } else if vx > max_x {
        max_x
    } else {
        vx
    };
    out.y = if vy < min_y {
        min_y
    } else if vy > max_y {
        max_y
    } else {
        vy
    };
    out.z = if vz < min_z {
        min_z
    } else if vz > max_z {
        max_z
    } else {
        vz
    };
    out.w = if vw < min_w {
        min_w
    } else if vw > max_w {
        max_w
    } else {
        vw
    };
}

pub fn clone_vector4(source: &Vector4) -> Vector4 {
    return create_vector4(source.x, source.y, source.z, source.w);
}

/// Copies the x, y, z and w components of another vector.
pub fn copy_vector4(out: &mut Vector4, source: &Vector4) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Component-wise division of two vectors (Hadamard division). Each component of
/// `source` is divided by the corresponding component of `divisor`. Components with a
/// zero divisor produce `0` in the output.
///
/// Safe when `out` aliases `source` or `divisor`.
pub fn divide_vector4(out: &mut Vector4, source: &Vector4, divisor: &Vector4) {
    let sx = source.x;
    let sy = source.y;
    let sz = source.z;
    let sw = source.w;
    let dx = divisor.x;
    let dy = divisor.y;
    let dz = divisor.z;
    let dw = divisor.w;
    out.x = if dx != 0.0 { sx / dx } else { 0.0 };
    out.y = if dy != 0.0 { sy / dy } else { 0.0 };
    out.z = if dz != 0.0 { sz / dz } else { 0.0 };
    out.w = if dw != 0.0 { sw / dw } else { 0.0 };
}

pub fn equals_vector4(a: Option<&Vector4>, b: Option<&Vector4>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}

/// Returns the angle in radians between two vectors. The returned angle is the
/// smallest radian the first Vector4 object rotates until it aligns with the
/// second Vector4 object.
pub fn get_vector4_angle_between(a: &Vector4, b: &Vector4) -> f32 {
    let la = get_vector4_length(a);
    let lb = get_vector4_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector4_dot(a, b) / (la * lb);
    return dot.clamp(-1.0, 1.0).acos();
}

/// Returns the distance between two Vector4 objects.
pub fn get_vector4_distance(a: &Vector4, b: &Vector4) -> f32 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dz = b.z - a.z;
    let dw = b.w - a.w;
    return (dx * dx + dy * dy + dz * dz + dw * dw).sqrt();
}

/// Returns the distance (squared) between two Vector4 objects.
///
/// This avoids sqrt for better performance.
pub fn get_vector4_distance_squared(a: &Vector4, b: &Vector4) -> f32 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dz = b.z - a.z;
    let dw = b.w - a.w;
    return dx * dx + dy * dy + dz * dz + dw * dw;
}

/// If the current Vector4 object and the one specified as the parameter are unit
/// vertices, this method returns the cosine of the angle between the two vertices.
/// Unit vertices are vertices that point to the same direction but their length is
/// one. They remove the length of the vector as a factor in the result. You can use
/// the `normalize()` method to convert a vector to a unit vector.
pub fn get_vector4_dot(a: &Vector4, b: &Vector4) -> f32 {
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/// The length, magnitude, of the current Vector4 object from the origin (0,0,0,0) to
/// the object's x, y, z and w coordinates. A unit vector has
/// a length or magnitude of one.
pub fn get_vector4_length(source: &Vector4) -> f32 {
    return (source.x * source.x + source.y * source.y + source.z * source.z + source.w * source.w)
        .sqrt();
}

/// The square of the length of the current Vector4 object, calculated using the `x`,
/// `y`, `z`, and `w` properties. Use the `length_squared()`
/// method whenever possible instead of the slower `sqrt()` method call of the
/// `get_vector4_length()` function.
pub fn get_vector4_length_squared(source: &Vector4) -> f32 {
    return source.x * source.x + source.y * source.y + source.z * source.z + source.w * source.w;
}

/// Linear interpolation between two Vector4 objects at parameter `t` in [0, 1].
/// `t=0` returns `a`; `t=1` returns `b`.
///
/// Safe when `out` aliases `a` or `b` (all inputs are read into locals first).
pub fn interpolate_vector4(out: &mut Vector4, a: &Vector4, b: &Vector4, t: f32) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    out.x = ax + t * (bx - ax);
    out.y = ay + t * (by - ay);
    out.z = az + t * (bz - az);
    out.w = aw + t * (bw - aw);
}

/// Writes the per-component maximum of two vectors.
///
/// Safe when `out` aliases `a` or `b`.
pub fn max_vector4(out: &mut Vector4, a: &Vector4, b: &Vector4) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    out.x = if ax > bx { ax } else { bx };
    out.y = if ay > by { ay } else { by };
    out.z = if az > bz { az } else { bz };
    out.w = if aw > bw { aw } else { bw };
}

/// Writes the per-component minimum of two vectors.
///
/// Safe when `out` aliases `a` or `b`.
pub fn min_vector4(out: &mut Vector4, a: &Vector4, b: &Vector4) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    out.x = if ax < bx { ax } else { bx };
    out.y = if ay < by { ay } else { by };
    out.z = if az < bz { az } else { bz };
    out.w = if aw < bw { aw } else { bw };
}

/// Component-wise product of two vectors (Hadamard product).
///
/// Safe when `out` aliases `a` or `b`.
pub fn multiply_vector4(out: &mut Vector4, a: &Vector4, b: &Vector4) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let aw = a.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    out.x = ax * bx;
    out.y = ay * by;
    out.z = az * bz;
    out.w = aw * bw;
}

/// Compares the elements of the current Vector4 object with the elements of a
/// specified Vector4 object to determine whether they are nearly equal.
///
/// The two Vector4 objects are nearly equal if the value of all the elements of the two
/// vertices are equal, or the result of the comparison is within the tolerance range.
pub fn near_equals_vector4(a: &Vector4, b: &Vector4, tolerance: f32) -> bool {
    return (a.x - b.x).abs() < tolerance
        && (a.y - b.y).abs() < tolerance
        && (a.z - b.z).abs() < tolerance
        && (a.w - b.w).abs() < tolerance;
}

/// Sets the current Vector4 object to its inverse. The inverse object is also
/// considered the opposite of the original object. The value of the `x`, `y`, `z`,
/// and `w` properties of the current Vector4 object is changed to -x, -y, -z, and -w.
pub fn negate_vector4(out: &mut Vector4, source: &Vector4) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x * -1.0;
    out.y = y * -1.0;
    out.z = z * -1.0;
    out.w = w * -1.0;
}

/// Converts a Vector4 object to a unit vector by dividing all elements
/// (x, y, z and w) by the length of the vector.
///
/// Returns the original length.
pub fn normalize_vector4(out: &mut Vector4, source: &Vector4) -> f32 {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    let l = (x * x + y * y + z * z + w * w).sqrt();
    if l != 0.0 {
        out.x = x / l;
        out.y = y / l;
        out.z = z / l;
        out.w = w / l;
    } else {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        out.w = 0.0;
    }
    return l;
}

/// Offsets each component of the current Vector4 object by a scalar per axis.
pub fn offset_vector4(out: &mut Vector4, source: &Vector4, dx: f32, dy: f32, dz: f32, dw: f32) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x + dx;
    out.y = y + dy;
    out.z = z + dz;
    out.w = w + dw;
}

/// Divides the value of the `x`, `y`, and `z` properties of the current Vector4
/// object by the value of its `w` property, projecting to 3D.
pub fn project_vector4(out: &mut Vector3, source: &Vector4) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x / w;
    out.y = y / w;
    out.z = z / w;
}

/// Reflects an incident vector about a unit normal. The result is the reflection of
/// `incident` across the hyperplane whose normal is `normal`.
///
/// Formula: out = incident - 2 * dot(incident, normal) * normal
///
/// Safe when `out` aliases `incident` or `normal`.
pub fn reflect_vector4(out: &mut Vector4, incident: &Vector4, normal: &Vector4) {
    let ix = incident.x;
    let iy = incident.y;
    let iz = incident.z;
    let iw = incident.w;
    let nx = normal.x;
    let ny = normal.y;
    let nz = normal.z;
    let nw = normal.w;
    let two_dot = 2.0 * (ix * nx + iy * ny + iz * nz + iw * nw);
    out.x = ix - two_dot * nx;
    out.y = iy - two_dot * ny;
    out.z = iz - two_dot * nz;
    out.w = iw - two_dot * nw;
}

/// Scales the current Vector4 object by a scalar, a magnitude. The Vector4 object's
/// x, y, z and w elements are multiplied by the provided scalar number.
pub fn scale_vector4(out: &mut Vector4, source: &Vector4, scalar: f32) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let w = source.w;
    out.x = x * scalar;
    out.y = y * scalar;
    out.z = z * scalar;
    out.w = w * scalar;
}

/// Sets the members of Vector4 to the specified values.
pub fn set_vector4(out: &mut Vector4, x: f32, y: f32, z: f32, w: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Reads a Vector4 from a float slice at an element offset.
pub fn set_vector4_from_float32_array(out: &mut Vector4, offset: usize, source: &Float32Array) {
    out.x = source[offset];
    out.y = source[offset + 1];
    out.z = source[offset + 2];
    out.w = source[offset + 3];
}

/// Copies the x, y, and z components of a Vector3 into a Vector4, setting w to the
/// given value. Use `w = 1.0` for a position, `w = 0.0` for a direction.
///
/// Safe when `out` aliases any part of `source`.
pub fn set_vector4_from_vector3(out: &mut Vector4, source: &Vector3, w: f32) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x;
    out.y = y;
    out.z = z;
    out.w = w;
}

/// Subtracts the value of the x, y, z and w elements of the current Vector4 object
/// from the values of the x, y, z and w elements of another Vector4 object.
pub fn subtract_vector4(out: &mut Vector4, source: &Vector4, other: &Vector4) {
    let sx = source.x;
    let sy = source.y;
    let sz = source.z;
    let sw = source.w;
    let ox = other.x;
    let oy = other.y;
    let oz = other.z;
    let ow = other.w;
    out.x = sx - ox;
    out.y = sy - oy;
    out.z = sz - oz;
    out.w = sw - ow;
}

/// Writes a Vector4 into a float slice at an element offset.
pub fn write_vector4_to_float32_array(out: &mut [f32], offset: usize, source: &Vector4) {
    out[offset] = source.x;
    out[offset + 1] = source.y;
    out[offset + 2] = source.z;
    out[offset + 3] = source.w;
}

impl Vector4 {
    pub fn new(x: f32, y: f32, z: f32, w: f32) -> Self {
        return create_vector4(x, y, z, w);
    }

    pub fn add(&self, other: &Self) -> Self {
        let mut out = Self::default();
        add_vector4(&mut out, self, other);
        return out;
    }

    pub fn angle_between(&self, other: &Self) -> f32 {
        return get_vector4_angle_between(self, other);
    }

    pub fn clamp(&self, min: &Self, max: &Self) -> Self {
        let mut out = Self::default();
        clamp_vector4(&mut out, self, min, max);
        return out;
    }

    pub fn distance(&self, other: &Self) -> f32 {
        return get_vector4_distance(self, other);
    }

    pub fn distance_squared(&self, other: &Self) -> f32 {
        return get_vector4_distance_squared(self, other);
    }

    pub fn divide(&self, divisor: &Self) -> Self {
        let mut out = Self::default();
        divide_vector4(&mut out, self, divisor);
        return out;
    }

    pub fn dot(&self, other: &Self) -> f32 {
        return get_vector4_dot(self, other);
    }

    pub fn interpolate(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        interpolate_vector4(&mut out, self, other, t);
        return out;
    }

    pub fn length(&self) -> f32 {
        return get_vector4_length(self);
    }

    pub fn length_squared(&self) -> f32 {
        return get_vector4_length_squared(self);
    }

    pub fn max(&self, other: &Self) -> Self {
        let mut out = Self::default();
        max_vector4(&mut out, self, other);
        return out;
    }

    pub fn min(&self, other: &Self) -> Self {
        let mut out = Self::default();
        min_vector4(&mut out, self, other);
        return out;
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_vector4(&mut out, self, other);
        return out;
    }

    pub fn near_equals(&self, other: &Self, tolerance: f32) -> bool {
        return near_equals_vector4(self, other, tolerance);
    }

    pub fn negated(&self) -> Self {
        let mut out = Self::default();
        negate_vector4(&mut out, self);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_vector4(&mut out, self);
        return out;
    }

    pub fn offset(&self, dx: f32, dy: f32, dz: f32, dw: f32) -> Self {
        let mut out = Self::default();
        offset_vector4(&mut out, self, dx, dy, dz, dw);
        return out;
    }

    pub fn projected(&self) -> Vector3 {
        let mut out = Vector3::default();
        project_vector4(&mut out, self);
        return out;
    }

    pub fn reflected(&self, normal: &Self) -> Self {
        let mut out = Self::default();
        reflect_vector4(&mut out, self, normal);
        return out;
    }

    pub fn scaled(&self, scalar: f32) -> Self {
        let mut out = Self::default();
        scale_vector4(&mut out, self, scalar);
        return out;
    }

    pub fn subtracted(&self, other: &Self) -> Self {
        let mut out = Self::default();
        subtract_vector4(&mut out, self, other);
        return out;
    }
}

pub static VECTOR4_W_UNIT: LazyLock<Vector4> = LazyLock::new(|| create_vector4(0.0, 0.0, 0.0, 1.0));
pub static VECTOR4_X_AXIS: LazyLock<Vector4> = LazyLock::new(|| create_vector4(1.0, 0.0, 0.0, 0.0));
pub static VECTOR4_Y_AXIS: LazyLock<Vector4> = LazyLock::new(|| create_vector4(0.0, 1.0, 0.0, 0.0));
pub static VECTOR4_Z_AXIS: LazyLock<Vector4> = LazyLock::new(|| create_vector4(0.0, 0.0, 1.0, 0.0));

flight_entity::impl_entity!(Vector4);
