use crate::Aabb;
use crate::Matrix4;
use crate::{Vector3, create_vector3};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq)]
pub struct BoundingSphere {
    runtime: EntityRuntimeSlot,
    pub center: Vector3,
    pub radius: f32,
}

/// Creates a bounding sphere from an explicit center and radius.
pub fn create_bounding_sphere(
    center_x: f32,
    center_y: f32,
    center_z: f32,
    radius: f32,
) -> BoundingSphere {
    let mut out: BoundingSphere = allocate_entity();
    initialize_bounding_sphere(
        &mut out,
        &create_vector3(center_x, center_y, center_z),
        radius,
    );
    return out;
}

/// Sets the center and radius of a bounding sphere during construction
/// (TS `initializeBoundingSphere`).
pub fn initialize_bounding_sphere(out: &mut BoundingSphere, center: &Vector3, radius: f32) {
    out.center.x = center.x;
    out.center.y = center.y;
    out.center.z = center.z;
    out.radius = radius;
}

/// Creates an independent copy of a bounding sphere.
pub fn clone_bounding_sphere(source: &BoundingSphere) -> BoundingSphere {
    return create_bounding_sphere(
        source.center.x,
        source.center.y,
        source.center.z,
        source.radius,
    );
}

/// Returns whether a point lies inside (or on the surface of) a bounding sphere. An empty
/// sphere (negative radius) contains no points.
pub fn contains_bounding_sphere_point(sphere: &BoundingSphere, point: &Vector3) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let dx = point.x - sphere.center.x;
    let dy = point.y - sphere.center.y;
    let dz = point.z - sphere.center.z;
    return dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius;
}

/// Copies the center and radius of a bounding sphere.
///
/// Safe when `out` aliases `source`.
pub fn copy_bounding_sphere(out: &mut BoundingSphere, source: &BoundingSphere) {
    let cx = source.center.x;
    let cy = source.center.y;
    let cz = source.center.z;
    let r = source.radius;
    out.center.x = cx;
    out.center.y = cy;
    out.center.z = cz;
    out.radius = r;
}

/// Writes the point on the surface of a bounding sphere closest to `point`: the point projected
/// onto the sphere along the ray from the center. When `point` lies at the center (no defined
/// direction) the sphere center offset by `radius` along +X is written as a stable fallback. An
/// empty sphere (negative radius) writes the sphere center.
///
/// Reads `point` and the sphere into locals before writing, so it is safe when `out` aliases
/// `point`.
pub fn get_closest_point_on_bounding_sphere(
    out: &mut Vector3,
    sphere: &BoundingSphere,
    point: &Vector3,
) {
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let r = sphere.radius;
    if r < 0.0 {
        out.x = cx;
        out.y = cy;
        out.z = cz;
        return;
    }
    let dx = point.x - cx;
    let dy = point.y - cy;
    let dz = point.z - cz;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if dist == 0.0 {
        out.x = cx + r;
        out.y = cy;
        out.z = cz;
        return;
    }
    let scale = r / dist;
    out.x = cx + dx * scale;
    out.y = cy + dy * scale;
    out.z = cz + dz * scale;
}

/// Returns whether two bounding spheres overlap (share any interior or surface point).
/// An empty sphere (negative radius) does not intersect anything.
pub fn is_bounding_sphere_intersecting_bounding_sphere(
    a: &BoundingSphere,
    b: &BoundingSphere,
) -> bool {
    if a.radius < 0.0 || b.radius < 0.0 {
        return false;
    }
    let dx = a.center.x - b.center.x;
    let dy = a.center.y - b.center.y;
    let dz = a.center.z - b.center.z;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    let sum_r = a.radius + b.radius;
    return dist_sq <= sum_r * sum_r;
}

/// Writes the smallest sphere that encloses both `a` and `b`. An empty sphere (negative radius)
/// is treated as having no volume; merging an empty sphere with a non-empty sphere returns the
/// non-empty sphere.
///
/// Reads all inputs before writing, so it is safe when `out` aliases `a` or `b`.
pub fn merge_bounding_sphere(out: &mut BoundingSphere, a: &BoundingSphere, b: &BoundingSphere) {
    if a.radius < 0.0 {
        let cx = b.center.x;
        let cy = b.center.y;
        let cz = b.center.z;
        let r = b.radius;
        out.center.x = cx;
        out.center.y = cy;
        out.center.z = cz;
        out.radius = r;
        return;
    }
    if b.radius < 0.0 {
        let cx = a.center.x;
        let cy = a.center.y;
        let cz = a.center.z;
        let r = a.radius;
        out.center.x = cx;
        out.center.y = cy;
        out.center.z = cz;
        out.radius = r;
        return;
    }

    let acx = a.center.x;
    let acy = a.center.y;
    let acz = a.center.z;
    let ar = a.radius;
    let bcx = b.center.x;
    let bcy = b.center.y;
    let bcz = b.center.z;
    let br = b.radius;

    let dx = bcx - acx;
    let dy = bcy - acy;
    let dz = bcz - acz;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();

    if dist + br <= ar {
        out.center.x = acx;
        out.center.y = acy;
        out.center.z = acz;
        out.radius = ar;
        return;
    }
    if dist + ar <= br {
        out.center.x = bcx;
        out.center.y = bcy;
        out.center.z = bcz;
        out.radius = br;
        return;
    }

    let new_radius = (dist + ar + br) * 0.5;
    let t = (new_radius - ar) / dist;
    out.center.x = acx + dx * t;
    out.center.y = acy + dy * t;
    out.center.z = acz + dz * t;
    out.radius = new_radius;
}

