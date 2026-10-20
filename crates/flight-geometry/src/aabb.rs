use crate::BoundingSphere;
use crate::Matrix4;
use crate::Vector3;

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Aabb {
    pub min: Vector3,
    pub max: Vector3,
}

/// Creates an axis-aligned bounding box from explicit min/max corner components.
pub fn create_aabb(
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
) -> Aabb {
    let mut out = Aabb::default();
    initialize_aabb(&mut out, min_x, min_y, min_z, max_x, max_y, max_z);
    return out;
}

/// Sets the min and max corners of an axis-aligned bounding box from explicit components
/// during construction.
pub fn initialize_aabb(
    out: &mut Aabb,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
) {
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Creates an independent copy of an axis-aligned bounding box.
pub fn clone_aabb(source: &Aabb) -> Aabb {
    return create_aabb(
        source.min.x, source.min.y, source.min.z,
        source.max.x, source.max.y, source.max.z,
    );
}

/// Returns whether a point lies inside (or on the boundary of) an axis-aligned bounding box.
pub fn contains_aabb_point(aabb: &Aabb, point: &Vector3) -> bool {
    return point.x >= aabb.min.x
        && point.x <= aabb.max.x
        && point.y >= aabb.min.y
        && point.y <= aabb.max.y
        && point.z >= aabb.min.z
        && point.z <= aabb.max.z;
}

/// Copies the min and max corners of an axis-aligned bounding box.
///
/// Safe when `out` aliases `source`.
pub fn copy_aabb(out: &mut Aabb, source: &Aabb) {
    let min_x = source.min.x;
    let min_y = source.min.y;
    let min_z = source.min.z;
    let max_x = source.max.x;
    let max_y = source.max.y;
    let max_z = source.max.z;
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Grows an axis-aligned bounding box to include a point, writing the result to `out`. When
/// `aabb` is empty (min > max) the first point sets both corners exactly.
///
/// Safe when `out` aliases `aabb`.
pub fn expand_aabb_by_point(out: &mut Aabb, aabb: &Aabb, point: &Vector3) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    out.min.x = min_x.min(px);
    out.min.y = min_y.min(py);
    out.min.z = min_z.min(pz);
    out.max.x = max_x.max(px);
    out.max.y = max_y.max(py);
    out.max.z = max_z.max(pz);
}

/// Grows an axis-aligned bounding box to include a bounding sphere. The sphere is expanded to
/// its AABB first, then unioned with the existing box.
///
/// Safe when `out` aliases `aabb`.
pub fn expand_aabb_by_sphere(
    out: &mut Aabb,
    aabb: &Aabb,
    sphere: &BoundingSphere,
) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let radius = sphere.radius;
    if radius < 0.0 {
        out.min.x = min_x;
        out.min.y = min_y;
        out.min.z = min_z;
        out.max.x = max_x;
        out.max.y = max_y;
        out.max.z = max_z;
        return;
    }
    out.min.x = min_x.min(cx - radius);
    out.min.y = min_y.min(cy - radius);
    out.min.z = min_z.min(cz - radius);
    out.max.x = max_x.max(cx + radius);
    out.max.y = max_y.max(cy + radius);
    out.max.z = max_z.max(cz + radius);
}

