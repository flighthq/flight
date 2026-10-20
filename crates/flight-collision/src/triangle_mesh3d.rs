use crate::types::*;

const BVH_LEAF_SIZE: usize = 4;
const EPSILON: f64 = 1e-12;

// BVH node for acceleration
#[derive(Debug, Clone)]
struct BvhNode {
    min_x: f64, min_y: f64, min_z: f64,
    max_x: f64, max_y: f64, max_z: f64,
    left: Option<Box<BvhNode>>,
    right: Option<Box<BvhNode>>,
    triangles: Vec<usize>, // triangle indices (only for leaf nodes)
}

// Cached BVH data for triangle mesh
#[derive(Debug, Clone)]
struct TriangleMeshCache {
    bvh: Option<BvhNode>,
    version: i64,
}

// Cached BVH data for heightfield
#[derive(Debug, Clone)]
struct HeightfieldCache {
    bvh: Option<BvhNode>,
    version: i64,
}

// --- Triangle Mesh functions ---

pub fn create_collision_triangle_mesh3d(
    points: Vec<f64>,
    indices: Vec<usize>,
) -> CollisionTriangleMesh3D {
    let mut mesh = CollisionTriangleMesh3D::default();
    mesh.points = points;
    mesh.indices = indices;
    return mesh;
}

pub fn invalidate_collision_triangle_mesh3d(mesh: &mut CollisionTriangleMesh3D) {
    mesh.version += 1;
}

pub fn get_collision_triangle_mesh_validation_status3d(
    mesh: &CollisionTriangleMesh3D,
) -> Option<CollisionTestStatus> {
    if mesh.points.len() < 9 || mesh.indices.len() < 3 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let max_index = mesh.points.len() / 3;
    for &idx in &mesh.indices {
        if idx >= max_index {
            return Some(CollisionTestStatus::DegenerateShape);
        }
    }
    return None;
}

pub fn write_collision_triangle_mesh_bounds3d(
    mesh: &CollisionTriangleMesh3D,
    out: &mut CollisionAabb3D,
) {
    let count = mesh.points.len() / 3;
    if count == 0 {
        *out = CollisionAabb3D::default();
        return;
    }
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut min_z = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut max_z = f64::NEG_INFINITY;

    for i in 0..count {
        // Transform point by mesh's position and rotation
        let px = mesh.points[i * 3];
        let py = mesh.points[i * 3 + 1];
        let pz = mesh.points[i * 3 + 2];
        let (wx, wy, wz) = transform_point(px, py, pz, mesh);
        if wx < min_x { min_x = wx; }
        if wy < min_y { min_y = wy; }
        if wz < min_z { min_z = wz; }
        if wx > max_x { max_x = wx; }
        if wy > max_y { max_y = wy; }
        if wz > max_z { max_z = wz; }
    }
    out.min_x = min_x;
    out.min_y = min_y;
    out.min_z = min_z;
    out.max_x = max_x;
    out.max_y = max_y;
    out.max_z = max_z;
}

pub fn collide_collision_triangle_mesh3d(
    mesh: &CollisionTriangleMesh3D,
    shape: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    crate::manifold3d::clear_collision_manifold3d(out);
    let tri_count = mesh.indices.len() / 3;
    if tri_count == 0 { return false; }

    let mut best_depth = 0.0_f64;
    let mut found = false;

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(mesh.points[i0*3], mesh.points[i0*3+1], mesh.points[i0*3+2], mesh);
        let (v1x, v1y, v1z) = transform_point(mesh.points[i1*3], mesh.points[i1*3+1], mesh.points[i1*3+2], mesh);
        let (v2x, v2y, v2z) = transform_point(mesh.points[i2*3], mesh.points[i2*3+1], mesh.points[i2*3+2], mesh);

        let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z],
        });

        let mut manifold = CollisionManifold3D::default();
        if crate::test_collision3d::test_collision3d(&tri_shape, shape, &mut manifold) {
            if !found || manifold.depth > best_depth {
                best_depth = manifold.depth;
                out.overlapping = true;
                out.normal_x = -manifold.normal_x;
                out.normal_y = -manifold.normal_y;
                out.normal_z = -manifold.normal_z;
                out.depth = manifold.depth;
                found = true;
            }
        }
    }
    return found;
}

