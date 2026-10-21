use crate::types::*;

const BVH_LEAF_SIZE: usize = 4;
const CONTACT_DEPTH_EPSILON: f32 = 1e-7;
const CONTACT_NORMAL_ALIGNMENT: f32 = 0.98;
const CONTACT_POINT_EPSILON_SQUARED: f32 = 1e-12;
const EPSILON: f32 = 1e-12;

#[derive(Clone, Copy)]
struct CollisionTriangleContactCandidate3D {
    x: f32,
    y: f32,
    z: f32,
    depth: f32,
    feature_id: i64,
}

struct CollisionTriangleContactAccumulator3D {
    candidates: Vec<CollisionTriangleContactCandidate3D>,
    best_depth: f32,
    best_normal: [f32; 3],
}

// BVH node for acceleration
#[derive(Debug, Clone)]
struct BvhNode {
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
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

fn create_collision_triangle_contact_accumulator3d() -> CollisionTriangleContactAccumulator3D {
    CollisionTriangleContactAccumulator3D {
        candidates: Vec::new(),
        best_depth: f32::NEG_INFINITY,
        best_normal: [0.0; 3],
    }
}

fn append_collision_triangle_contact_candidate3d(
    accumulator: &mut CollisionTriangleContactAccumulator3D,
    candidate: CollisionTriangleContactCandidate3D,
) {
    for existing in &mut accumulator.candidates {
        let dx = existing.x - candidate.x;
        let dy = existing.y - candidate.y;
        let dz = existing.z - candidate.z;
        if dx * dx + dy * dy + dz * dz <= CONTACT_POINT_EPSILON_SQUARED {
            if candidate.depth > existing.depth {
                existing.depth = candidate.depth;
            }
            if candidate.feature_id < existing.feature_id {
                existing.feature_id = candidate.feature_id;
            }
            return;
        }
    }
    accumulator.candidates.push(candidate);
}

fn include_collision_triangle_contact_manifold3d(
    accumulator: &mut CollisionTriangleContactAccumulator3D,
    triangle: usize,
    manifold: &CollisionContactManifold3D,
) {
    let mut depth = 0.0_f32;
    for point in &manifold.points[..manifold.point_count] {
        depth = depth.max(point.depth);
    }
    let alignment = manifold.normal_x * accumulator.best_normal[0]
        + manifold.normal_y * accumulator.best_normal[1]
        + manifold.normal_z * accumulator.best_normal[2];
    if accumulator.best_depth == f32::NEG_INFINITY
        || (depth > accumulator.best_depth + CONTACT_DEPTH_EPSILON
            && alignment < CONTACT_NORMAL_ALIGNMENT)
    {
        accumulator.best_depth = depth;
        accumulator.best_normal = [manifold.normal_x, manifold.normal_y, manifold.normal_z];
        accumulator.candidates.clear();
    }
    let selected_alignment = manifold.normal_x * accumulator.best_normal[0]
        + manifold.normal_y * accumulator.best_normal[1]
        + manifold.normal_z * accumulator.best_normal[2];
    if selected_alignment < CONTACT_NORMAL_ALIGNMENT {
        return;
    }
    if depth > accumulator.best_depth {
        accumulator.best_depth = depth;
    }
    for (index, point) in manifold.points[..manifold.point_count].iter().enumerate() {
        accumulator.append_candidate(CollisionTriangleContactCandidate3D {
            x: point.x,
            y: point.y,
            z: point.z,
            depth: point.depth,
            feature_id: (triangle * MAX_COLLISION_CONTACT_POINTS_3D + index) as i64,
        });
    }
}

fn write_reduced_collision_triangle_contacts3d(
    accumulator: CollisionTriangleContactAccumulator3D,
    out: &mut CollisionContactManifold3D,
) -> bool {
    if accumulator.best_depth == f32::NEG_INFINITY {
        return false;
    }
    out.overlapping = true;
    out.normal_x = accumulator.best_normal[0];
    out.normal_y = accumulator.best_normal[1];
    out.normal_z = accumulator.best_normal[2];
    if accumulator.candidates.is_empty() {
        return true;
    }

    let mut selected = Vec::with_capacity(MAX_COLLISION_CONTACT_POINTS_3D);
    let mut first = 0;
    for index in 1..accumulator.candidates.len() {
        let candidate = accumulator.candidates[index];
        let current = accumulator.candidates[first];
        if candidate.x < current.x
            || (candidate.x == current.x && candidate.y < current.y)
            || (candidate.x == current.x && candidate.y == current.y && candidate.z < current.z)
        {
            first = index;
        }
    }
    selected.push(first);
    while selected.len() < MAX_COLLISION_CONTACT_POINTS_3D.min(accumulator.candidates.len()) {
        let mut best = None;
        let mut best_distance = -1.0_f32;
        for index in 0..accumulator.candidates.len() {
            if selected.contains(&index) {
                continue;
            }
            let mut minimum_distance = f32::INFINITY;
            for &chosen in &selected {
                let dx = accumulator.candidates[index].x - accumulator.candidates[chosen].x;
                let dy = accumulator.candidates[index].y - accumulator.candidates[chosen].y;
                let dz = accumulator.candidates[index].z - accumulator.candidates[chosen].z;
                minimum_distance = minimum_distance.min(dx * dx + dy * dy + dz * dz);
            }
            if minimum_distance > best_distance {
                best_distance = minimum_distance;
                best = Some(index);
            }
        }
        let Some(best) = best else {
            break;
        };
        selected.push(best);
    }
    out.point_count = selected.len();
    for (target, source) in out.points.iter_mut().zip(
        selected
            .into_iter()
            .map(|index| accumulator.candidates[index]),
    ) {
        target.x = source.x;
        target.y = source.y;
        target.z = source.z;
        target.depth = source.depth;
        target.feature_id = source.feature_id;
    }
    true
}

// --- Triangle Mesh functions ---

pub fn create_collision_heightfield3d(
    columns: usize,
    rows: usize,
    heights: Vec<f32>,
    cell_size_x: f32,
    cell_size_z: f32,
) -> CollisionHeightfield3D {
    let mut out: CollisionHeightfield3D = flight_entity::allocate_entity();
    initialize_collision_heightfield3d(&mut out, columns, rows, heights, cell_size_x, cell_size_z);
    return out;
}

pub fn create_collision_triangle_mesh3d(
    points: Vec<f32>,
    indices: Vec<usize>,
) -> CollisionTriangleMesh3D {
    let mut out: CollisionTriangleMesh3D = flight_entity::allocate_entity();
    initialize_collision_triangle_mesh3d(&mut out, points, indices);
    return out;
}

pub fn initialize_collision_heightfield3d(
    out: &mut CollisionHeightfield3D,
    columns: usize,
    rows: usize,
    heights: Vec<f32>,
    cell_size_x: f32,
    cell_size_z: f32,
) {
    out.columns = columns;
    out.rows = rows;
    out.heights = heights;
    out.cell_size_x = cell_size_x;
    out.cell_size_z = cell_size_z;
    out.version = 0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.rotation_x = 0.0;
    out.rotation_y = 0.0;
    out.rotation_z = 0.0;
    out.rotation_w = 1.0;
}

pub fn initialize_collision_triangle_mesh3d(
    out: &mut CollisionTriangleMesh3D,
    points: Vec<f32>,
    indices: Vec<usize>,
) {
    out.points = points;
    out.indices = indices;
    out.version = 0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.rotation_x = 0.0;
    out.rotation_y = 0.0;
    out.rotation_z = 0.0;
    out.rotation_w = 1.0;
}

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn collide_collision_heightfield3d(
    out: &mut CollisionContactManifold3D,
    registry: &CollisionRegistry3D,
    convex: &CollisionShape3D,
    heightfield: &CollisionHeightfield3D,
) -> bool {
    crate::contact_manifold3d::clear_collision_contact_manifold3d(out);
    if heightfield.columns < 2 || heightfield.rows < 2 {
        return false;
    }

    let mut contacts = CollisionTriangleContactAccumulator3D::new();
    let mut triangle = 0;

    for row in 0..(heightfield.rows - 1) {
        for col in 0..(heightfield.columns - 1) {
            let triangles = heightfield_cell_triangles(heightfield, col, row);
            for tri in &triangles {
                let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
                    points: tri.to_vec(),
                });
                let mut manifold = crate::contact_manifold3d::create_collision_contact_manifold3d();
                if crate::collide_contact_manifold3d::collide_contact_manifold3d(
                    registry,
                    convex,
                    &tri_shape,
                    &mut manifold,
                ) {
                    contacts.include_manifold(triangle, &manifold);
                }
                triangle += 1;
            }
        }
    }
    return contacts.write_reduced(out);
}

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn collide_collision_triangle_mesh3d(
    out: &mut CollisionContactManifold3D,
    registry: &CollisionRegistry3D,
    convex: &CollisionShape3D,
    mesh: &CollisionTriangleMesh3D,
) -> bool {
    crate::contact_manifold3d::clear_collision_contact_manifold3d(out);
    let tri_count = mesh.indices.len() / 3;
    if tri_count == 0 {
        return false;
    }

    let mut contacts = CollisionTriangleContactAccumulator3D::new();

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(
            mesh.points[i0 * 3],
            mesh.points[i0 * 3 + 1],
            mesh.points[i0 * 3 + 2],
            mesh,
        );
        let (v1x, v1y, v1z) = transform_point(
            mesh.points[i1 * 3],
            mesh.points[i1 * 3 + 1],
            mesh.points[i1 * 3 + 2],
            mesh,
        );
        let (v2x, v2y, v2z) = transform_point(
            mesh.points[i2 * 3],
            mesh.points[i2 * 3 + 1],
            mesh.points[i2 * 3 + 2],
            mesh,
        );

        let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z],
        });

        let mut manifold = crate::contact_manifold3d::create_collision_contact_manifold3d();
        if crate::collide_contact_manifold3d::collide_contact_manifold3d(
            registry,
            convex,
            &tri_shape,
            &mut manifold,
        ) {
            contacts.include_manifold(ti, &manifold);
        }
    }
    return contacts.write_reduced(out);
}

