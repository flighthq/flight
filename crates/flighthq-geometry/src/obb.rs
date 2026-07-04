//! Free functions for [`Obb`] — an oriented bounding box in 3D space.

use flighthq_types::{Aabb, Matrix4Like, Obb, ObbLike, Ray3D, Vector3Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates an oriented bounding box from a center, half-extents, and an
/// orientation quaternion (x, y, z, w). The identity orientation (0, 0, 0, 1)
/// aligns local axes with world axes.
#[allow(clippy::too_many_arguments)]
pub fn create_obb(
    center_x: f32,
    center_y: f32,
    center_z: f32,
    half_extent_x: f32,
    half_extent_y: f32,
    half_extent_z: f32,
    orientation_x: f32,
    orientation_y: f32,
    orientation_z: f32,
    orientation_w: f32,
) -> Obb {
    Obb {
        center_x,
        center_y,
        center_z,
        half_extent_x,
        half_extent_y,
        half_extent_z,
        orientation_x,
        orientation_y,
        orientation_z,
        orientation_w,
    }
}

/// Writes the point on (or inside) an oriented bounding box closest to
/// `point`. Each axis independently clamps the point's projection onto that
/// axis to the half-extent range.
///
/// Safe when `out` aliases `point`.
pub fn get_closest_point_on_obb(out: &mut Vector3Like, obb: &ObbLike, point: &Vector3Like) {
    let cx = obb.center_x;
    let cy = obb.center_y;
    let cz = obb.center_z;
    let hx = obb.half_extent_x;
    let hy = obb.half_extent_y;
    let hz = obb.half_extent_z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;

    let (ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2) = obb_local_axes(obb);

    let dx = px - cx;
    let dy = py - cy;
    let dz = pz - cz;

    let d0 = (dx * ax0 + dy * ay0 + dz * az0).clamp(-hx, hx);
    let d1 = (dx * ax1 + dy * ay1 + dz * az1).clamp(-hy, hy);
    let d2 = (dx * ax2 + dy * ay2 + dz * az2).clamp(-hz, hz);

    out.x = cx + d0 * ax0 + d1 * ax1 + d2 * ax2;
    out.y = cy + d0 * ay0 + d1 * ay1 + d2 * ay2;
    out.z = cz + d0 * az0 + d1 * az1 + d2 * az2;
}

/// Tests whether a ray intersects an oriented bounding box. Transforms the ray
/// into OBB local space, then applies the slab method against the axis-aligned
/// half-extent box.
///
/// Returns the entry parameter `t` (>= 0) on hit, or `-1` on miss. A ray
/// starting inside the OBB returns `t = 0`.
pub fn intersect_ray3d_obb(ray: &Ray3D, obb: &ObbLike) -> f32 {
    let ox = ray.origin.x - obb.center_x;
    let oy = ray.origin.y - obb.center_y;
    let oz = ray.origin.z - obb.center_z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;
    let hx = obb.half_extent_x;
    let hy = obb.half_extent_y;
    let hz = obb.half_extent_z;

    let (ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2) = obb_local_axes(obb);

    let origins = [
        ox * ax0 + oy * ay0 + oz * az0,
        ox * ax1 + oy * ay1 + oz * az1,
        ox * ax2 + oy * ay2 + oz * az2,
    ];
    let dirs = [
        dx * ax0 + dy * ay0 + dz * az0,
        dx * ax1 + dy * ay1 + dz * az1,
        dx * ax2 + dy * ay2 + dz * az2,
    ];
    let half_exts = [hx, hy, hz];

    let mut t_min: f32 = 0.0;
    let mut t_max: f32 = f32::INFINITY;

    for i in 0..3 {
        let o = origins[i];
        let d = dirs[i];
        let h = half_exts[i];
        if d.abs() > 1e-10 {
            let inv_d = 1.0 / d;
            let mut t1 = (-h - o) * inv_d;
            let mut t2 = (h - o) * inv_d;
            if t1 > t2 {
                std::mem::swap(&mut t1, &mut t2);
            }
            t_min = t_min.max(t1);
            t_max = t_max.min(t2);
            if t_min > t_max {
                return -1.0;
            }
        } else if o < -h || o > h {
            return -1.0;
        }
    }

    t_min
}

/// Returns whether an oriented bounding box overlaps an axis-aligned bounding
/// box using the Separating Axis Theorem with 15 candidate axes.
pub fn is_obb_intersecting_aabb(obb: &ObbLike, aabb: &Aabb) -> bool {
    let acx = (aabb.min.x + aabb.max.x) * 0.5;
    let acy = (aabb.min.y + aabb.max.y) * 0.5;
    let acz = (aabb.min.z + aabb.max.z) * 0.5;
    let ahx = (aabb.max.x - aabb.min.x) * 0.5;
    let ahy = (aabb.max.y - aabb.min.y) * 0.5;
    let ahz = (aabb.max.z - aabb.min.z) * 0.5;

    let (ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2) = obb_local_axes(obb);

    let tx = acx - obb.center_x;
    let ty = acy - obb.center_y;
    let tz = acz - obb.center_z;

    !obb_sat_separated(
        tx,
        ty,
        tz,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
        obb.half_extent_x,
        obb.half_extent_y,
        obb.half_extent_z,
        1.0,
        0.0,
        0.0,
        0.0,
        1.0,
        0.0,
        0.0,
        0.0,
        1.0,
        ahx,
        ahy,
        ahz,
    )
}

/// Returns whether two oriented bounding boxes overlap using the Separating
/// Axis Theorem with 15 candidate axes (3 face normals per box plus 9 edge
/// cross-products).
pub fn is_obb_intersecting_obb(a: &ObbLike, b: &ObbLike) -> bool {
    let (ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2) = obb_local_axes(a);
    let (bx0, by0, bz0, bx1, by1, bz1, bx2, by2, bz2) = obb_local_axes(b);

    let tx = b.center_x - a.center_x;
    let ty = b.center_y - a.center_y;
    let tz = b.center_z - a.center_z;

    !obb_sat_separated(
        tx,
        ty,
        tz,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
        a.half_extent_x,
        a.half_extent_y,
        a.half_extent_z,
        bx0,
        by0,
        bz0,
        bx1,
        by1,
        bz1,
        bx2,
        by2,
        bz2,
        b.half_extent_x,
        b.half_extent_y,
        b.half_extent_z,
    )
}

/// Sets all fields of an oriented bounding box in place.
#[allow(clippy::too_many_arguments)]
pub fn set_obb(
    out: &mut ObbLike,
    center_x: f32,
    center_y: f32,
    center_z: f32,
    half_extent_x: f32,
    half_extent_y: f32,
    half_extent_z: f32,
    orientation_x: f32,
    orientation_y: f32,
    orientation_z: f32,
    orientation_w: f32,
) {
    out.center_x = center_x;
    out.center_y = center_y;
    out.center_z = center_z;
    out.half_extent_x = half_extent_x;
    out.half_extent_y = half_extent_y;
    out.half_extent_z = half_extent_z;
    out.orientation_x = orientation_x;
    out.orientation_y = orientation_y;
    out.orientation_z = orientation_z;
    out.orientation_w = orientation_w;
}

/// Transforms an oriented bounding box by a Matrix4. The center is transformed
/// as a point; the orientation is composed with the matrix's rotation; the
/// half-extents are scaled by the column magnitudes of the matrix's linear part.
///
/// Safe when `out` aliases `obb` (reads all inputs before writing).
pub fn transform_obb_by_matrix4(out: &mut ObbLike, obb: &ObbLike, m: &Matrix4Like) {
    let cx = obb.center_x;
    let cy = obb.center_y;
    let cz = obb.center_z;
    let hx = obb.half_extent_x;
    let hy = obb.half_extent_y;
    let hz = obb.half_extent_z;
    let oqx = obb.orientation_x;
    let oqy = obb.orientation_y;
    let oqz = obb.orientation_z;
    let oqw = obb.orientation_w;

    let mm = &m.m;
    let new_cx = mm[0] * cx + mm[4] * cy + mm[8] * cz + mm[12];
    let new_cy = mm[1] * cx + mm[5] * cy + mm[9] * cz + mm[13];
    let new_cz = mm[2] * cx + mm[6] * cy + mm[10] * cz + mm[14];

    let sx = (mm[0] * mm[0] + mm[1] * mm[1] + mm[2] * mm[2]).sqrt();
    let sy = (mm[4] * mm[4] + mm[5] * mm[5] + mm[6] * mm[6]).sqrt();
    let sz = (mm[8] * mm[8] + mm[9] * mm[9] + mm[10] * mm[10]).sqrt();

    // Normalized rotation matrix from matrix columns.
    let (r00, r10, r20) = if sx > 0.0 {
        (mm[0] / sx, mm[1] / sx, mm[2] / sx)
    } else {
        (1.0, 0.0, 0.0)
    };
    let (r01, r11, r21) = if sy > 0.0 {
        (mm[4] / sy, mm[5] / sy, mm[6] / sy)
    } else {
        (0.0, 1.0, 0.0)
    };
    let (r02, r12, r22) = if sz > 0.0 {
        (mm[8] / sz, mm[9] / sz, mm[10] / sz)
    } else {
        (0.0, 0.0, 1.0)
    };

    // Quaternion from rotation matrix (Shepperd method).
    let mqw: f32;
    let mqx: f32;
    let mqy: f32;
    let mqz: f32;
    let trace = r00 + r11 + r22;
    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        mqw = 0.25 / s;
        mqx = (r12 - r21) * s;
        mqy = (r20 - r02) * s;
        mqz = (r01 - r10) * s;
    } else if r00 > r11 && r00 > r22 {
        let s = 2.0 * (1.0 + r00 - r11 - r22).sqrt();
        mqw = (r12 - r21) / s;
        mqx = 0.25 * s;
        mqy = (r10 + r01) / s;
        mqz = (r20 + r02) / s;
    } else if r11 > r22 {
        let s = 2.0 * (1.0 + r11 - r00 - r22).sqrt();
        mqw = (r20 - r02) / s;
        mqx = (r10 + r01) / s;
        mqy = 0.25 * s;
        mqz = (r21 + r12) / s;
    } else {
        let s = 2.0 * (1.0 + r22 - r00 - r11).sqrt();
        mqw = (r01 - r10) / s;
        mqx = (r20 + r02) / s;
        mqy = (r21 + r12) / s;
        mqz = 0.25 * s;
    }

    // Compose: new orientation = mq * obb.orientation (Hamilton product)
    out.center_x = new_cx;
    out.center_y = new_cy;
    out.center_z = new_cz;
    out.half_extent_x = hx * sx;
    out.half_extent_y = hy * sy;
    out.half_extent_z = hz * sz;
    out.orientation_x = mqw * oqx + mqx * oqw + mqy * oqz - mqz * oqy;
    out.orientation_y = mqw * oqy - mqx * oqz + mqy * oqw + mqz * oqx;
    out.orientation_z = mqw * oqz + mqx * oqy - mqy * oqx + mqz * oqw;
    out.orientation_w = mqw * oqw - mqx * oqx - mqy * oqy - mqz * oqz;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Returns the 3 local axes of the OBB as 9 floats:
/// `(ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2)`.
fn obb_local_axes(obb: &ObbLike) -> (f32, f32, f32, f32, f32, f32, f32, f32, f32) {
    let qx = obb.orientation_x;
    let qy = obb.orientation_y;
    let qz = obb.orientation_z;
    let qw = obb.orientation_w;
    let xx = qx * qx;
    let yy = qy * qy;
    let zz = qz * qz;
    let xy = qx * qy;
    let xz = qx * qz;
    let yz = qy * qz;
    let wx = qw * qx;
    let wy = qw * qy;
    let wz = qw * qz;
    (
        1.0 - 2.0 * (yy + zz),
        2.0 * (xy + wz),
        2.0 * (xz - wy),
        2.0 * (xy - wz),
        1.0 - 2.0 * (xx + zz),
        2.0 * (yz + wx),
        2.0 * (xz + wy),
        2.0 * (yz - wx),
        1.0 - 2.0 * (xx + yy),
    )
}

/// Returns `true` if the two boxes are separated on any of the 15 SAT
/// candidate axes. `true` = separated = no intersection.
#[allow(clippy::too_many_arguments)]
fn obb_sat_separated(
    tx: f32,
    ty: f32,
    tz: f32,
    ax0: f32,
    ay0: f32,
    az0: f32,
    ax1: f32,
    ay1: f32,
    az1: f32,
    ax2: f32,
    ay2: f32,
    az2: f32,
    hax: f32,
    hay: f32,
    haz: f32,
    bx0: f32,
    by0: f32,
    bz0: f32,
    bx1: f32,
    by1: f32,
    bz1: f32,
    bx2: f32,
    by2: f32,
    bz2: f32,
    hbx: f32,
    hby: f32,
    hbz: f32,
) -> bool {
    let on_axis = |lx: f32, ly: f32, lz: f32| -> bool {
        let len_sq = lx * lx + ly * ly + lz * lz;
        if len_sq < 1e-10 {
            return false;
        }
        let d = (tx * lx + ty * ly + tz * lz).abs();
        let pa = (ax0 * lx + ay0 * ly + az0 * lz).abs() * hax
            + (ax1 * lx + ay1 * ly + az1 * lz).abs() * hay
            + (ax2 * lx + ay2 * ly + az2 * lz).abs() * haz;
        let pb = (bx0 * lx + by0 * ly + bz0 * lz).abs() * hbx
            + (bx1 * lx + by1 * ly + bz1 * lz).abs() * hby
            + (bx2 * lx + by2 * ly + bz2 * lz).abs() * hbz;
        d > pa + pb
    };

    // 3 face normals of A
    if on_axis(ax0, ay0, az0) {
        return true;
    }
    if on_axis(ax1, ay1, az1) {
        return true;
    }
    if on_axis(ax2, ay2, az2) {
        return true;
    }
    // 3 face normals of B
    if on_axis(bx0, by0, bz0) {
        return true;
    }
    if on_axis(bx1, by1, bz1) {
        return true;
    }
    if on_axis(bx2, by2, bz2) {
        return true;
    }
    // 9 edge cross-products
    if on_axis(
        ay0 * bz0 - az0 * by0,
        az0 * bx0 - ax0 * bz0,
        ax0 * by0 - ay0 * bx0,
    ) {
        return true;
    }
    if on_axis(
        ay0 * bz1 - az0 * by1,
        az0 * bx1 - ax0 * bz1,
        ax0 * by1 - ay0 * bx1,
    ) {
        return true;
    }
    if on_axis(
        ay0 * bz2 - az0 * by2,
        az0 * bx2 - ax0 * bz2,
        ax0 * by2 - ay0 * bx2,
    ) {
        return true;
    }
    if on_axis(
        ay1 * bz0 - az1 * by0,
        az1 * bx0 - ax1 * bz0,
        ax1 * by0 - ay1 * bx0,
    ) {
        return true;
    }
    if on_axis(
        ay1 * bz1 - az1 * by1,
        az1 * bx1 - ax1 * bz1,
        ax1 * by1 - ay1 * bx1,
    ) {
        return true;
    }
    if on_axis(
        ay1 * bz2 - az1 * by2,
        az1 * bx2 - ax1 * bz2,
        ax1 * by2 - ay1 * bx2,
    ) {
        return true;
    }
    if on_axis(
        ay2 * bz0 - az2 * by0,
        az2 * bx0 - ax2 * bz0,
        ax2 * by0 - ay2 * bx0,
    ) {
        return true;
    }
    if on_axis(
        ay2 * bz1 - az2 * by1,
        az2 * bx1 - ax2 * bz1,
        ax2 * by1 - ay2 * bx1,
    ) {
        return true;
    }
    if on_axis(
        ay2 * bz2 - az2 * by2,
        az2 * bx2 - ax2 * bz2,
        ax2 * by2 - ay2 * bx2,
    ) {
        return true;
    }
    false
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_types::Vector3;

    fn pt(x: f32, y: f32, z: f32) -> Vector3Like {
        Vector3Like { x, y, z }
    }

    fn identity_obb(hx: f32, hy: f32, hz: f32) -> ObbLike {
        ObbLike {
            center_x: 0.0,
            center_y: 0.0,
            center_z: 0.0,
            half_extent_x: hx,
            half_extent_y: hy,
            half_extent_z: hz,
            orientation_x: 0.0,
            orientation_y: 0.0,
            orientation_z: 0.0,
            orientation_w: 1.0,
        }
    }

    // create_obb
    #[test]
    fn create_obb_stores_values() {
        let o = create_obb(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(o.center_x, 1.0);
        assert_eq!(o.half_extent_z, 6.0);
        assert_eq!(o.orientation_w, 1.0);
    }

    // get_closest_point_on_obb
    #[test]
    fn get_closest_point_on_obb_inside() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_obb(&mut out, &obb, &pt(0.5, 0.5, 0.5));
        assert!((out.x - 0.5).abs() < 1e-5);
        assert!((out.y - 0.5).abs() < 1e-5);
        assert!((out.z - 0.5).abs() < 1e-5);
    }

    #[test]
    fn get_closest_point_on_obb_outside() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let mut out = pt(0.0, 0.0, 0.0);
        get_closest_point_on_obb(&mut out, &obb, &pt(3.0, 0.0, 0.0));
        assert!((out.x - 1.0).abs() < 1e-5);
        assert!(out.y.abs() < 1e-5);
        assert!(out.z.abs() < 1e-5);
    }

    #[test]
    fn get_closest_point_on_obb_alias_safe() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let mut p = pt(3.0, 4.0, 5.0);
        get_closest_point_on_obb(&mut p, &obb, &p);
        assert!((p.x - 1.0).abs() < 1e-5);
        assert!((p.y - 1.0).abs() < 1e-5);
        assert!((p.z - 1.0).abs() < 1e-5);
    }

    // intersect_ray3d_obb
    #[test]
    fn intersect_ray3d_obb_hit() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let ray = Ray3D {
            origin: Vector3 {
                x: -5.0,
                y: 0.0,
                z: 0.0,
            },
            direction: Vector3 {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            },
        };
        let t = intersect_ray3d_obb(&ray, &obb);
        assert!((t - 4.0).abs() < 1e-4, "expected ~4, got {t}");
    }

    #[test]
    fn intersect_ray3d_obb_miss() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let ray = Ray3D {
            origin: Vector3 {
                x: 5.0,
                y: 0.0,
                z: 0.0,
            },
            direction: Vector3 {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            },
        };
        assert_eq!(intersect_ray3d_obb(&ray, &obb), -1.0);
    }

    #[test]
    fn intersect_ray3d_obb_inside() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let ray = Ray3D {
            origin: Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            direction: Vector3 {
                x: 1.0,
                y: 0.0,
                z: 0.0,
            },
        };
        assert_eq!(intersect_ray3d_obb(&ray, &obb), 0.0);
    }

    // is_obb_intersecting_aabb
    #[test]
    fn is_obb_intersecting_aabb_overlap() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let aabb = Aabb {
            min: Vector3 {
                x: 0.5,
                y: 0.5,
                z: 0.5,
            },
            max: Vector3 {
                x: 2.0,
                y: 2.0,
                z: 2.0,
            },
        };
        assert!(is_obb_intersecting_aabb(&obb, &aabb));
    }

    #[test]
    fn is_obb_intersecting_aabb_no_overlap() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let aabb = Aabb {
            min: Vector3 {
                x: 5.0,
                y: 5.0,
                z: 5.0,
            },
            max: Vector3 {
                x: 6.0,
                y: 6.0,
                z: 6.0,
            },
        };
        assert!(!is_obb_intersecting_aabb(&obb, &aabb));
    }

    // is_obb_intersecting_obb
    #[test]
    fn is_obb_intersecting_obb_overlap() {
        let a = identity_obb(1.0, 1.0, 1.0);
        let mut b = identity_obb(1.0, 1.0, 1.0);
        b.center_x = 1.5;
        assert!(is_obb_intersecting_obb(&a, &b));
    }

    #[test]
    fn is_obb_intersecting_obb_no_overlap() {
        let a = identity_obb(1.0, 1.0, 1.0);
        let mut b = identity_obb(1.0, 1.0, 1.0);
        b.center_x = 5.0;
        assert!(!is_obb_intersecting_obb(&a, &b));
    }

    // set_obb
    #[test]
    fn set_obb_assigns() {
        let mut out = ObbLike::default();
        set_obb(&mut out, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(out.center_x, 1.0);
        assert_eq!(out.half_extent_z, 6.0);
        assert_eq!(out.orientation_w, 1.0);
    }

    // transform_obb_by_matrix4
    #[test]
    fn transform_obb_by_matrix4_translation() {
        let obb = identity_obb(1.0, 1.0, 1.0);
        let mut m = Matrix4Like::default();
        m.m[12] = 5.0;
        m.m[13] = 3.0;
        let mut out = ObbLike::default();
        transform_obb_by_matrix4(&mut out, &obb, &m);
        assert!((out.center_x - 5.0).abs() < 1e-4);
        assert!((out.center_y - 3.0).abs() < 1e-4);
        assert!((out.half_extent_x - 1.0).abs() < 1e-4);
    }

    #[test]
    fn transform_obb_by_matrix4_uniform_scale() {
        let obb = identity_obb(1.0, 2.0, 3.0);
        let mut m = Matrix4Like::default();
        m.m[0] = 2.0;
        m.m[5] = 2.0;
        m.m[10] = 2.0;
        let mut out = ObbLike::default();
        transform_obb_by_matrix4(&mut out, &obb, &m);
        assert!((out.half_extent_x - 2.0).abs() < 1e-4);
        assert!((out.half_extent_y - 4.0).abs() < 1e-4);
        assert!((out.half_extent_z - 6.0).abs() < 1e-4);
    }

    #[test]
    fn transform_obb_by_matrix4_alias_safe() {
        let mut obb = ObbLike {
            center_x: 1.0,
            center_y: 2.0,
            center_z: 3.0,
            half_extent_x: 1.0,
            half_extent_y: 1.0,
            half_extent_z: 1.0,
            orientation_x: 0.0,
            orientation_y: 0.0,
            orientation_z: 0.0,
            orientation_w: 1.0,
        };
        let m = Matrix4Like::default();
        transform_obb_by_matrix4(&mut obb, &obb, &m);
        assert!((obb.center_x - 1.0).abs() < 1e-4);
        assert!((obb.center_y - 2.0).abs() < 1e-4);
        assert!((obb.center_z - 3.0).abs() < 1e-4);
    }
}
