use crate::{Aabb, BoundingSphere, Matrix4, Ray3D, Vector3};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq)]
pub struct Obb {
    pub runtime: EntityRuntimeSlot,
    pub center_x: f32,
    pub center_y: f32,
    pub center_z: f32,
    pub half_extent_x: f32,
    pub half_extent_y: f32,
    pub half_extent_z: f32,
    pub orientation_x: f32,
    pub orientation_y: f32,
    pub orientation_z: f32,
    pub orientation_w: f32,
}

pub fn create_obb(
    center_x: f32, center_y: f32, center_z: f32,
    half_extent_x: f32, half_extent_y: f32, half_extent_z: f32,
    orientation_x: f32, orientation_y: f32, orientation_z: f32, orientation_w: f32,
) -> Obb {
    let mut out: Obb = allocate_entity();
    initialize_obb(
        &mut out,
        center_x, center_y, center_z,
        half_extent_x, half_extent_y, half_extent_z,
        orientation_x, orientation_y, orientation_z, orientation_w,
    );
    return out;
}

pub fn initialize_obb(
    out: &mut Obb,
    center_x: f32, center_y: f32, center_z: f32,
    half_extent_x: f32, half_extent_y: f32, half_extent_z: f32,
    orientation_x: f32, orientation_y: f32, orientation_z: f32, orientation_w: f32,
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

/// Writes the point on (or inside) an oriented bounding box closest to `point`.
///
/// Safe when `out` aliases `point` (reads all inputs before writing).
pub fn get_closest_point_on_obb(out: &mut Vector3, obb: &Obb, point: &Vector3) {
    let cx = obb.center_x;
    let cy = obb.center_y;
    let cz = obb.center_z;
    let hx = obb.half_extent_x;
    let hy = obb.half_extent_y;
    let hz = obb.half_extent_z;
    let px = point.x;
    let py = point.y;
    let pz = point.z;

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
    let ax0 = 1.0 - 2.0 * (yy + zz);
    let ay0 = 2.0 * (xy + wz);
    let az0 = 2.0 * (xz - wy);
    let ax1 = 2.0 * (xy - wz);
    let ay1 = 1.0 - 2.0 * (xx + zz);
    let az1 = 2.0 * (yz + wx);
    let ax2 = 2.0 * (xz + wy);
    let ay2 = 2.0 * (yz - wx);
    let az2 = 1.0 - 2.0 * (xx + yy);

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

/// Tests whether a ray intersects an oriented bounding box using the slab method in OBB local space.
pub fn intersect_ray3d_obb(ray: &Ray3D, obb: &Obb) -> f32 {
    let ox = ray.origin.x - obb.center_x;
    let oy = ray.origin.y - obb.center_y;
    let oz = ray.origin.z - obb.center_z;
    let dx = ray.direction.x;
    let dy = ray.direction.y;
    let dz = ray.direction.z;

    if dx * dx + dy * dy + dz * dz == 0.0 { return -1.0; }

    let hx = obb.half_extent_x;
    let hy = obb.half_extent_y;
    let hz = obb.half_extent_z;

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
    let ax0 = 1.0 - 2.0 * (yy + zz);
    let ay0 = 2.0 * (xy + wz);
    let az0 = 2.0 * (xz - wy);
    let ax1 = 2.0 * (xy - wz);
    let ay1 = 1.0 - 2.0 * (xx + zz);
    let az1 = 2.0 * (yz + wx);
    let ax2 = 2.0 * (xz + wy);
    let ay2 = 2.0 * (yz - wx);
    let az2 = 1.0 - 2.0 * (xx + yy);

    let origin0 = ox * ax0 + oy * ay0 + oz * az0;
    let origin1 = ox * ax1 + oy * ay1 + oz * az1;
    let origin2 = ox * ax2 + oy * ay2 + oz * az2;
    let direction0 = dx * ax0 + dy * ay0 + dz * az0;
    let direction1 = dx * ax1 + dy * ay1 + dz * az1;
    let direction2 = dx * ax2 + dy * ay2 + dz * az2;

    let mut t_min: f32 = 0.0;
    let mut t_max: f32 = f32::INFINITY;

    if direction0 != 0.0 {
        let inv_d = 1.0 / direction0;
        let mut t1 = (-hx - origin0) * inv_d;
        let mut t2 = (hx - origin0) * inv_d;
        if t1 > t2 { let swap = t1; t1 = t2; t2 = swap; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if origin0 < -hx || origin0 > hx {
        return -1.0;
    }

    if direction1 != 0.0 {
        let inv_d = 1.0 / direction1;
        let mut t1 = (-hy - origin1) * inv_d;
        let mut t2 = (hy - origin1) * inv_d;
        if t1 > t2 { let swap = t1; t1 = t2; t2 = swap; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if origin1 < -hy || origin1 > hy {
        return -1.0;
    }

    if direction2 != 0.0 {
        let inv_d = 1.0 / direction2;
        let mut t1 = (-hz - origin2) * inv_d;
        let mut t2 = (hz - origin2) * inv_d;
        if t1 > t2 { let swap = t1; t1 = t2; t2 = swap; }
        t_min = t_min.max(t1);
        t_max = t_max.min(t2);
        if t_min > t_max { return -1.0; }
    } else if origin2 < -hz || origin2 > hz {
        return -1.0;
    }

    return t_min;
}

/// Returns whether an OBB overlaps an AABB using the Separating Axis Theorem with 15 axes.
pub fn is_obb_intersecting_aabb(obb: &Obb, aabb: &Aabb) -> bool {
    if aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z {
        return false;
    }

    let acx = (aabb.min.x + aabb.max.x) * 0.5;
    let acy = (aabb.min.y + aabb.max.y) * 0.5;
    let acz = (aabb.min.z + aabb.max.z) * 0.5;
    let ahx = (aabb.max.x - aabb.min.x) * 0.5;
    let ahy = (aabb.max.y - aabb.min.y) * 0.5;
    let ahz = (aabb.max.z - aabb.min.z) * 0.5;

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
    let ax0 = 1.0 - 2.0 * (yy + zz);
    let ay0 = 2.0 * (xy + wz);
    let az0 = 2.0 * (xz - wy);
    let ax1 = 2.0 * (xy - wz);
    let ay1 = 1.0 - 2.0 * (xx + zz);
    let az1 = 2.0 * (yz + wx);
    let ax2 = 2.0 * (xz + wy);
    let ay2 = 2.0 * (yz - wx);
    let az2 = 1.0 - 2.0 * (xx + yy);

    let tx = acx - obb.center_x;
    let ty = acy - obb.center_y;
    let tz = acz - obb.center_z;

    return !obb_sat_separated(
        tx, ty, tz,
        ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2,
        obb.half_extent_x, obb.half_extent_y, obb.half_extent_z,
        1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0,
        ahx, ahy, ahz,
    );
}

/// Returns whether two oriented bounding boxes overlap using the Separating Axis Theorem.
pub fn is_obb_intersecting_obb(a: &Obb, b: &Obb) -> bool {
    let aqx = a.orientation_x;
    let aqy = a.orientation_y;
    let aqz = a.orientation_z;
    let aqw = a.orientation_w;
    let axx = aqx * aqx;
    let ayy = aqy * aqy;
    let azz = aqz * aqz;
    let axy = aqx * aqy;
    let axz = aqx * aqz;
    let ayz = aqy * aqz;
    let awx = aqw * aqx;
    let awy = aqw * aqy;
    let awz = aqw * aqz;
    let ax0 = 1.0 - 2.0 * (ayy + azz);
    let ay0 = 2.0 * (axy + awz);
    let az0 = 2.0 * (axz - awy);
    let ax1 = 2.0 * (axy - awz);
    let ay1 = 1.0 - 2.0 * (axx + azz);
    let az1 = 2.0 * (ayz + awx);
    let ax2 = 2.0 * (axz + awy);
    let ay2 = 2.0 * (ayz - awx);
    let az2 = 1.0 - 2.0 * (axx + ayy);

    let bqx = b.orientation_x;
    let bqy = b.orientation_y;
    let bqz = b.orientation_z;
    let bqw = b.orientation_w;
    let bxx = bqx * bqx;
    let byy = bqy * bqy;
    let bzz = bqz * bqz;
    let bxy = bqx * bqy;
    let bxz = bqx * bqz;
    let byz = bqy * bqz;
    let bwx = bqw * bqx;
    let bwy = bqw * bqy;
    let bwz = bqw * bqz;
    let bx0 = 1.0 - 2.0 * (byy + bzz);
    let by0 = 2.0 * (bxy + bwz);
    let bz0 = 2.0 * (bxz - bwy);
    let bx1 = 2.0 * (bxy - bwz);
    let by1 = 1.0 - 2.0 * (bxx + bzz);
    let bz1 = 2.0 * (byz + bwx);
    let bx2 = 2.0 * (bxz + bwy);
    let by2 = 2.0 * (byz - bwx);
    let bz2 = 1.0 - 2.0 * (bxx + byy);

    let tx = b.center_x - a.center_x;
    let ty = b.center_y - a.center_y;
    let tz = b.center_z - a.center_z;

    return !obb_sat_separated(
        tx, ty, tz,
        ax0, ay0, az0, ax1, ay1, az1, ax2, ay2, az2,
        a.half_extent_x, a.half_extent_y, a.half_extent_z,
        bx0, by0, bz0, bx1, by1, bz1, bx2, by2, bz2,
        b.half_extent_x, b.half_extent_y, b.half_extent_z,
    );
}

/// Returns whether an OBB overlaps a bounding sphere. An empty sphere (negative radius) does
/// not intersect.
pub fn is_obb_intersecting_sphere(obb: &Obb, sphere: &BoundingSphere) -> bool {
    if sphere.radius < 0.0 { return false; }
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
    let ax0 = 1.0 - 2.0 * (yy + zz);
    let ay0 = 2.0 * (xy + wz);
    let az0 = 2.0 * (xz - wy);
    let ax1 = 2.0 * (xy - wz);
    let ay1 = 1.0 - 2.0 * (xx + zz);
    let az1 = 2.0 * (yz + wx);
    let ax2 = 2.0 * (xz + wy);
    let ay2 = 2.0 * (yz - wx);
    let az2 = 1.0 - 2.0 * (xx + yy);
    let dx = sphere.center.x - obb.center_x;
    let dy = sphere.center.y - obb.center_y;
    let dz = sphere.center.z - obb.center_z;
    let lx = (ax0 * dx + ay0 * dy + az0 * dz).clamp(-obb.half_extent_x, obb.half_extent_x);
    let ly = (ax1 * dx + ay1 * dy + az1 * dz).clamp(-obb.half_extent_y, obb.half_extent_y);
    let lz = (ax2 * dx + ay2 * dy + az2 * dz).clamp(-obb.half_extent_z, obb.half_extent_z);
    let cx = ax0 * lx + ax1 * ly + ax2 * lz;
    let cy = ay0 * lx + ay1 * ly + ay2 * lz;
    let cz = az0 * lx + az1 * ly + az2 * lz;
    let ex = dx - cx;
    let ey = dy - cy;
    let ez = dz - cz;
    return ex * ex + ey * ey + ez * ez <= sphere.radius * sphere.radius;
}

#[allow(clippy::too_many_arguments)]
fn obb_sat_separated(
    tx: f32, ty: f32, tz: f32,
    ax0: f32, ay0: f32, az0: f32,
    ax1: f32, ay1: f32, az1: f32,
    ax2: f32, ay2: f32, az2: f32,
    hax: f32, hay: f32, haz: f32,
    bx0: f32, by0: f32, bz0: f32,
    bx1: f32, by1: f32, bz1: f32,
    bx2: f32, by2: f32, bz2: f32,
    hbx: f32, hby: f32, hbz: f32,
) -> bool {
    for axis in 0..15_u32 {
        let (lx, ly, lz) = match axis {
            0 => (ax0, ay0, az0),
            1 => (ax1, ay1, az1),
            2 => (ax2, ay2, az2),
            3 => (bx0, by0, bz0),
            4 => (bx1, by1, bz1),
            5 => (bx2, by2, bz2),
            6 => (ay0 * bz0 - az0 * by0, az0 * bx0 - ax0 * bz0, ax0 * by0 - ay0 * bx0),
            7 => (ay0 * bz1 - az0 * by1, az0 * bx1 - ax0 * bz1, ax0 * by1 - ay0 * bx1),
            8 => (ay0 * bz2 - az0 * by2, az0 * bx2 - ax0 * bz2, ax0 * by2 - ay0 * bx2),
            9 => (ay1 * bz0 - az1 * by0, az1 * bx0 - ax1 * bz0, ax1 * by0 - ay1 * bx0),
            10 => (ay1 * bz1 - az1 * by1, az1 * bx1 - ax1 * bz1, ax1 * by1 - ay1 * bx1),
            11 => (ay1 * bz2 - az1 * by2, az1 * bx2 - ax1 * bz2, ax1 * by2 - ay1 * bx2),
            12 => (ay2 * bz0 - az2 * by0, az2 * bx0 - ax2 * bz0, ax2 * by0 - ay2 * bx0),
            13 => (ay2 * bz1 - az2 * by1, az2 * bx1 - ax2 * bz1, ax2 * by1 - ay2 * bx1),
            _ => (ay2 * bz2 - az2 * by2, az2 * bx2 - ax2 * bz2, ax2 * by2 - ay2 * bx2),
        };

        let len_sq = lx * lx + ly * ly + lz * lz;
        if len_sq < 1e-10 { continue; }
        let d = (tx * lx + ty * ly + tz * lz).abs();
        let p_a =
            (ax0 * lx + ay0 * ly + az0 * lz).abs() * hax +
            (ax1 * lx + ay1 * ly + az1 * lz).abs() * hay +
            (ax2 * lx + ay2 * ly + az2 * lz).abs() * haz;
        let p_b =
            (bx0 * lx + by0 * ly + bz0 * lz).abs() * hbx +
            (bx1 * lx + by1 * ly + bz1 * lz).abs() * hby +
            (bx2 * lx + by2 * ly + bz2 * lz).abs() * hbz;
        if d > p_a + p_b { return true; }
    }
    return false;
}

/// Sets all fields of an oriented bounding box in place.
pub fn set_obb(
    out: &mut Obb,
    center_x: f32, center_y: f32, center_z: f32,
    half_extent_x: f32, half_extent_y: f32, half_extent_z: f32,
    orientation_x: f32, orientation_y: f32, orientation_z: f32, orientation_w: f32,
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

/// Transforms an OBB by a Matrix4. Safe when `out` aliases `obb`.
pub fn transform_obb_by_matrix4(out: &mut Obb, obb: &Obb, m: &Matrix4) {
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

    let r00 = if sx > 0.0 { mm[0] / sx } else { 1.0 };
    let r10 = if sx > 0.0 { mm[1] / sx } else { 0.0 };
    let r20 = if sx > 0.0 { mm[2] / sx } else { 0.0 };
    let r01 = if sy > 0.0 { mm[4] / sy } else { 0.0 };
    let r11 = if sy > 0.0 { mm[5] / sy } else { 1.0 };
    let r21 = if sy > 0.0 { mm[6] / sy } else { 0.0 };
    let r02 = if sz > 0.0 { mm[8] / sz } else { 0.0 };
    let r12 = if sz > 0.0 { mm[9] / sz } else { 0.0 };
    let r22 = if sz > 0.0 { mm[10] / sz } else { 1.0 };

    let mqw: f32;
    let mqx: f32;
    let mqy: f32;
    let mqz: f32;
    let trace = r00 + r11 + r22;
    if trace > 0.0 {
        let s = 0.5 / (trace + 1.0).sqrt();
        mqw = 0.25 / s;
        mqx = (r21 - r12) * s;
        mqy = (r02 - r20) * s;
        mqz = (r10 - r01) * s;
    } else if r00 > r11 && r00 > r22 {
        let s = 2.0 * (1.0 + r00 - r11 - r22).sqrt();
        mqw = (r21 - r12) / s;
        mqx = 0.25 * s;
        mqy = (r10 + r01) / s;
        mqz = (r20 + r02) / s;
    } else if r11 > r22 {
        let s = 2.0 * (1.0 + r11 - r00 - r22).sqrt();
        mqw = (r02 - r20) / s;
        mqx = (r10 + r01) / s;
        mqy = 0.25 * s;
        mqz = (r21 + r12) / s;
    } else {
        let s = 2.0 * (1.0 + r22 - r00 - r11).sqrt();
        mqw = (r10 - r01) / s;
        mqx = (r20 + r02) / s;
        mqy = (r21 + r12) / s;
        mqz = 0.25 * s;
    }

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

impl Default for Obb {
    fn default() -> Self {
        return Obb {
            runtime: EntityRuntimeSlot::default(),
            center_x: 0.0,
            center_y: 0.0,
            center_z: 0.0,
            half_extent_x: 0.0,
            half_extent_y: 0.0,
            half_extent_z: 0.0,
            orientation_x: 0.0,
            orientation_y: 0.0,
            orientation_z: 0.0,
            orientation_w: 1.0,
        };
    }
}