/// Sets the center and radius of a bounding sphere.
pub fn set_bounding_sphere(
    out: &mut BoundingSphere,
    center_x: f32,
    center_y: f32,
    center_z: f32,
    radius: f32,
) {
    out.center.x = center_x;
    out.center.y = center_y;
    out.center.z = center_z;
    out.radius = radius;
}

/// Writes the bounding sphere that tightly encloses an axis-aligned bounding box: its center
/// is the box center and its radius reaches the box corners. An empty box (min > max) yields
/// an empty sphere (negative radius).
///
/// Reads `aabb` into locals before writing, so it is safe even if `out` shares vector storage.
pub fn set_bounding_sphere_from_aabb(out: &mut BoundingSphere, aabb: &Aabb) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;

    if min_x > max_x || min_y > max_y || min_z > max_z {
        out.center.x = 0.0;
        out.center.y = 0.0;
        out.center.z = 0.0;
        out.radius = -1.0;
        return;
    }

    let cx = (min_x + max_x) * 0.5;
    let cy = (min_y + max_y) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let ex = (max_x - min_x) * 0.5;
    let ey = (max_y - min_y) * 0.5;
    let ez = (max_z - min_z) * 0.5;

    out.center.x = cx;
    out.center.y = cy;
    out.center.z = cz;
    out.radius = (ex * ex + ey * ey + ez * ez).sqrt();
}

/// Transforms a bounding sphere by a Matrix4: its center is transformed as a point and its
/// radius is scaled by the largest axis scale of the matrix's linear part, so the result still
/// encloses the transformed sphere under non-uniform scale.
///
/// Reads `sphere` into locals before writing, so it is safe when `out` aliases `sphere`.
pub fn transform_bounding_sphere_by_matrix4(
    out: &mut BoundingSphere,
    sphere: &BoundingSphere,
    m: &Matrix4,
) {
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let radius = sphere.radius;

    let _m = &m.m;
    let tcx = _m[0] * cx + _m[4] * cy + _m[8] * cz + _m[12];
    let tcy = _m[1] * cx + _m[5] * cy + _m[9] * cz + _m[13];
    let tcz = _m[2] * cx + _m[6] * cy + _m[10] * cz + _m[14];

    let sx = (_m[0] * _m[0] + _m[1] * _m[1] + _m[2] * _m[2]).sqrt();
    let sy = (_m[4] * _m[4] + _m[5] * _m[5] + _m[6] * _m[6]).sqrt();
    let sz = (_m[8] * _m[8] + _m[9] * _m[9] + _m[10] * _m[10]).sqrt();
    let max_scale = sx.max(sy).max(sz);

    out.center.x = tcx;
    out.center.y = tcy;
    out.center.z = tcz;
    out.radius = if radius < 0.0 {
        radius
    } else {
        radius * max_scale
    };
}

impl Default for BoundingSphere {
    fn default() -> Self {
        return BoundingSphere {
            runtime: EntityRuntimeSlot::default(),
            center: Vector3::default(),
            radius: -1.0,
        };
    }
}

impl BoundingSphere {
    pub fn new(center_x: f32, center_y: f32, center_z: f32, radius: f32) -> Self {
        return create_bounding_sphere(center_x, center_y, center_z, radius);
    }

    pub fn closest_point(&self, point: &Vector3) -> Vector3 {
        let mut out = Vector3::default();
        get_closest_point_on_bounding_sphere(&mut out, self, point);
        return out;
    }

    pub fn contains_point(&self, point: &Vector3) -> bool {
        return contains_bounding_sphere_point(self, point);
    }

    pub fn from_aabb(aabb: &Aabb) -> Self {
        let mut out = Self::default();
        set_bounding_sphere_from_aabb(&mut out, aabb);
        return out;
    }

    pub fn is_intersecting_bounding_sphere(&self, other: &Self) -> bool {
        return is_bounding_sphere_intersecting_bounding_sphere(self, other);
    }

    pub fn merged(&self, other: &Self) -> Self {
        let mut out = Self::default();
        merge_bounding_sphere(&mut out, self, other);
        return out;
    }

    pub fn transformed_by_matrix4(&self, m: &Matrix4) -> Self {
        let mut out = Self::default();
        transform_bounding_sphere_by_matrix4(&mut out, self, m);
        return out;
    }
}

flight_entity::impl_entity!(BoundingSphere);
