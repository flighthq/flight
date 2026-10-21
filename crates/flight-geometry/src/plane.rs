use crate::Vector3;
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Plane {
    pub runtime: EntityRuntimeSlot,
    pub a: f32,
    pub b: f32,
    pub c: f32,
    pub d: f32,
}

/// Creates a plane in the form a*x + b*y + c*z + d = 0, where (a, b, c) is the plane normal
/// and d is the signed distance from the origin along that normal.
pub fn create_plane(a: f32, b: f32, c: f32, d: f32) -> Plane {
    let mut out: Plane = allocate_entity();
    initialize_plane(&mut out, a, b, c, d);
    return out;
}

pub fn initialize_plane(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
}

pub fn clone_plane(source: &Plane) -> Plane {
    return create_plane(source.a, source.b, source.c, source.d);
}

/// Copies the coefficients of a plane (a, b, c, d).
///
/// Safe when `out` aliases `source`.
pub fn copy_plane(out: &mut Plane, source: &Plane) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
}

/// Writes the point on a plane closest to `point` -- `point` projected onto the plane along its
/// normal. Requires the plane normal (a, b, c) to be unit length.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_plane(out: &mut Vector3, plane: &Plane, point: &Vector3) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
    out.x = px - dist * plane.a;
    out.y = py - dist * plane.b;
    out.z = pz - dist * plane.c;
}

/// Writes the coplanar point on the plane closest to the origin.
/// Requires the plane normal (a, b, c) to be unit length.
pub fn get_plane_coplanar_point(out: &mut Vector3, plane: &Plane) {
    out.x = -plane.a * plane.d;
    out.y = -plane.b * plane.d;
    out.z = -plane.c * plane.d;
}

/// Returns the signed distance from a point to a plane. Positive is the side the normal points
/// toward; assumes the plane normal (a, b, c) is unit length.
pub fn get_plane_signed_distance_to_point(plane: &Plane, point: &Vector3) -> f32 {
    return plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d;
}

/// Normalizes a plane so its normal (a, b, c) has unit length. The `d` coefficient is scaled
/// proportionally. A degenerate plane (zero-length normal) is written as-is.
///
/// Safe when `out` aliases `source`.
pub fn normalize_plane(out: &mut Plane, source: &Plane) {
    let a = source.a;
    let b = source.b;
    let c = source.c;
    let d = source.d;
    let len = (a * a + b * b + c * c).sqrt();
    if len == 0.0 {
        out.a = a;
        out.b = b;
        out.c = c;
        out.d = d;
        return;
    }
    let inv = 1.0 / len;
    out.a = a * inv;
    out.b = b * inv;
    out.c = c * inv;
    out.d = d * inv;
}

/// Projects a point onto the plane, writing the closest point on the plane to `out`.
/// Requires the plane normal (a, b, c) to be unit length.
///
/// Safe when `out` aliases `point`.
pub fn project_vector3_onto_plane(out: &mut Vector3, point: &Vector3, plane: &Plane) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let dist = plane.a * px + plane.b * py + plane.c * pz + plane.d;
    out.x = px - dist * plane.a;
    out.y = py - dist * plane.b;
    out.z = pz - dist * plane.c;
}

/// Sets the coefficients of a plane (a, b, c, d).
pub fn set_plane(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    out.a = a;
    out.b = b;
    out.c = c;
    out.d = d;
}

/// Builds a plane from a unit normal and a point that lies on the plane.
pub fn set_plane_from_normal_and_point(out: &mut Plane, normal: &Vector3, point: &Vector3) {
    out.a = normal.x;
    out.b = normal.y;
    out.c = normal.z;
    out.d = -(normal.x * point.x + normal.y * point.y + normal.z * point.z);
}

/// Builds a plane from three non-collinear points. The normal direction follows the
/// right-hand rule: counter-clockwise winding when viewed from the positive-normal side.
///
/// If the points are collinear (degenerate triangle), the plane normal will be zero.
pub fn set_plane_from_points(out: &mut Plane, a: &Vector3, b: &Vector3, c: &Vector3) {
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e1z = b.z - a.z;
    let e2x = c.x - a.x;
    let e2y = c.y - a.y;
    let e2z = c.z - a.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    let len = (nx * nx + ny * ny + nz * nz).sqrt();
    if len == 0.0 {
        out.a = nx;
        out.b = ny;
        out.c = nz;
        out.d = 0.0;
        return;
    }
    let inv = 1.0 / len;
    out.a = nx * inv;
    out.b = ny * inv;
    out.c = nz * inv;
    out.d = -(out.a * a.x + out.b * a.y + out.c * a.z);
}

impl Plane {
    pub fn new(a: f32, b: f32, c: f32, d: f32) -> Self {
        return create_plane(a, b, c, d);
    }

    pub fn closest_point(&self, point: &Vector3) -> Vector3 {
        let mut out = Vector3::default();
        get_closest_point_on_plane(&mut out, self, point);
        return out;
    }

    pub fn coplanar_point(&self) -> Vector3 {
        let mut out = Vector3::default();
        get_plane_coplanar_point(&mut out, self);
        return out;
    }

    pub fn from_normal_and_point(normal: &Vector3, point: &Vector3) -> Self {
        let mut out = Self::default();
        set_plane_from_normal_and_point(&mut out, normal, point);
        return out;
    }

    pub fn from_points(a: &Vector3, b: &Vector3, c: &Vector3) -> Self {
        let mut out = Self::default();
        set_plane_from_points(&mut out, a, b, c);
        return out;
    }

    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_plane(&mut out, self);
        return out;
    }

    pub fn signed_distance_to_point(&self, point: &Vector3) -> f32 {
        return get_plane_signed_distance_to_point(self, point);
    }
}
