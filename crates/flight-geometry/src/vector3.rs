use flight_entity::{EntityRuntimeSlot, Float32Array, allocate_entity};
use std::sync::LazyLock;
use crate::Matrix3;
use crate::Vector2;
use crate::Vector4;

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Vector3 {
    runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// The Vector3 class represents a point or a location in the three-dimensional space using
/// the Cartesian coordinates x, y, and z.
pub fn create_vector3(x: f32, y: f32, z: f32) -> Vector3 {
    let mut out: Vector3 = allocate_entity();
    initialize_vector3(&mut out, x, y, z);
    return out;
}

/// Creates a Vector3 from spherical coordinates (physics convention: radius, inclination theta from
/// +Y axis, azimuth phi from +X axis in the XZ plane).
///
/// - `theta` is the polar angle measured from the +Y axis (0 = north pole, PI = south pole).
/// - `phi` is the azimuthal angle measured from the +X axis in the XZ plane.
pub fn create_vector3_from_spherical(radius: f32, theta: f32, phi: f32) -> Vector3 {
    let mut out = create_vector3(0.0, 0.0, 0.0);
    set_vector3_from_spherical(&mut out, radius, theta, phi);
    return out;
}

pub fn initialize_vector3(out: &mut Vector3, x: f32, y: f32, z: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Adds the x, y and z components of two vector objects
/// and writes to out.
pub fn add_vector3(out: &mut Vector3, a: &Vector3, b: &Vector3) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    out.x = ax + bx;
    out.y = ay + by;
    out.z = az + bz;
}

/// Clamps each component of a Vector3 independently to [min, max].
///
/// Safe when `out` aliases `value`, `min`, or `max`.
pub fn clamp_vector3(out: &mut Vector3, value: &Vector3, min: &Vector3, max: &Vector3) {
    let vx = value.x;
    let vy = value.y;
    let vz = value.z;
    let min_x = min.x;
    let min_y = min.y;
    let min_z = min.z;
    let max_x = max.x;
    let max_y = max.y;
    let max_z = max.z;
    out.x = if vx < min_x { min_x } else if vx > max_x { max_x } else { vx };
    out.y = if vy < min_y { min_y } else if vy > max_y { max_y } else { vy };
    out.z = if vz < min_z { min_z } else if vz > max_z { max_z } else { vz };
}

pub fn clone_vector3(source: &Vector3) -> Vector3 {
    return create_vector3(source.x, source.y, source.z);
}

/// Copies the x, y and z components of a vector.
pub fn copy_vector3(out: &mut Vector3, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Writes a Vector3 object that is perpendicular (at a right angle) to the
/// current Vector3 and another Vector3 object. If the returned Vector3 object's
/// coordinates are (0,0,0), then the two Vector3 objects are parallel to each other.
pub fn cross_vector3(out: &mut Vector3, source: &Vector3, other: &Vector3) {
    let x = source.y * other.z - source.z * other.y;
    let y = source.z * other.x - source.x * other.z;
    let z = source.x * other.y - source.y * other.x;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Component-wise division of two vectors (Hadamard division). Each component of
/// `source` is divided by the corresponding component of `divisor`. Components with a
/// zero divisor produce `0` in the output.
///
/// Safe when `out` aliases `source` or `divisor`.
pub fn divide_vector3(out: &mut Vector3, source: &Vector3, divisor: &Vector3) {
    let sx = source.x;
    let sy = source.y;
    let sz = source.z;
    let dx = divisor.x;
    let dy = divisor.y;
    let dz = divisor.z;
    out.x = if dx != 0.0 { sx / dx } else { 0.0 };
    out.y = if dy != 0.0 { sy / dy } else { 0.0 };
    out.z = if dz != 0.0 { sz / dz } else { 0.0 };
}

pub fn equals_vector3(a: Option<&Vector3>, b: Option<&Vector3>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}

/// Returns the angle in radians between two vectors. The returned angle is the
/// smallest radian the first Vector3 object rotates until it aligns with the
/// second Vector3 object.
pub fn get_vector3_angle_between(a: &Vector3, b: &Vector3) -> f32 {
    let la = get_vector3_length(a);
    let lb = get_vector3_length(b);
    if la == 0.0 || lb == 0.0 {
        return f32::NAN;
    }
    let dot = get_vector3_dot(a, b) / (la * lb);
    return dot.clamp(-1.0, 1.0).acos();
}

/// Returns the distance between two Vector3 objects.
pub fn get_vector3_distance(a: &Vector3, b: &Vector3) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    return (x * x + y * y + z * z).sqrt();
}

/// Returns the distance (squared) between two Vector3 objects.
///
/// This avoids sqrt for better performance.
pub fn get_vector3_distance_squared(a: &Vector3, b: &Vector3) -> f32 {
    let x = b.x - a.x;
    let y = b.y - a.y;
    let z = b.z - a.z;
    return x * x + y * y + z * z;
}

/// If the current Vector3 object and the one specified as the parameter are unit
/// vertices, this method returns the cosine of the angle between the two vertices.
/// Unit vertices are vertices that point to the same direction but their length is
/// one. They remove the length of the vector as a factor in the result. You can use
/// the `normalize()` method to convert a vector to a unit vector.
pub fn get_vector3_dot(a: &Vector3, b: &Vector3) -> f32 {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

/// The length, magnitude, of the current Vector3 object from the origin (0,0,0) to
/// the object's x, y, and z coordinates. A unit vector has a length or magnitude of one.
pub fn get_vector3_length(source: &Vector3) -> f32 {
    return (source.x * source.x + source.y * source.y + source.z * source.z).sqrt();
}

/// The square of the length of the current Vector3 object, calculated using the `x`,
/// `y`, and `z` properties.
pub fn get_vector3_length_squared(source: &Vector3) -> f32 {
    return source.x * source.x + source.y * source.y + source.z * source.z;
}

/// Reads the spherical coordinates (radius, theta, phi) from a Vector3. Uses the same
/// convention as `set_vector3_from_spherical` / `create_vector3_from_spherical`:
/// - `theta` is the polar angle from the +Y axis (0 = north pole, PI = south pole).
/// - `phi` is the azimuthal angle from the +X axis in the XZ plane.
///
/// Writes to `out` as (x=radius, y=theta, z=phi).
pub fn get_vector3_spherical(out: &mut Vector3, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let radius = (x * x + y * y + z * z).sqrt();
    if radius == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
        return;
    }
    out.x = radius;
    out.y = (y / radius).clamp(-1.0, 1.0).acos();
    out.z = z.atan2(x);
}

/// Linear interpolation between two Vector3 objects at parameter `t` in [0, 1].
/// `t=0` returns `a`; `t=1` returns `b`.
///
/// Safe when `out` aliases `a` or `b` (all inputs are read into locals first).
pub fn interpolate_vector3(out: &mut Vector3, a: &Vector3, b: &Vector3, t: f32) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    out.x = ax + t * (bx - ax);
    out.y = ay + t * (by - ay);
    out.z = az + t * (bz - az);
}

/// Writes the per-component maximum of two vectors.
///
/// Safe when `out` aliases `a` or `b`.
pub fn max_vector3(out: &mut Vector3, a: &Vector3, b: &Vector3) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    out.x = if ax > bx { ax } else { bx };
    out.y = if ay > by { ay } else { by };
    out.z = if az > bz { az } else { bz };
}

