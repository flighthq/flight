use crate::{Aabb, BoundingSphere, Matrix4, Obb, Plane, Vector3, create_plane};
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Frustum {
    runtime: EntityRuntimeSlot,
    pub bottom: Plane,
    pub far: Plane,
    pub left: Plane,
    pub near: Plane,
    pub right: Plane,
    pub top: Plane,
}

/// Creates a view frustum as six bounding planes, each with an inward-pointing normal. The
/// planes start at zero (a degenerate frustum) and are populated by set_frustum_from_matrix4.
pub fn create_frustum() -> Frustum {
    let mut out: Frustum = allocate_entity();
    initialize_frustum(
        &mut out,
        create_plane(0.0, 0.0, 0.0, 0.0),
        create_plane(0.0, 0.0, 0.0, 0.0),
        create_plane(0.0, 0.0, 0.0, 0.0),
        create_plane(0.0, 0.0, 0.0, 0.0),
        create_plane(0.0, 0.0, 0.0, 0.0),
        create_plane(0.0, 0.0, 0.0, 0.0),
    );
    return out;
}

pub fn initialize_frustum(
    out: &mut Frustum,
    bottom: Plane,
    far: Plane,
    left: Plane,
    near: Plane,
    right: Plane,
    top: Plane,
) {
    out.bottom = bottom;
    out.far = far;
    out.left = left;
    out.near = near;
    out.right = right;
    out.top = top;
}

/// Computes the 8 world-space corner points of the frustum from the inverse view-projection
/// matrix. The NDC corners (all +/-1 combinations in clip space) are unprojected via
/// `inverse_view_projection`.
///
/// Writes exactly 8 Vector3 values to `out` in the order:
///   0: near-left-bottom  1: near-right-bottom  2: near-right-top  3: near-left-top
///   4: far-left-bottom   5: far-right-bottom   6: far-right-top   7: far-left-top
///
/// If `out` has fewer than 8 elements this function writes only as many as are available.
pub fn get_frustum_corners(out: &mut [Vector3], inverse_view_projection: &Matrix4) {
    let m = &inverse_view_projection.m;
    let ndc_corners: [[f32; 3]; 8] = [
        [-1.0, -1.0, -1.0],
        [1.0, -1.0, -1.0],
        [1.0, 1.0, -1.0],
        [-1.0, 1.0, -1.0],
        [-1.0, -1.0, 1.0],
        [1.0, -1.0, 1.0],
        [1.0, 1.0, 1.0],
        [-1.0, 1.0, 1.0],
    ];
    let len = if out.len() < 8 { out.len() } else { 8 };
    for i in 0..len {
        let nx = ndc_corners[i][0];
        let ny = ndc_corners[i][1];
        let nz = ndc_corners[i][2];
        let x = m[0] * nx + m[4] * ny + m[8] * nz + m[12];
        let y = m[1] * nx + m[5] * ny + m[9] * nz + m[13];
        let z = m[2] * nx + m[6] * ny + m[10] * nz + m[14];
        let w = m[3] * nx + m[7] * ny + m[11] * nz + m[15];
        let inv_w = if w != 0.0 { 1.0 / w } else { 1.0 };
        out[i].x = x * inv_w;
        out[i].y = y * inv_w;
        out[i].z = z * inv_w;
    }
}

/// Returns whether a point lies inside the frustum. A point is inside when its signed
/// distance to every plane is non-negative (each normal points inward).
pub fn is_frustum_containing_point(frustum: &Frustum, point: &Vector3) -> bool {
    return plane_signed_distance(&frustum.left, point) >= 0.0
        && plane_signed_distance(&frustum.right, point) >= 0.0
        && plane_signed_distance(&frustum.bottom, point) >= 0.0
        && plane_signed_distance(&frustum.top, point) >= 0.0
        && plane_signed_distance(&frustum.near, point) >= 0.0
        && plane_signed_distance(&frustum.far, point) >= 0.0;
}

/// Returns whether an axis-aligned bounding box intersects (or is contained by) the frustum.
/// Uses the conservative positive-vertex test: the box is rejected only when it lies entirely
/// on the outside (negative) side of any single plane.
pub fn is_frustum_intersecting_aabb(frustum: &Frustum, aabb: &Aabb) -> bool {
    if aabb.min.x > aabb.max.x || aabb.min.y > aabb.max.y || aabb.min.z > aabb.max.z {
        return false;
    }

    return plane_intersects_aabb(&frustum.left, aabb)
        && plane_intersects_aabb(&frustum.right, aabb)
        && plane_intersects_aabb(&frustum.bottom, aabb)
        && plane_intersects_aabb(&frustum.top, aabb)
        && plane_intersects_aabb(&frustum.near, aabb)
        && plane_intersects_aabb(&frustum.far, aabb);
}

/// Returns whether an oriented bounding box intersects (or is contained by) the frustum.
/// Uses the conservative effective-radius test.
pub fn is_frustum_intersecting_obb(frustum: &Frustum, obb: &Obb) -> bool {
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

    return plane_intersects_obb(
        &frustum.left,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    ) && plane_intersects_obb(
        &frustum.right,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    ) && plane_intersects_obb(
        &frustum.bottom,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    ) && plane_intersects_obb(
        &frustum.top,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    ) && plane_intersects_obb(
        &frustum.near,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    ) && plane_intersects_obb(
        &frustum.far,
        obb,
        ax0,
        ay0,
        az0,
        ax1,
        ay1,
        az1,
        ax2,
        ay2,
        az2,
    );
}

