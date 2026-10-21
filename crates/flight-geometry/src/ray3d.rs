use crate::{Aabb, BoundingSphere, Matrix4, Plane, Vector3};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq)]
pub struct Ray3D {
    runtime: EntityRuntimeSlot,
    pub origin: Vector3,
    pub direction: Vector3,
}

pub fn create_ray3d(
    origin_x: f32, origin_y: f32, origin_z: f32,
    direction_x: f32, direction_y: f32, direction_z: f32,
) -> Ray3D {
    let mut out: Ray3D = allocate_entity();
    initialize_ray3d(&mut out, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z);
    return out;
}

pub fn initialize_ray3d(
    out: &mut Ray3D,
    origin_x: f32, origin_y: f32, origin_z: f32,
    direction_x: f32, direction_y: f32, direction_z: f32,
) {
    out.origin.x = origin_x;
    out.origin.y = origin_y;
    out.origin.z = origin_z;
    out.direction.x = direction_x;
    out.direction.y = direction_y;
    out.direction.z = direction_z;
}

/// Writes the closest pair of points between two rays.
///
/// Safe when `out_a`/`out_b` alias ray vectors (reads all inputs before writing).
pub fn get_closest_point_between_ray3ds(
    out_a: &mut Vector3, out_b: &mut Vector3,
    a: &Ray3D, b: &Ray3D,
) {
    let aox = a.origin.x;
    let aoy = a.origin.y;
    let aoz = a.origin.z;
    let adx = a.direction.x;
    let ady = a.direction.y;
    let adz = a.direction.z;
    let bo_x = b.origin.x;
    let bo_y = b.origin.y;
    let bo_z = b.origin.z;
    let bdx = b.direction.x;
    let bdy = b.direction.y;
    let bdz = b.direction.z;

    let aa = adx * adx + ady * ady + adz * adz;
    let bb = bdx * bdx + bdy * bdy + bdz * bdz;
    let ab = adx * bdx + ady * bdy + adz * bdz;
    let rx = aox - bo_x;
    let ry = aoy - bo_y;
    let rz = aoz - bo_z;
    let ar = adx * rx + ady * ry + adz * rz;
    let br = bdx * rx + bdy * ry + bdz * rz;

    let denom = aa * bb - ab * ab;
    let mut ta: f32;
    let mut tb: f32;
    if denom != 0.0 {
        ta = (ab * br - bb * ar) / denom;
    } else {
        ta = 0.0;
    }
    if ta < 0.0 { ta = 0.0; }

    tb = if bb != 0.0 { (ab * ta + br) / bb } else { 0.0 };
    if tb < 0.0 {
        tb = 0.0;
        ta = if aa != 0.0 { -ar / aa } else { 0.0 };
        if ta < 0.0 { ta = 0.0; }
    }

    out_a.x = aox + adx * ta;
    out_a.y = aoy + ady * ta;
    out_a.z = aoz + adz * ta;
    out_b.x = bo_x + bdx * tb;
    out_b.y = bo_y + bdy * tb;
    out_b.z = bo_z + bdz * tb;
}

/// Writes the point on a ray closest to `point`.
///
/// Safe when `out` aliases `point` or a ray vector.
pub fn get_closest_point_on_ray3d(out: &mut Vector3, ray: &Ray3D, point: &Vector3) {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;

    let len_sq = dx * dx + dy * dy + dz * dz;
    let mut t = if len_sq != 0.0 { ((px - ox) * dx + (py - oy) * dy + (pz - oz) * dz) / len_sq } else { 0.0 };
    if t < 0.0 { t = 0.0; }

    out.x = ox + dx * t;
    out.y = oy + dy * t;
    out.z = oz + dz * t;
}

/// Returns the point on a ray at parameter `t`: `origin + t * direction`.
///
/// Safe when `out` aliases `ray.origin` or `ray.direction`.
pub fn get_ray3d_point_at(out: &mut Vector3, ray: &Ray3D, t: f32) {
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    out.x = ox + dx * t;
    out.y = oy + dy * t;
    out.z = oz + dz * t;
}