/// Writes the per-component minimum of two vectors.
///
/// Safe when `out` aliases `a` or `b`.
pub fn min_vector3(out: &mut Vector3, a: &Vector3, b: &Vector3) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    out.x = if ax < bx { ax } else { bx };
    out.y = if ay < by { ay } else { by };
    out.z = if az < bz { az } else { bz };
}

/// Component-wise product of two vectors (Hadamard product).
///
/// Safe when `out` aliases `a` or `b`.
pub fn multiply_vector3(out: &mut Vector3, a: &Vector3, b: &Vector3) {
    let ax = a.x;
    let ay = a.y;
    let az = a.z;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    out.x = ax * bx;
    out.y = ay * by;
    out.z = az * bz;
}

/// Compares the elements of the current Vector3 object with the elements of a
/// specified Vector3 object to determine whether they are nearly equal.
///
/// The two Vector3 objects are nearly equal if the value of all the elements of the two
/// vertices are equal, or the result of the comparison is within the tolerance range.
pub fn near_equals_vector3(a: &Vector3, b: &Vector3, tolerance: f32) -> bool {
    return (a.x - b.x).abs() < tolerance
        && (a.y - b.y).abs() < tolerance
        && (a.z - b.z).abs() < tolerance;
}

/// Sets the current Vector3 object to its inverse. The inverse object is also
/// considered the opposite of the original object. The value of the `x`, `y`, and `z`
/// properties of the current Vector3 object is changed to -x, -y, and -z.
pub fn negate_vector3(out: &mut Vector3, source: &Vector3) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x * -1.0;
    out.y = y * -1.0;
    out.z = z * -1.0;
}