pub fn raycast_collision_triangle_mesh3d(
    mesh: &CollisionTriangleMesh3D,
    origin_x: f64, origin_y: f64, origin_z: f64,
    direction_x: f64, direction_y: f64, direction_z: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    let tri_count = mesh.indices.len() / 3;
    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(mesh.points[i0*3], mesh.points[i0*3+1], mesh.points[i0*3+2], mesh);
        let (v1x, v1y, v1z) = transform_point(mesh.points[i1*3], mesh.points[i1*3+1], mesh.points[i1*3+2], mesh);
        let (v2x, v2y, v2z) = transform_point(mesh.points[i2*3], mesh.points[i2*3+1], mesh.points[i2*3+2], mesh);

        if let Some((t, nx, ny, nz)) = ray_triangle_intersection(
            origin_x, origin_y, origin_z,
            direction_x, direction_y, direction_z,
            v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z,
        ) {
            if t >= 0.0 && t <= max_fraction && t < best_t {
                best_t = t;
                out.fraction = t;
                out.x = origin_x + direction_x * t;
                out.y = origin_y + direction_y * t;
                out.z = origin_z + direction_z * t;
                out.normal_x = nx;
                out.normal_y = ny;
                out.normal_z = nz;
                hit = true;
            }
        }
    }
    return hit;
}

pub fn sweep_collision_triangle_mesh3d(
    mesh: &CollisionTriangleMesh3D,
    shape: &CollisionShape3D,
    velocity_x: f64, velocity_y: f64, velocity_z: f64,
    out: &mut CollisionTimeOfImpact3D,
) -> bool {
    crate::sweep_collision_shape3d::initialize_collision_time_of_impact3d(out);
    let tri_count = mesh.indices.len() / 3;
    let mut best_t = 2.0_f64;
    let mut hit = false;

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(mesh.points[i0*3], mesh.points[i0*3+1], mesh.points[i0*3+2], mesh);
        let (v1x, v1y, v1z) = transform_point(mesh.points[i1*3], mesh.points[i1*3+1], mesh.points[i1*3+2], mesh);
        let (v2x, v2y, v2z) = transform_point(mesh.points[i2*3], mesh.points[i2*3+1], mesh.points[i2*3+2], mesh);

        let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z],
        });

        let mut toi = CollisionTimeOfImpact3D::default();
        if crate::sweep_collision_shape3d::sweep_collision_shape3d(shape, &tri_shape, velocity_x, velocity_y, velocity_z, &mut toi) {
            if toi.fraction < best_t {
                best_t = toi.fraction;
                *out = toi;
                hit = true;
            }
        }
    }
    return hit;
}

// --- Heightfield functions ---

pub fn create_collision_heightfield3d(
    columns: usize,
    rows: usize,
    heights: Vec<f64>,
    cell_size_x: f64,
    cell_size_z: f64,
) -> CollisionHeightfield3D {
    let mut hf = CollisionHeightfield3D::default();
    hf.columns = columns;
    hf.rows = rows;
    hf.heights = heights;
    hf.cell_size_x = cell_size_x;
    hf.cell_size_z = cell_size_z;
    return hf;
}

pub fn invalidate_collision_heightfield3d(hf: &mut CollisionHeightfield3D) {
    hf.version += 1;
}

pub fn get_collision_heightfield_validation_status3d(
    hf: &CollisionHeightfield3D,
) -> Option<CollisionTestStatus> {
    if hf.columns < 2 || hf.rows < 2 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    if hf.heights.len() < hf.columns * hf.rows {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    return None;
}

pub fn write_collision_heightfield_bounds3d(
    hf: &CollisionHeightfield3D,
    out: &mut CollisionAabb3D,
) {
    if hf.columns < 2 || hf.rows < 2 || hf.heights.is_empty() {
        *out = CollisionAabb3D::default();
        return;
    }
    let mut min_h = f64::INFINITY;
    let mut max_h = f64::NEG_INFINITY;
    for &h in &hf.heights {
        if h < min_h { min_h = h; }
        if h > max_h { max_h = h; }
    }
    let width = (hf.columns - 1) as f64 * hf.cell_size_x;
    let depth = (hf.rows - 1) as f64 * hf.cell_size_z;

    // Transform corners to get world-space bounds
    let corners = [
        (0.0, min_h, 0.0),
        (width, min_h, 0.0),
        (0.0, min_h, depth),
        (width, min_h, depth),
        (0.0, max_h, 0.0),
        (width, max_h, 0.0),
        (0.0, max_h, depth),
        (width, max_h, depth),
    ];

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut min_z = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut max_z = f64::NEG_INFINITY;

    for &(px, py, pz) in &corners {
        let (wx, wy, wz) = transform_point_hf(px, py, pz, hf);
        if wx < min_x { min_x = wx; }
        if wy < min_y { min_y = wy; }
        if wz < min_z { min_z = wz; }
        if wx > max_x { max_x = wx; }
        if wy > max_y { max_y = wy; }
        if wz > max_z { max_z = wz; }
    }

    out.min_x = min_x; out.min_y = min_y; out.min_z = min_z;
    out.max_x = max_x; out.max_y = max_y; out.max_z = max_z;
}

pub fn collide_collision_heightfield3d(
    hf: &CollisionHeightfield3D,
    shape: &CollisionShape3D,
    out: &mut CollisionManifold3D,
) -> bool {
    crate::manifold3d::clear_collision_manifold3d(out);
    if hf.columns < 2 || hf.rows < 2 { return false; }

    let mut best_depth = 0.0_f64;
    let mut found = false;

    for row in 0..(hf.rows - 1) {
        for col in 0..(hf.columns - 1) {
            let triangles = heightfield_cell_triangles(hf, col, row);
            for tri in &triangles {
                let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
                    points: tri.to_vec(),
                });
                let mut manifold = CollisionManifold3D::default();
                if crate::test_collision3d::test_collision3d(&tri_shape, shape, &mut manifold) {
                    if !found || manifold.depth > best_depth {
                        best_depth = manifold.depth;
                        out.overlapping = true;
                        out.normal_x = -manifold.normal_x;
                        out.normal_y = -manifold.normal_y;
                        out.normal_z = -manifold.normal_z;
                        out.depth = manifold.depth;
                        found = true;
                    }
                }
            }
        }
    }
    return found;
}