/// Tests whether a ray intersects an axis-aligned bounding box (slab method).
pub fn intersect_ray3d_aabb(ray: &Ray3D, aabb: &Aabb) -> f32 {
    if aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z {
        return -1.0;
    }

    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    if dx * dx + dy * dy + dz * dz == 0.0 { return -1.0; }

    let mut t_min: f32 = 0.0;
    let mut t_max: f32 = f32::INFINITY;

    // X slab
    if dx != 0.0 {
        let inv_dx = 1.0 / dx;
        let mut t1 = (aabb.min.x - ox) * inv_dx;
        let mut t2 = (aabb.max.x - ox) * inv_dx;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if ox < aabb.min.x || ox > aabb.max.x {
        return -1.0;
    }

    // Y slab
    if dy != 0.0 {
        let inv_dy = 1.0 / dy;
        let mut t1 = (aabb.min.y - oy) * inv_dy;
        let mut t2 = (aabb.max.y - oy) * inv_dy;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if oy < aabb.min.y || oy > aabb.max.y {
        return -1.0;
    }

    // Z slab
    if dz != 0.0 {
        let inv_dz = 1.0 / dz;
        let mut t1 = (aabb.min.z - oz) * inv_dz;
        let mut t2 = (aabb.max.z - oz) * inv_dz;
        if t1 > t2 { let tmp = t1; t1 = t2; t2 = tmp; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if oz < aabb.min.z || oz > aabb.max.z {
        return -1.0;
    }

    return t_min;
}

/// Tests whether a ray intersects a plane (ax + by + cz + d = 0).
pub fn intersect_ray3d_plane(ray: &Ray3D, plane: &Plane) -> f32 {
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let normal_length_sq = plane.a * plane.a + plane.b * plane.b + plane.c * plane.c;
    let direction_length_sq = dx * dx + dy * dy + dz * dz;
    if normal_length_sq == 0.0 || direction_length_sq == 0.0 { return -1.0; }

    let denom = plane.a * dx + plane.b * dy + plane.c * dz;
    if denom.abs() <= 1e-10 * normal_length_sq.sqrt() * direction_length_sq.sqrt() { return -1.0; }
    let t = -(plane.a * ray.origin.x + plane.b * ray.origin.y + plane.c * ray.origin.z + plane.d) / denom;
    return if t >= 0.0 { t } else { -1.0 };
}

/// Tests whether a ray intersects a bounding sphere.
pub fn intersect_ray3d_sphere(ray: &Ray3D, sphere: &BoundingSphere) -> f32 {
    if sphere.radius < 0.0 { return -1.0; }
    let ox = ray.origin.x - sphere.center.x;
    let oy = ray.origin.y - sphere.center.y;
    let oz = ray.origin.z - sphere.center.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    let a = dx * dx + dy * dy + dz * dz;
    if a == 0.0 { return -1.0; }
    let b = ox * dx + oy * dy + oz * dz;
    let c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
    let disc = b * b - a * c;
    if disc < 0.0 { return -1.0; }
    let sqrt_disc = disc.sqrt();
    let t = (-b - sqrt_disc) / a;
    if t >= 0.0 { return t; }
    let t2 = (-b + sqrt_disc) / a;
    return if t2 >= 0.0 { 0.0 } else { -1.0 };
}

/// Tests whether a ray intersects a triangle (Moller-Trumbore algorithm, no back-face culling).
pub fn intersect_ray3d_triangle(ray: &Ray3D, a: &Vector3, b: &Vector3, c: &Vector3) -> f32 {
    let e1x = b.x - a.x;
    let e1y = b.y - a.y;
    let e1z = b.z - a.z;
    let e2x = c.x - a.x;
    let e2y = c.y - a.y;
    let e2z = c.z - a.z;

    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    let normal_length_sq = nx * nx + ny * ny + nz * nz;
    let direction_length_sq = dx * dx + dy * dy + dz * dz;
    if normal_length_sq == 0.0 || direction_length_sq == 0.0 { return -1.0; }

    let hx = dy * e2z - dz * e2y;
    let hy = dz * e2x - dx * e2z;
    let hz = dx * e2y - dy * e2x;

    let det = e1x * hx + e1y * hy + e1z * hz;
    if det.abs() <= 1e-10 * normal_length_sq.sqrt() * direction_length_sq.sqrt() { return -1.0; }

    let inv_det = 1.0 / det;

    let sx = ray.origin.x - a.x;
    let sy = ray.origin.y - a.y;
    let sz = ray.origin.z - a.z;

    let u = (sx * hx + sy * hy + sz * hz) * inv_det;
    if u < 0.0 || u > 1.0 { return -1.0; }

    let qx = sy * e1z - sz * e1y;
    let qy = sz * e1x - sx * e1z;
    let qz = sx * e1y - sy * e1x;

    let v = (dx * qx + dy * qy + dz * qz) * inv_det;
    if v < 0.0 || u + v > 1.0 { return -1.0; }

    let t = (e2x * qx + e2y * qy + e2z * qz) * inv_det;
    return if t >= 0.0 { t } else { -1.0 };
}

/// Writes origin and direction into an existing Ray3D in place.
///
/// Safe when `out` aliases an input vector.
pub fn set_ray3d(out: &mut Ray3D, origin: &Vector3, direction: &Vector3) {
    let ox = origin.x;
    let oy = origin.y;
    let oz = origin.z;
    let dx = direction.x;
    let dy = direction.y;
    let dz = direction.z;
    out.origin.x = ox;
    out.origin.y = oy;
    out.origin.z = oz;
    out.direction.x = dx;
    out.direction.y = dy;
    out.direction.z = dz;
}

/// Transforms a ray by a 4x4 matrix. Origin is transformed as a point (w=1), direction as a
/// vector (w=0) then re-normalized. Safe when `out` aliases `ray`.
pub fn transform_ray3d_by_matrix4(out: &mut Ray3D, ray: &Ray3D, m: &Matrix4) {
    let mm = &m.m;
    let ox = ray.origin.x;
    let oy = ray.origin.y;
    let oz = ray.origin.z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    out.origin.x = mm[0] * ox + mm[4] * oy + mm[8] * oz + mm[12];
    out.origin.y = mm[1] * ox + mm[5] * oy + mm[9] * oz + mm[13];
    out.origin.z = mm[2] * ox + mm[6] * oy + mm[10] * oz + mm[14];

    let ndx = mm[0] * dx + mm[4] * dy + mm[8] * dz;
    let ndy = mm[1] * dx + mm[5] * dy + mm[9] * dz;
    let ndz = mm[2] * dx + mm[6] * dy + mm[10] * dz;
    let len = (ndx * ndx + ndy * ndy + ndz * ndz).sqrt();
    if len > 0.0 {
        let inv = 1.0 / len;
        out.direction.x = ndx * inv;
        out.direction.y = ndy * inv;
        out.direction.z = ndz * inv;
    } else {
        out.direction.x = 0.0;
        out.direction.y = 0.0;
        out.direction.z = 0.0;
    }
}

impl Default for Ray3D {
    fn default() -> Self {
        let mut out = Ray3D {
            runtime: EntityRuntimeSlot::default(),
            origin: Vector3::default(),
            direction: Vector3::default(),
        };
        initialize_ray3d(&mut out, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        return out;
    }
}

impl Ray3D {
    pub fn new(
        origin_x: f32, origin_y: f32, origin_z: f32,
        direction_x: f32, direction_y: f32, direction_z: f32,
    ) -> Self {
        return create_ray3d(origin_x, origin_y, origin_z, direction_x, direction_y, direction_z);
    }

    pub fn closest_point(&self, point: &Vector3) -> Vector3 {
        let mut out = Vector3::default();
        get_closest_point_on_ray3d(&mut out, self, point);
        return out;
    }

    pub fn intersect_aabb(&self, aabb: &Aabb) -> f32 {
        return intersect_ray3d_aabb(self, aabb);
    }

    pub fn intersect_plane(&self, plane: &Plane) -> f32 {
        return intersect_ray3d_plane(self, plane);
    }

    pub fn intersect_sphere(&self, sphere: &BoundingSphere) -> f32 {
        return intersect_ray3d_sphere(self, sphere);
    }

    pub fn intersect_triangle(&self, a: &Vector3, b: &Vector3, c: &Vector3) -> f32 {
        return intersect_ray3d_triangle(self, a, b, c);
    }

    pub fn point_at(&self, t: f32) -> Vector3 {
        let mut out = Vector3::default();
        get_ray3d_point_at(&mut out, self, t);
        return out;
    }
}