/// Converts a Vector3 object to a unit vector by dividing the first three elements
/// (x, y, z) by the length of the vector.
///
/// Returns the original length.
pub fn normalize_vector3(out: &mut Vector3, source: &Vector3) -> f32 {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    let l = (x * x + y * y + z * z).sqrt();
    if l != 0.0 {
        out.x = x / l;
        out.y = y / l;
        out.z = z / l;
    } else {
        out.x = 0.0;
        out.y = 0.0;
        out.z = 0.0;
    }
    return l;
}

/// Offsets each component of the current Vector3 object by a scalar per axis.
pub fn offset_vector3(out: &mut Vector3, source: &Vector3, dx: f32, dy: f32, dz: f32) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x + dx;
    out.y = y + dy;
    out.z = z + dz;
}

/// Divides the value of the `x` and `y` properties of the current Vector3
/// object by the value of its `z` property.
pub fn project_vector3(out: &mut Vector2, source: &Vector3) {
    out.x = source.x / source.z;
    out.y = source.y / source.z;
}

/// Reflects an incident vector about a unit normal. The result is the reflection of
/// `incident` across the plane whose normal is `normal`.
///
/// Formula: out = incident - 2 * dot(incident, normal) * normal
///
/// Safe when `out` aliases `incident` or `normal`.
pub fn reflect_vector3(out: &mut Vector3, incident: &Vector3, normal: &Vector3) {
    let ix = incident.x;
    let iy = incident.y;
    let iz = incident.z;
    let nx = normal.x;
    let ny = normal.y;
    let nz = normal.z;
    let two_dot = 2.0 * (ix * nx + iy * ny + iz * nz);
    out.x = ix - two_dot * nx;
    out.y = iy - two_dot * ny;
    out.z = iz - two_dot * nz;
}

/// Scales the current Vector3 object by a scalar, a magnitude. The Vector3 object's
/// x, y, and z elements are multiplied by the provided scalar number.
pub fn scale_vector3(out: &mut Vector3, source: &Vector3, scalar: f32) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x * scalar;
    out.y = y * scalar;
    out.z = z * scalar;
}