pub fn raycast_collision_heightfield3d(
    hf: &CollisionHeightfield3D,
    origin_x: f64, origin_y: f64, origin_z: f64,
    direction_x: f64, direction_y: f64, direction_z: f64,
    max_fraction: f64,
    out: &mut CollisionRaycastHit3D,
) -> bool {
    if hf.columns < 2 || hf.rows < 2 { return false; }

    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    for row in 0..(hf.rows - 1) {
        for col in 0..(hf.columns - 1) {
            let triangles = heightfield_cell_triangles(hf, col, row);
            for tri in &triangles {
                let v0x = tri[0]; let v0y = tri[1]; let v0z = tri[2];
                let v1x = tri[3]; let v1y = tri[4]; let v1z = tri[5];
                let v2x = tri[6]; let v2y = tri[7]; let v2z = tri[8];
                if let Some((t, nx, ny, nz)) = ray_triangle_intersection(
                    origin_x, origin_y, origin_z,
                    direction_x, direction_y, direction_z,
                    v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z,
                ) {
                    if t >= 0.0 && t <= max_fraction && t < best_t {
                        best_t = t;
                        out.fraction = t;
                        out.x = origin_x + direction_x * t;
                        out.y = origin_y + direction_y * t;
                        out.z = origin_z + direction_z * t;
                        out.normal_x = nx;
                        out.normal_y = ny;
                        out.normal_z = nz;
                        hit = true;
                    }
                }
            }
        }
    }
    return hit;
}

pub fn sweep_collision_heightfield3d(
    hf: &CollisionHeightfield3D,
    shape: &CollisionShape3D,
    velocity_x: f64, velocity_y: f64, velocity_z: f64,
    out: &mut CollisionTimeOfImpact3D,
) -> bool {
    crate::sweep_collision_shape3d::initialize_collision_time_of_impact3d(out);
    if hf.columns < 2 || hf.rows < 2 { return false; }

    let mut best_t = 2.0_f64;
    let mut hit = false;

    for row in 0..(hf.rows - 1) {
        for col in 0..(hf.columns - 1) {
            let triangles = heightfield_cell_triangles(hf, col, row);
            for tri in &triangles {
                let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
                    points: tri.to_vec(),
                });
                let mut toi = CollisionTimeOfImpact3D::default();
                if crate::sweep_collision_shape3d::sweep_collision_shape3d(
                    shape, &tri_shape, velocity_x, velocity_y, velocity_z, &mut toi,
                ) {
                    if toi.fraction < best_t {
                        best_t = toi.fraction;
                        *out = toi;
                        hit = true;
                    }
                }
            }
        }
    }
    return hit;
}

// --- Helpers ---