/// Returns whether a bounding sphere intersects (or is contained by) the frustum. A sphere is
/// rejected only when its signed distance to some plane is less than -radius. An empty sphere
/// (negative radius) always returns false.
pub fn is_frustum_intersecting_sphere(frustum: &Frustum, sphere: &BoundingSphere) -> bool {
    if sphere.radius < 0.0 {
        return false;
    }
    let r = sphere.radius;
    return plane_signed_distance(&frustum.left, &sphere.center) >= -r
        && plane_signed_distance(&frustum.right, &sphere.center) >= -r
        && plane_signed_distance(&frustum.bottom, &sphere.center) >= -r
        && plane_signed_distance(&frustum.top, &sphere.center) >= -r
        && plane_signed_distance(&frustum.near, &sphere.center) >= -r
        && plane_signed_distance(&frustum.far, &sphere.center) >= -r;
}

fn plane_intersects_aabb(plane: &Plane, aabb: &Aabb) -> bool {
    let px = if plane.a >= 0.0 {
        aabb.max.x
    } else {
        aabb.min.x
    };
    let py = if plane.b >= 0.0 {
        aabb.max.y
    } else {
        aabb.min.y
    };
    let pz = if plane.c >= 0.0 {
        aabb.max.z
    } else {
        aabb.min.z
    };
    return plane.a * px + plane.b * py + plane.c * pz + plane.d >= 0.0;
}

#[allow(clippy::too_many_arguments)]
fn plane_intersects_obb(
    plane: &Plane,
    obb: &Obb,
    ax0: f32,
    ay0: f32,
    az0: f32,
    ax1: f32,
    ay1: f32,
    az1: f32,
    ax2: f32,
    ay2: f32,
    az2: f32,
) -> bool {
    let dist = plane.a * obb.center_x + plane.b * obb.center_y + plane.c * obb.center_z + plane.d;
    let r = obb.half_extent_x * (plane.a * ax0 + plane.b * ay0 + plane.c * az0).abs()
        + obb.half_extent_y * (plane.a * ax1 + plane.b * ay1 + plane.c * az1).abs()
        + obb.half_extent_z * (plane.a * ax2 + plane.b * ay2 + plane.c * az2).abs();
    return dist >= -r;
}

fn plane_signed_distance(plane: &Plane, point: &Vector3) -> f32 {
    return plane.a * point.x + plane.b * point.y + plane.c * point.z + plane.d;
}

fn set_and_normalize_plane(out: &mut Plane, a: f32, b: f32, c: f32, d: f32) {
    let l = (a * a + b * b + c * c).sqrt();
    if l != 0.0 {
        let inv = 1.0 / l;
        out.a = a * inv;
        out.b = b * inv;
        out.c = c * inv;
        out.d = d * inv;
    } else {
        out.a = a;
        out.b = b;
        out.c = c;
        out.d = d;
    }
}

/// Extracts the six frustum planes from a view-projection Matrix4 (Gribb-Hartmann), each
/// normalized and oriented with an inward-pointing normal.
pub fn set_frustum_from_matrix4(out: &mut Frustum, view_projection: &Matrix4) {
    let m = &view_projection.m;
    let r00 = m[0];
    let r01 = m[4];
    let r02 = m[8];
    let r03 = m[12];
    let r10 = m[1];
    let r11 = m[5];
    let r12 = m[9];
    let r13 = m[13];
    let r20 = m[2];
    let r21 = m[6];
    let r22 = m[10];
    let r23 = m[14];
    let r30 = m[3];
    let r31 = m[7];
    let r32 = m[11];
    let r33 = m[15];

    set_and_normalize_plane(&mut out.left, r30 + r00, r31 + r01, r32 + r02, r33 + r03);
    set_and_normalize_plane(&mut out.right, r30 - r00, r31 - r01, r32 - r02, r33 - r03);
    set_and_normalize_plane(&mut out.bottom, r30 + r10, r31 + r11, r32 + r12, r33 + r13);
    set_and_normalize_plane(&mut out.top, r30 - r10, r31 - r11, r32 - r12, r33 - r13);
    set_and_normalize_plane(&mut out.near, r30 + r20, r31 + r21, r32 + r22, r33 + r23);
    set_and_normalize_plane(&mut out.far, r30 - r20, r31 - r21, r32 - r22, r33 - r23);
}

impl Frustum {
    pub fn new() -> Self {
        return create_frustum();
    }

    pub fn contains_point(&self, point: &Vector3) -> bool {
        return is_frustum_containing_point(self, point);
    }

    pub fn intersects_aabb(&self, aabb: &Aabb) -> bool {
        return is_frustum_intersecting_aabb(self, aabb);
    }

    pub fn intersects_obb(&self, obb: &Obb) -> bool {
        return is_frustum_intersecting_obb(self, obb);
    }

    pub fn intersects_sphere(&self, sphere: &BoundingSphere) -> bool {
        return is_frustum_intersecting_sphere(self, sphere);
    }
}

flight_entity::impl_entity!(Frustum);