pub fn get_collision_heightfield_validation_status3d(
    heightfield: &CollisionHeightfield3D,
) -> Option<CollisionTestStatus> {
    if heightfield.columns < 2 || heightfield.rows < 2 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    if heightfield.heights.len() < heightfield.columns * heightfield.rows {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    return None;
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

fn heightfield_cell_triangles(
    heightfield: &CollisionHeightfield3D,
    col: usize,
    row: usize,
) -> [[f32; 9]; 2] {
    let x0 = col as f32 * heightfield.cell_size_x;
    let x1 = (col + 1) as f32 * heightfield.cell_size_x;
    let z0 = row as f32 * heightfield.cell_size_z;
    let z1 = (row + 1) as f32 * heightfield.cell_size_z;
    let h00 = heightfield.heights[row * heightfield.columns + col];
    let h10 = heightfield.heights[row * heightfield.columns + col + 1];
    let h01 = heightfield.heights[(row + 1) * heightfield.columns + col];
    let h11 = heightfield.heights[(row + 1) * heightfield.columns + col + 1];

    let (w00x, w00y, w00z) = transform_point_hf(x0, h00, z0, heightfield);
    let (w10x, w10y, w10z) = transform_point_hf(x1, h10, z0, heightfield);
    let (w01x, w01y, w01z) = transform_point_hf(x0, h01, z1, heightfield);
    let (w11x, w11y, w11z) = transform_point_hf(x1, h11, z1, heightfield);

    [
        [w00x, w00y, w00z, w11x, w11y, w11z, w10x, w10y, w10z],
        [w00x, w00y, w00z, w01x, w01y, w01z, w11x, w11y, w11z],
    ]
}

pub fn invalidate_collision_heightfield3d(heightfield: &mut CollisionHeightfield3D) {
    heightfield.version += 1;
}

pub fn invalidate_collision_triangle_mesh3d(mesh: &mut CollisionTriangleMesh3D) {
    mesh.version += 1;
}

/// Moller-Trumbore ray-triangle intersection.
/// Returns Some((t, nx, ny, nz)) or None.
fn ray_triangle_intersection(
    ox: f32,
    oy: f32,
    oz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    v0x: f32,
    v0y: f32,
    v0z: f32,
    v1x: f32,
    v1y: f32,
    v1z: f32,
    v2x: f32,
    v2y: f32,
    v2z: f32,
) -> Option<(f32, f32, f32, f32)> {
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
    if a.abs() < EPSILON {
        return None;
    }
    let f = 1.0 / a;

    let sx = ox - v0x;
    let sy = oy - v0y;
    let sz = oz - v0z;
    let u = f * (sx * hx + sy * hy + sz * hz);
    if u < 0.0 || u > 1.0 {
        return None;
    }

    let qx = sy * e1z - sz * e1y;
    let qy = sz * e1x - sx * e1z;
    let qz = sx * e1y - sy * e1x;
    let v = f * (dx * qx + dy * qy + dz * qz);
    if v < 0.0 || u + v > 1.0 {
        return None;
    }

    let t = f * (e2x * qx + e2y * qy + e2z * qz);

    // Triangle normal
    let mut nx = e1y * e2z - e1z * e2y;
    let mut ny = e1z * e2x - e1x * e2z;
    let mut nz = e1x * e2y - e1y * e2x;
    let nlen = (nx * nx + ny * ny + nz * nz).sqrt();
    if nlen > EPSILON {
        nx /= nlen;
        ny /= nlen;
        nz /= nlen;
    }
    // Ensure normal points toward ray origin
    if nx * dx + ny * dy + nz * dz > 0.0 {
        nx = -nx;
        ny = -ny;
        nz = -nz;
    }

    return Some((t, nx, ny, nz));
}

// flight-lint: allow(conform-params) D9 requires caller-owned outputs first; max_fraction remains optional after source inputs
pub fn raycast_collision_heightfield3d(
    out: &mut CollisionRaycastHit3D,
    heightfield: &CollisionHeightfield3D,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
) -> bool {
    let max_fraction = max_fraction.unwrap_or(f32::INFINITY);
    if heightfield.columns < 2 || heightfield.rows < 2 {
        return false;
    }

    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    for row in 0..(heightfield.rows - 1) {
        for col in 0..(heightfield.columns - 1) {
            let triangles = heightfield_cell_triangles(heightfield, col, row);
            for tri in &triangles {
                let v0x = tri[0];
                let v0y = tri[1];
                let v0z = tri[2];
                let v1x = tri[3];
                let v1y = tri[4];
                let v1z = tri[5];
                let v2x = tri[6];
                let v2y = tri[7];
                let v2z = tri[8];
                if let Some((t, nx, ny, nz)) = ray_triangle_intersection(
                    origin_x,
                    origin_y,
                    origin_z,
                    direction_x,
                    direction_y,
                    direction_z,
                    v0x,
                    v0y,
                    v0z,
                    v1x,
                    v1y,
                    v1z,
                    v2x,
                    v2y,
                    v2z,
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

// flight-lint: allow(conform-params) D9 requires caller-owned outputs first; max_fraction remains optional after source inputs
pub fn raycast_collision_triangle_mesh3d(
    out: &mut CollisionRaycastHit3D,
    mesh: &CollisionTriangleMesh3D,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: Option<f32>,
) -> bool {
    let max_fraction = max_fraction.unwrap_or(f32::INFINITY);
    let tri_count = mesh.indices.len() / 3;
    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(
            mesh.points[i0 * 3],
            mesh.points[i0 * 3 + 1],
            mesh.points[i0 * 3 + 2],
            mesh,
        );
        let (v1x, v1y, v1z) = transform_point(
            mesh.points[i1 * 3],
            mesh.points[i1 * 3 + 1],
            mesh.points[i1 * 3 + 2],
            mesh,
        );
        let (v2x, v2y, v2z) = transform_point(
            mesh.points[i2 * 3],
            mesh.points[i2 * 3 + 1],
            mesh.points[i2 * 3 + 2],
            mesh,
        );

        if let Some((t, nx, ny, nz)) = ray_triangle_intersection(
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            v0x,
            v0y,
            v0z,
            v1x,
            v1y,
            v1z,
            v2x,
            v2y,
            v2z,
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

fn rotate_by_quat(
    vx: f32,
    vy: f32,
    vz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
    out: &mut [f32; 3],
) {
    let tx = qy * vz - qz * vy + qw * vx;
    let ty = qz * vx - qx * vz + qw * vy;
    let tz = qx * vy - qy * vx + qw * vz;
    out[0] = vx + 2.0 * (qy * tz - qz * ty);
    out[1] = vy + 2.0 * (qz * tx - qx * tz);
    out[2] = vz + 2.0 * (qx * ty - qy * tx);
}

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn sweep_collision_heightfield3d(
    out: &mut CollisionTimeOfImpact3D,
    registry: &CollisionRegistry3D,
    convex: &CollisionShape3D,
    delta_x: f32,
    delta_y: f32,
    delta_z: f32,
    heightfield: &CollisionHeightfield3D,
    max_fraction: Option<f32>,
) -> bool {
    crate::sweep_collision_shape3d::initialize_collision_time_of_impact3d(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    if heightfield.columns < 2 || heightfield.rows < 2 {
        return false;
    }

    let mut best_t = max_fraction;
    let mut hit = false;

    for row in 0..(heightfield.rows - 1) {
        for col in 0..(heightfield.columns - 1) {
            let triangles = heightfield_cell_triangles(heightfield, col, row);
            for tri in &triangles {
                let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
                    points: tri.to_vec(),
                });
                let mut toi = CollisionTimeOfImpact3D::default();
                if crate::sweep_collision_shape3d::sweep_collision_shape3d(
                    &mut toi,
                    registry,
                    convex,
                    delta_x,
                    delta_y,
                    delta_z,
                    &tri_shape,
                    0.0,
                    0.0,
                    0.0,
                    Some(best_t),
                ) {
                    if !hit || toi.fraction < best_t {
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

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn sweep_collision_triangle_mesh3d(
    out: &mut CollisionTimeOfImpact3D,
    registry: &CollisionRegistry3D,
    convex: &CollisionShape3D,
    delta_x: f32,
    delta_y: f32,
    delta_z: f32,
    mesh: &CollisionTriangleMesh3D,
    max_fraction: Option<f32>,
) -> bool {
    crate::sweep_collision_shape3d::initialize_collision_time_of_impact3d(out);
    let max_fraction = max_fraction.unwrap_or(1.0);
    let tri_count = mesh.indices.len() / 3;
    let mut best_t = max_fraction;
    let mut hit = false;

    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];

        let (v0x, v0y, v0z) = transform_point(
            mesh.points[i0 * 3],
            mesh.points[i0 * 3 + 1],
            mesh.points[i0 * 3 + 2],
            mesh,
        );
        let (v1x, v1y, v1z) = transform_point(
            mesh.points[i1 * 3],
            mesh.points[i1 * 3 + 1],
            mesh.points[i1 * 3 + 2],
            mesh,
        );
        let (v2x, v2y, v2z) = transform_point(
            mesh.points[i2 * 3],
            mesh.points[i2 * 3 + 1],
            mesh.points[i2 * 3 + 2],
            mesh,
        );

        let tri_shape = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![v0x, v0y, v0z, v1x, v1y, v1z, v2x, v2y, v2z],
        });

        let mut toi = CollisionTimeOfImpact3D::default();
        if crate::sweep_collision_shape3d::sweep_collision_shape3d(
            &mut toi,
            registry,
            convex,
            delta_x,
            delta_y,
            delta_z,
            &tri_shape,
            0.0,
            0.0,
            0.0,
            Some(best_t),
        ) {
            if !hit || toi.fraction < best_t {
                best_t = toi.fraction;
                *out = toi;
                hit = true;
            }
        }
    }
    return hit;
}

fn transform_point(px: f32, py: f32, pz: f32, mesh: &CollisionTriangleMesh3D) -> (f32, f32, f32) {
    let mut out = [0.0_f32; 3];
    rotate_by_quat(
        px,
        py,
        pz,
        mesh.rotation_x,
        mesh.rotation_y,
        mesh.rotation_z,
        mesh.rotation_w,
        &mut out,
    );
    (out[0] + mesh.x, out[1] + mesh.y, out[2] + mesh.z)
}

fn transform_point_hf(
    px: f32,
    py: f32,
    pz: f32,
    heightfield: &CollisionHeightfield3D,
) -> (f32, f32, f32) {
    let mut out = [0.0_f32; 3];
    rotate_by_quat(
        px,
        py,
        pz,
        heightfield.rotation_x,
        heightfield.rotation_y,
        heightfield.rotation_z,
        heightfield.rotation_w,
        &mut out,
    );
    (
        out[0] + heightfield.x,
        out[1] + heightfield.y,
        out[2] + heightfield.z,
    )
}

pub fn write_collision_heightfield_bounds3d(
    heightfield: &CollisionHeightfield3D,
    out: &mut CollisionAabb3D,
) {
    if heightfield.columns < 2 || heightfield.rows < 2 || heightfield.heights.is_empty() {
        *out = CollisionAabb3D::default();
        return;
    }
    let mut min_h = f32::INFINITY;
    let mut max_h = f32::NEG_INFINITY;
    for &h in &heightfield.heights {
        if h < min_h {
            min_h = h;
        }
        if h > max_h {
            max_h = h;
        }
    }
    let width = (heightfield.columns - 1) as f32 * heightfield.cell_size_x;
    let depth = (heightfield.rows - 1) as f32 * heightfield.cell_size_z;

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

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for &(px, py, pz) in &corners {
        let (wx, wy, wz) = transform_point_hf(px, py, pz, heightfield);
        if wx < min_x {
            min_x = wx;
        }
        if wy < min_y {
            min_y = wy;
        }
        if wz < min_z {
            min_z = wz;
        }
        if wx > max_x {
            max_x = wx;
        }
        if wy > max_y {
            max_y = wy;
        }
        if wz > max_z {
            max_z = wz;
        }
    }

    out.min_x = min_x;
    out.min_y = min_y;
    out.min_z = min_z;
    out.max_x = max_x;
    out.max_y = max_y;
    out.max_z = max_z;
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
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for i in 0..count {
        // Transform point by mesh's position and rotation
        let px = mesh.points[i * 3];
        let py = mesh.points[i * 3 + 1];
        let pz = mesh.points[i * 3 + 2];
        let (wx, wy, wz) = transform_point(px, py, pz, mesh);
        if wx < min_x {
            min_x = wx;
        }
        if wy < min_y {
            min_y = wy;
        }
        if wz < min_z {
            min_z = wz;
        }
        if wx > max_x {
            max_x = wx;
        }
        if wy > max_y {
            max_y = wy;
        }
        if wz > max_z {
            max_z = wz;
        }
    }
    out.min_x = min_x;
    out.min_y = min_y;
    out.min_z = min_z;
    out.max_x = max_x;
    out.max_y = max_y;
    out.max_z = max_z;
}

impl CollisionTriangleContactAccumulator3D {
    fn new() -> Self {
        return create_collision_triangle_contact_accumulator3d();
    }

    fn append_candidate(&mut self, candidate: CollisionTriangleContactCandidate3D) {
        return append_collision_triangle_contact_candidate3d(self, candidate);
    }

    fn include_manifold(&mut self, triangle: usize, manifold: &CollisionContactManifold3D) {
        return include_collision_triangle_contact_manifold3d(self, triangle, manifold);
    }

    fn write_reduced(self, out: &mut CollisionContactManifold3D) -> bool {
        return write_reduced_collision_triangle_contacts3d(self, out);
    }
}