/// Writes the center point of an axis-aligned bounding box (the midpoint of its corners).
pub fn get_aabb_center(out: &mut Vector3, aabb: &Aabb) {
    let x = (aabb.min.x + aabb.max.x) * 0.5;
    let y = (aabb.min.y + aabb.max.y) * 0.5;
    let z = (aabb.min.z + aabb.max.z) * 0.5;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Writes the half-extents (half the size along each axis) of an axis-aligned bounding box.
pub fn get_aabb_extents(out: &mut Vector3, aabb: &Aabb) {
    let x = (aabb.max.x - aabb.min.x) * 0.5;
    let y = (aabb.max.y - aabb.min.y) * 0.5;
    let z = (aabb.max.z - aabb.min.z) * 0.5;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Writes the full size (extent along each axis) of an axis-aligned bounding box.
pub fn get_aabb_size(out: &mut Vector3, aabb: &Aabb) {
    let x = aabb.max.x - aabb.min.x;
    let y = aabb.max.y - aabb.min.y;
    let z = aabb.max.z - aabb.min.z;
    out.x = x;
    out.y = y;
    out.z = z;
}

/// Writes the point on (or inside) an axis-aligned bounding box closest to `point` — each
/// coordinate is clamped to the box's range on that axis. When `point` is already inside the box
/// the result equals `point`.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_aabb(out: &mut Vector3, aabb: &Aabb, point: &Vector3) {
    let px = point.x;
    let py = point.y;
    let pz = point.z;
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;
    out.x = px.max(min_x).min(max_x);
    out.y = py.max(min_y).min(max_y);
    out.z = pz.max(min_z).min(max_z);
}

/// Writes the intersection (overlap region) of two axis-aligned bounding boxes to `out`.
/// If the boxes do not overlap, `out` is set to an empty box (min > max).
///
/// Reads all inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
pub fn intersect_aabb(out: &mut Aabb, a: &Aabb, b: &Aabb) {
    let a_min_x = a.min.x;
    let a_min_y = a.min.y;
    let a_min_z = a.min.z;
    let a_max_x = a.max.x;
    let a_max_y = a.max.y;
    let a_max_z = a.max.z;
    let b_min_x = b.min.x;
    let b_min_y = b.min.y;
    let b_min_z = b.min.z;
    let b_max_x = b.max.x;
    let b_max_y = b.max.y;
    let b_max_z = b.max.z;
    out.min.x = a_min_x.max(b_min_x);
    out.min.y = a_min_y.max(b_min_y);
    out.min.z = a_min_z.max(b_min_z);
    out.max.x = a_max_x.min(b_max_x);
    out.max.y = a_max_y.min(b_max_y);
    out.max.z = a_max_z.min(b_max_z);
}

/// Returns whether two axis-aligned bounding boxes overlap (share any interior or surface point).
/// An empty box (min > max on any axis) does not intersect anything.
pub fn is_aabb_intersecting_aabb(a: &Aabb, b: &Aabb) -> bool {
    if a.min.x > a.max.x
        || a.min.z > a.max.z
        || a.min.y > a.max.y
        || b.min.x > b.max.x
        || b.min.y > b.max.y
        || b.min.z > b.max.z
    {
        return false;
    }
    return a.min.x <= b.max.x
        && a.max.x >= b.min.x
        && a.min.y <= b.max.y
        && a.max.y >= b.min.y
        && a.min.z <= b.max.z
        && a.max.z >= b.min.z;
}

/// Returns whether an axis-aligned bounding box overlaps a bounding sphere (Arvo's method:
/// clamp the sphere center to the box, then test distance squared <= radius squared). An empty
/// box (min > max on any axis) or empty sphere (negative radius) does not intersect anything.
pub fn is_aabb_intersecting_sphere(aabb: &Aabb, sphere: &BoundingSphere) -> bool {
    if aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z {
        return false;
    }
    if sphere.radius < 0.0 {
        return false;
    }
    let cx = sphere.center.x;
    let cy = sphere.center.y;
    let cz = sphere.center.z;
    let dx = (aabb.min.x - cx).max(0.0).max(cx - aabb.max.x);
    let dy = (aabb.min.y - cy).max(0.0).max(cy - aabb.max.y);
    let dz = (aabb.min.z - cz).max(0.0).max(cz - aabb.max.z);
    return dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius;
}

/// Sets the min and max corners of an axis-aligned bounding box from explicit components.
pub fn set_aabb(
    out: &mut Aabb,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
) {
    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Computes the tight axis-aligned bounding box of a set of points. An empty list yields an
/// empty box (min = +Infinity, max = -Infinity).
pub fn set_aabb_from_points(out: &mut Aabb, points: &[Vector3]) {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for i in 0..points.len() {
        let p = &points[i];
        if p.x < min_x { min_x = p.x; }
        if p.y < min_y { min_y = p.y; }
        if p.z < min_z { min_z = p.z; }
        if p.x > max_x { max_x = p.x; }
        if p.y > max_y { max_y = p.y; }
        if p.z > max_z { max_z = p.z; }
    }

    out.min.x = min_x;
    out.min.y = min_y;
    out.min.z = min_z;
    out.max.x = max_x;
    out.max.y = max_y;
    out.max.z = max_z;
}

/// Transforms an axis-aligned bounding box by a Matrix4 and writes the tight AABB of the
/// transformed box. Uses the center/extent absolute-value method so the result stays
/// axis-aligned in the destination space.
///
/// Reads all of `aabb` into locals before writing, so it is safe when `out` aliases `aabb`.
pub fn transform_aabb_by_matrix4(out: &mut Aabb, aabb: &Aabb, m: &Matrix4) {
    let min_x = aabb.min.x;
    let min_y = aabb.min.y;
    let min_z = aabb.min.z;
    let max_x = aabb.max.x;
    let max_y = aabb.max.y;
    let max_z = aabb.max.z;

    let cx = (min_x + max_x) * 0.5;
    let cy = (min_y + max_y) * 0.5;
    let cz = (min_z + max_z) * 0.5;
    let ex = (max_x - min_x) * 0.5;
    let ey = (max_y - min_y) * 0.5;
    let ez = (max_z - min_z) * 0.5;

    let _m = &m.m;
    let tcx = _m[0] * cx + _m[4] * cy + _m[8] * cz + _m[12];
    let tcy = _m[1] * cx + _m[5] * cy + _m[9] * cz + _m[13];
    let tcz = _m[2] * cx + _m[6] * cy + _m[10] * cz + _m[14];

    let tex = _m[0].abs() * ex + _m[4].abs() * ey + _m[8].abs() * ez;
    let tey = _m[1].abs() * ex + _m[5].abs() * ey + _m[9].abs() * ez;
    let tez = _m[2].abs() * ex + _m[6].abs() * ey + _m[10].abs() * ez;

    out.min.x = tcx - tex;
    out.min.y = tcy - tey;
    out.min.z = tcz - tez;
    out.max.x = tcx + tex;
    out.max.y = tcy + tey;
    out.max.z = tcz + tez;
}

/// Writes the union of two axis-aligned bounding boxes — the smallest box enclosing both.
///
/// Reads both inputs into locals before writing, so it is safe when `out` aliases `a` or `b`.
pub fn union_aabb(out: &mut Aabb, a: &Aabb, b: &Aabb) {
    let a_min_x = a.min.x;
    let a_min_y = a.min.y;
    let a_min_z = a.min.z;
    let a_max_x = a.max.x;
    let a_max_y = a.max.y;
    let a_max_z = a.max.z;
    let b_min_x = b.min.x;
    let b_min_y = b.min.y;
    let b_min_z = b.min.z;
    let b_max_x = b.max.x;
    let b_max_y = b.max.y;
    let b_max_z = b.max.z;

    out.min.x = a_min_x.min(b_min_x);
    out.min.y = a_min_y.min(b_min_y);
    out.min.z = a_min_z.min(b_min_z);
    out.max.x = a_max_x.max(b_max_x);
    out.max.y = a_max_y.max(b_max_y);
    out.max.z = a_max_z.max(b_max_z);
}

impl Aabb {
    pub fn new(
        min_x: f32, min_y: f32, min_z: f32,
        max_x: f32, max_y: f32, max_z: f32,
    ) -> Self {
        return create_aabb(min_x, min_y, min_z, max_x, max_y, max_z);
    }

    pub fn center(&self) -> Vector3 {
        let mut out = Vector3::default();
        get_aabb_center(&mut out, self);
        return out;
    }

    pub fn closest_point(&self, point: &Vector3) -> Vector3 {
        let mut out = Vector3::default();
        get_closest_point_on_aabb(&mut out, self, point);
        return out;
    }

    pub fn contains_point(&self, point: &Vector3) -> bool {
        return contains_aabb_point(self, point);
    }

    pub fn expanded_by_point(&self, point: &Vector3) -> Self {
        let mut out = Self::default();
        expand_aabb_by_point(&mut out, self, point);
        return out;
    }

    pub fn expanded_by_sphere(&self, sphere: &BoundingSphere) -> Self {
        let mut out = Self::default();
        expand_aabb_by_sphere(&mut out, self, sphere);
        return out;
    }

    pub fn extents(&self) -> Vector3 {
        let mut out = Vector3::default();
        get_aabb_extents(&mut out, self);
        return out;
    }

    pub fn intersected(&self, other: &Self) -> Self {
        let mut out = Self::default();
        intersect_aabb(&mut out, self, other);
        return out;
    }

    pub fn is_intersecting_aabb(&self, other: &Self) -> bool {
        return is_aabb_intersecting_aabb(self, other);
    }

    pub fn is_intersecting_sphere(&self, sphere: &BoundingSphere) -> bool {
        return is_aabb_intersecting_sphere(self, sphere);
    }

    pub fn size(&self) -> Vector3 {
        let mut out = Vector3::default();
        get_aabb_size(&mut out, self);
        return out;
    }

    pub fn transformed_by_matrix4(&self, m: &Matrix4) -> Self {
        let mut out = Self::default();
        transform_aabb_by_matrix4(&mut out, self, m);
        return out;
    }

    pub fn union(&self, other: &Self) -> Self {
        let mut out = Self::default();
        union_aabb(&mut out, self, other);
        return out;
    }
}