/// Sets the members of Vector3 to the specified values.
pub fn set_vector3(out: &mut Vector3, x: f32, y: f32, z: f32) {
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Reads a Vector3 from a float32 array at an element offset.
pub fn set_vector3_from_float32_array(out: &mut Vector3, offset: usize, source: &Float32Array) {
    out.x = source[offset];
    out.y = source[offset + 1];
    out.z = source[offset + 2];
}

/// Writes a Vector3 into spherical coordinates.
/// Uses the physics convention: theta is polar angle from +Y, phi is azimuthal from +X in XZ.
pub fn set_vector3_from_spherical(out: &mut Vector3, radius: f32, theta: f32, phi: f32) {
    let sin_theta = theta.sin();
    out.x = radius * sin_theta * phi.cos();
    out.y = radius * theta.cos();
    out.z = radius * sin_theta * phi.sin();
}

/// Copies the x, y, and z components of a Vector4 into a Vector3, dropping the w component.
/// For perspective-correct results (when w != 1) use project_vector4 instead, which performs the
/// perspective divide.
///
/// Safe when `out` aliases the same memory as `source`.
pub fn set_vector3_from_vector4(out: &mut Vector3, source: &Vector4) {
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Subtracts the value of the x, y, and z elements of the current Vector3 object
/// from the values of the x, y, and z elements of another Vector3 object.
pub fn subtract_vector3(out: &mut Vector3, source: &Vector3, other: &Vector3) {
    let sx = source.x;
    let sy = source.y;
    let sz = source.z;
    let ox = other.x;
    let oy = other.y;
    let oz = other.z;
    out.x = sx - ox;
    out.y = sy - oy;
    out.z = sz - oz;
}

/// Transforms a Vector3 by a Matrix3 (column-major storage). Useful for transforming normals by a
/// normal matrix.
///
/// Safe when `out` aliases `source`.
pub fn transform_vector3_by_matrix3(out: &mut Vector3, source: &Vector3, matrix: &Matrix3) {
    let m = &matrix.m;
    let x = source.x;
    let y = source.y;
    let z = source.z;
    out.x = m[0] * x + m[3] * y + m[6] * z;
    out.y = m[1] * x + m[4] * y + m[7] * z;
    out.z = m[2] * x + m[5] * y + m[8] * z;
}

/// Writes a Vector3 into a float32 array at an element offset.
pub fn write_vector3_to_float32_array(out: &mut [f32], offset: usize, source: &Vector3) {
    out[offset] = source.x;
    out[offset + 1] = source.y;
    out[offset + 2] = source.z;
}

impl Vector3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        return create_vector3(x, y, z);
    }

    pub fn add(&self, other: &Self) -> Self {
        let mut out = Self::default();
        add_vector3(&mut out, self, other);
        return out;
    }

    pub fn angle_between(&self, other: &Self) -> f32 {
        return get_vector3_angle_between(self, other);
    }

    pub fn clamp(&self, min: &Self, max: &Self) -> Self {
        let mut out = Self::default();
        clamp_vector3(&mut out, self, min, max);
        return out;
    }

    pub fn cross(&self, other: &Self) -> Self {
        let mut out = Self::default();
        cross_vector3(&mut out, self, other);
        return out;
    }

    pub fn distance(&self, other: &Self) -> f32 {
        return get_vector3_distance(self, other);
    }

    pub fn distance_squared(&self, other: &Self) -> f32 {
        return get_vector3_distance_squared(self, other);
    }

    pub fn divide(&self, divisor: &Self) -> Self {
        let mut out = Self::default();
        divide_vector3(&mut out, self, divisor);
        return out;
    }

    pub fn dot(&self, other: &Self) -> f32 {
        return get_vector3_dot(self, other);
    }

    pub fn from_spherical(radius: f32, theta: f32, phi: f32) -> Self {
        return create_vector3_from_spherical(radius, theta, phi);
    }

    pub fn interpolate(&self, other: &Self, t: f32) -> Self {
        let mut out = Self::default();
        interpolate_vector3(&mut out, self, other, t);
        return out;
    }

    pub fn length(&self) -> f32 {
        return get_vector3_length(self);
    }

    pub fn length_squared(&self) -> f32 {
        return get_vector3_length_squared(self);
    }

    pub fn max(&self, other: &Self) -> Self {
        let mut out = Self::default();
        max_vector3(&mut out, self, other);
        return out;
    }

    pub fn min(&self, other: &Self) -> Self {
        let mut out = Self::default();
        min_vector3(&mut out, self, other);
        return out;
    }

    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = Self::default();
        multiply_vector3(&mut out, self, other);
        return out;
    }

    pub fn near_equals(&self, other: &Self, tolerance: f32) -> bool {
        return near_equals_vector3(self, other, tolerance);
    }

    pub fn negated(&self) -> Self {
        let mut out = Self::default();
        negate_vector3(&mut out, self);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_vector3(&mut out, self);
        return out;
    }

    pub fn offset(&self, dx: f32, dy: f32, dz: f32) -> Self {
        let mut out = Self::default();
        offset_vector3(&mut out, self, dx, dy, dz);
        return out;
    }

    pub fn reflected(&self, normal: &Self) -> Self {
        let mut out = Self::default();
        reflect_vector3(&mut out, self, normal);
        return out;
    }

    pub fn scaled(&self, scalar: f32) -> Self {
        let mut out = Self::default();
        scale_vector3(&mut out, self, scalar);
        return out;
    }

    pub fn subtracted(&self, other: &Self) -> Self {
        let mut out = Self::default();
        subtract_vector3(&mut out, self, other);
        return out;
    }
}

pub static VECTOR3_X_AXIS: LazyLock<Vector3> = LazyLock::new(|| create_vector3(1.0, 0.0, 0.0));
pub static VECTOR3_Y_AXIS: LazyLock<Vector3> = LazyLock::new(|| create_vector3(0.0, 1.0, 0.0));
pub static VECTOR3_Z_AXIS: LazyLock<Vector3> = LazyLock::new(|| create_vector3(0.0, 0.0, 1.0));

flight_entity::impl_entity!(Vector3);