fn heightfield_cell_triangles(hf: &CollisionHeightfield3D, col: usize, row: usize) -> [[f64; 9]; 2] {
    let x0 = col as f64 * hf.cell_size_x;
    let x1 = (col + 1) as f64 * hf.cell_size_x;
    let z0 = row as f64 * hf.cell_size_z;
    let z1 = (row + 1) as f64 * hf.cell_size_z;
    let h00 = hf.heights[row * hf.columns + col];
    let h10 = hf.heights[row * hf.columns + col + 1];
    let h01 = hf.heights[(row + 1) * hf.columns + col];
    let h11 = hf.heights[(row + 1) * hf.columns + col + 1];

    let (w00x, w00y, w00z) = transform_point_hf(x0, h00, z0, hf);
    let (w10x, w10y, w10z) = transform_point_hf(x1, h10, z0, hf);
    let (w01x, w01y, w01z) = transform_point_hf(x0, h01, z1, hf);
    let (w11x, w11y, w11z) = transform_point_hf(x1, h11, z1, hf);

    [
        [w00x, w00y, w00z, w10x, w10y, w10z, w01x, w01y, w01z],
        [w10x, w10y, w10z, w11x, w11y, w11z, w01x, w01y, w01z],
    ]
}

fn transform_point(px: f64, py: f64, pz: f64, mesh: &CollisionTriangleMesh3D) -> (f64, f64, f64) {
    let mut out = [0.0_f64; 3];
    rotate_by_quat(px, py, pz, mesh.rotation_x, mesh.rotation_y, mesh.rotation_z, mesh.rotation_w, &mut out);
    (out[0] + mesh.x, out[1] + mesh.y, out[2] + mesh.z)
}

fn transform_point_hf(px: f64, py: f64, pz: f64, hf: &CollisionHeightfield3D) -> (f64, f64, f64) {
    let mut out = [0.0_f64; 3];
    rotate_by_quat(px, py, pz, hf.rotation_x, hf.rotation_y, hf.rotation_z, hf.rotation_w, &mut out);
    (out[0] + hf.x, out[1] + hf.y, out[2] + hf.z)
}

fn rotate_by_quat(
    vx: f64, vy: f64, vz: f64,
    qx: f64, qy: f64, qz: f64, qw: f64,
    out: &mut [f64; 3],
) {
    let tx = qy * vz - qz * vy + qw * vx;
    let ty = qz * vx - qx * vz + qw * vy;
    let tz = qx * vy - qy * vx + qw * vz;
    out[0] = vx + 2.0 * (qy * tz - qz * ty);
    out[1] = vy + 2.0 * (qz * tx - qx * tz);
    out[2] = vz + 2.0 * (qx * ty - qy * tx);
}

/// Moller-Trumbore ray-triangle intersection.
/// Returns Some((t, nx, ny, nz)) or None.
fn ray_triangle_intersection(
    ox: f64, oy: f64, oz: f64,
    dx: f64, dy: f64, dz: f64,
    v0x: f64, v0y: f64, v0z: f64,
    v1x: f64, v1y: f64, v1z: f64,
    v2x: f64, v2y: f64, v2z: f64,
) -> Option<(f64, f64, f64, f64)> {
    let e1x = v1x - v0x;
    let e1y = v1y - v0y;
    let e1z = v1z - v0z;
    let e2x = v2x - v0x;
    let e2y = v2y - v0y;
    let e2z = v2z - v0z;

    let hx = dy * e2z - dz * e2y;
    let hy = dz * e2x - dx * e2z;
    let hz = dx * e2y - dy * e2x;
    let a = e1x * hx + e1y * hy + e1z * hz;
    if a.abs() < EPSILON { return None; }
    let f = 1.0 / a;

    let sx = ox - v0x;
    let sy = oy - v0y;
    let sz = oz - v0z;
    let u = f * (sx * hx + sy * hy + sz * hz);
    if u < 0.0 || u > 1.0 { return None; }

    let qx = sy * e1z - sz * e1y;
    let qy = sz * e1x - sx * e1z;
    let qz = sx * e1y - sy * e1x;
    let v = f * (dx * qx + dy * qy + dz * qz);
    if v < 0.0 || u + v > 1.0 { return None; }

    let t = f * (e2x * qx + e2y * qy + e2z * qz);

    // Triangle normal
    let mut nx = e1y * e2z - e1z * e2y;
    let mut ny = e1z * e2x - e1x * e2z;
    let mut nz = e1x * e2y - e1y * e2x;
    let nlen = (nx * nx + ny * ny + nz * nz).sqrt();
    if nlen > EPSILON {
        nx /= nlen; ny /= nlen; nz /= nlen;
    }
    // Ensure normal points toward ray origin
    if nx * dx + ny * dy + nz * dz > 0.0 {
        nx = -nx; ny = -ny; nz = -nz;
    }

    return Some((t, nx, ny, nz));
}
