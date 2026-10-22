use std::cell::RefCell;
use std::collections::HashMap;

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
    triangles: Vec<usize>,
}

#[derive(Debug, Clone)]
struct TriangleMeshCache {
    bvh: Option<BvhNode>,
    version: i64,
}

#[derive(Debug, Clone)]
struct HeightfieldCache {
    bvh: Option<BvhNode>,
    version: i64,
}

thread_local! {
    static MESH_CACHE: RefCell<HashMap<u64, TriangleMeshCache>> = RefCell::new(HashMap::new());
    static HEIGHTFIELD_CACHE: RefCell<HashMap<u64, HeightfieldCache>> = RefCell::new(HashMap::new());
}

struct TriangleAabb {
    index: usize,
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
    cx: f32,
    cy: f32,
    cz: f32,
}

fn build_bvh(aabbs: &mut [TriangleAabb]) -> Option<BvhNode> {
    if aabbs.is_empty() {
        return None;
    }
    let mut node_min_x = f32::INFINITY;
    let mut node_min_y = f32::INFINITY;
    let mut node_min_z = f32::INFINITY;
    let mut node_max_x = f32::NEG_INFINITY;
    let mut node_max_y = f32::NEG_INFINITY;
    let mut node_max_z = f32::NEG_INFINITY;
    for aabb in aabbs.iter() {
        if aabb.min_x < node_min_x {
            node_min_x = aabb.min_x;
        }
        if aabb.min_y < node_min_y {
            node_min_y = aabb.min_y;
        }
        if aabb.min_z < node_min_z {
            node_min_z = aabb.min_z;
        }
        if aabb.max_x > node_max_x {
            node_max_x = aabb.max_x;
        }
        if aabb.max_y > node_max_y {
            node_max_y = aabb.max_y;
        }
        if aabb.max_z > node_max_z {
            node_max_z = aabb.max_z;
        }
    }
    if aabbs.len() <= BVH_LEAF_SIZE {
        return Some(BvhNode {
            min_x: node_min_x,
            min_y: node_min_y,
            min_z: node_min_z,
            max_x: node_max_x,
            max_y: node_max_y,
            max_z: node_max_z,
            left: None,
            right: None,
            triangles: aabbs.iter().map(|a| a.index).collect(),
        });
    }
    let extent_x = node_max_x - node_min_x;
    let extent_y = node_max_y - node_min_y;
    let extent_z = node_max_z - node_min_z;
    if extent_x >= extent_y && extent_x >= extent_z {
        aabbs.sort_by(|a, b| a.cx.partial_cmp(&b.cx).unwrap_or(std::cmp::Ordering::Equal));
    } else if extent_y >= extent_z {
        aabbs.sort_by(|a, b| a.cy.partial_cmp(&b.cy).unwrap_or(std::cmp::Ordering::Equal));
    } else {
        aabbs.sort_by(|a, b| a.cz.partial_cmp(&b.cz).unwrap_or(std::cmp::Ordering::Equal));
    }
    let mid = aabbs.len() / 2;
    let (left_slice, right_slice) = aabbs.split_at_mut(mid);
    return Some(BvhNode {
        min_x: node_min_x,
        min_y: node_min_y,
        min_z: node_min_z,
        max_x: node_max_x,
        max_y: node_max_y,
        max_z: node_max_z,
        left: build_bvh(left_slice).map(Box::new),
        right: build_bvh(right_slice).map(Box::new),
        triangles: Vec::new(),
    });
}

fn query_bvh_all(node: &BvhNode, out: &mut Vec<usize>) {
    if !node.triangles.is_empty() {
        out.extend_from_slice(&node.triangles);
        return;
    }
    if let Some(ref left) = node.left {
        query_bvh_all(left, out);
    }
    if let Some(ref right) = node.right {
        query_bvh_all(right, out);
    }
}

fn query_bvh(node: &BvhNode, qmin_x: f32, qmin_y: f32, qmin_z: f32, qmax_x: f32, qmax_y: f32, qmax_z: f32, out: &mut Vec<usize>) {
    if qmax_x < node.min_x || qmin_x > node.max_x
        || qmax_y < node.min_y || qmin_y > node.max_y
        || qmax_z < node.min_z || qmin_z > node.max_z
    {
        return;
    }
    if !node.triangles.is_empty() {
        out.extend_from_slice(&node.triangles);
        return;
    }
    if let Some(ref left) = node.left {
        query_bvh(left, qmin_x, qmin_y, qmin_z, qmax_x, qmax_y, qmax_z, out);
    }
    if let Some(ref right) = node.right {
        query_bvh(right, qmin_x, qmin_y, qmin_z, qmax_x, qmax_y, qmax_z, out);
    }
}

fn build_mesh_bvh(mesh: &CollisionTriangleMesh3D) -> Option<BvhNode> {
    let tri_count = mesh.indices.len() / 3;
    if tri_count == 0 {
        return None;
    }
    let mut aabbs = Vec::with_capacity(tri_count);
    for ti in 0..tri_count {
        let i0 = mesh.indices[ti * 3];
        let i1 = mesh.indices[ti * 3 + 1];
        let i2 = mesh.indices[ti * 3 + 2];
        let v0x = mesh.points[i0 * 3];
        let v0y = mesh.points[i0 * 3 + 1];
        let v0z = mesh.points[i0 * 3 + 2];
        let v1x = mesh.points[i1 * 3];
        let v1y = mesh.points[i1 * 3 + 1];
        let v1z = mesh.points[i1 * 3 + 2];
        let v2x = mesh.points[i2 * 3];
        let v2y = mesh.points[i2 * 3 + 1];
        let v2z = mesh.points[i2 * 3 + 2];
        let min_x = v0x.min(v1x).min(v2x);
        let min_y = v0y.min(v1y).min(v2y);
        let min_z = v0z.min(v1z).min(v2z);
        let max_x = v0x.max(v1x).max(v2x);
        let max_y = v0y.max(v1y).max(v2y);
        let max_z = v0z.max(v1z).max(v2z);
        aabbs.push(TriangleAabb {
            index: ti,
            min_x,
            min_y,
            min_z,
            max_x,
            max_y,
            max_z,
            cx: (min_x + max_x) * 0.5,
            cy: (min_y + max_y) * 0.5,
            cz: (min_z + max_z) * 0.5,
        });
    }
    return build_bvh(&mut aabbs);
}

fn build_heightfield_bvh(heightfield: &CollisionHeightfield3D) -> Option<BvhNode> {
    if heightfield.columns < 2 || heightfield.rows < 2 {
        return None;
    }
    let mut aabbs = Vec::new();
    let mut triangle = 0usize;
    for row in 0..(heightfield.rows - 1) {
        for col in 0..(heightfield.columns - 1) {
            let x0 = col as f32 * heightfield.cell_size_x;
            let x1 = (col + 1) as f32 * heightfield.cell_size_x;
            let z0 = row as f32 * heightfield.cell_size_z;
            let z1 = (row + 1) as f32 * heightfield.cell_size_z;
            let h00 = heightfield.heights[row * heightfield.columns + col];
            let h10 = heightfield.heights[row * heightfield.columns + col + 1];
            let h01 = heightfield.heights[(row + 1) * heightfield.columns + col];
            let h11 = heightfield.heights[(row + 1) * heightfield.columns + col + 1];
            // Triangle 0: (x0,h00,z0), (x1,h11,z1), (x1,h10,z0)
            let min_y_0 = h00.min(h11).min(h10);
            let max_y_0 = h00.max(h11).max(h10);
            aabbs.push(TriangleAabb {
                index: triangle,
                min_x: x0,
                min_y: min_y_0,
                min_z: z0,
                max_x: x1,
                max_y: max_y_0,
                max_z: z1,
                cx: (x0 + x1) * 0.5,
                cy: (min_y_0 + max_y_0) * 0.5,
                cz: (z0 + z1) * 0.5,
            });
            triangle += 1;
            // Triangle 1: (x0,h00,z0), (x0,h01,z1), (x1,h11,z1)
            let min_y_1 = h00.min(h01).min(h11);
            let max_y_1 = h00.max(h01).max(h11);
            aabbs.push(TriangleAabb {
                index: triangle,
                min_x: x0,
                min_y: min_y_1,
                min_z: z0,
                max_x: x1,
                max_y: max_y_1,
                max_z: z1,
                cx: (x0 + x1) * 0.5,
                cy: (min_y_1 + max_y_1) * 0.5,
                cz: (z0 + z1) * 0.5,
            });
            triangle += 1;
        }
    }
    return build_bvh(&mut aabbs);
}

fn get_or_build_mesh_bvh(mesh: &CollisionTriangleMesh3D) -> Option<BvhNode> {
    let entity_id = flight_entity::get_entity_id(mesh);
    return MESH_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(entry) = cache.get(&entity_id) {
            if entry.version == mesh.version {
                return entry.bvh.clone();
            }
        }
        let bvh = build_mesh_bvh(mesh);
        cache.insert(entity_id, TriangleMeshCache {
            bvh: bvh.clone(),
            version: mesh.version,
        });
        return bvh;
    });
}

fn get_or_build_heightfield_bvh(heightfield: &CollisionHeightfield3D) -> Option<BvhNode> {
    let entity_id = flight_entity::get_entity_id(heightfield);
    return HEIGHTFIELD_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(entry) = cache.get(&entity_id) {
            if entry.version == heightfield.version {
                return entry.bvh.clone();
            }
        }
        let bvh = build_heightfield_bvh(heightfield);
        cache.insert(entity_id, HeightfieldCache {
            bvh: bvh.clone(),
            version: heightfield.version,
        });
        return bvh;
    });
}

fn shape_aabb3d(shape: &CollisionShape3D) -> CollisionAabb3D {
    return match shape {
        CollisionShape3D::Sphere(s) => CollisionAabb3D {
            min_x: s.x - s.radius,
            min_y: s.y - s.radius,
            min_z: s.z - s.radius,
            max_x: s.x + s.radius,
            max_y: s.y + s.radius,
            max_z: s.z + s.radius,
        },
        CollisionShape3D::Aabb(a) => *a,
        CollisionShape3D::Box(b) => {
            let half = (b.half_x * b.half_x + b.half_y * b.half_y + b.half_z * b.half_z).sqrt();
            CollisionAabb3D {
                min_x: b.x - half,
                min_y: b.y - half,
                min_z: b.z - half,
                max_x: b.x + half,
                max_y: b.y + half,
                max_z: b.z + half,
            }
        }
        CollisionShape3D::Capsule(c) => {
            let min_x = c.x0.min(c.x1) - c.radius;
            let min_y = c.y0.min(c.y1) - c.radius;
            let min_z = c.z0.min(c.z1) - c.radius;
            let max_x = c.x0.max(c.x1) + c.radius;
            let max_y = c.y0.max(c.y1) + c.radius;
            let max_z = c.z0.max(c.z1) + c.radius;
            CollisionAabb3D { min_x, min_y, min_z, max_x, max_y, max_z }
        }
        CollisionShape3D::Cylinder(c) => {
            let min_x = c.x0.min(c.x1) - c.radius;
            let min_y = c.y0.min(c.y1) - c.radius;
            let min_z = c.z0.min(c.z1) - c.radius;
            let max_x = c.x0.max(c.x1) + c.radius;
            let max_y = c.y0.max(c.y1) + c.radius;
            let max_z = c.z0.max(c.z1) + c.radius;
            CollisionAabb3D { min_x, min_y, min_z, max_x, max_y, max_z }
        }
        CollisionShape3D::Cone(c) => {
            let min_x = c.x0.min(c.x1) - c.radius;
            let min_y = c.y0.min(c.y1) - c.radius;
            let min_z = c.z0.min(c.z1) - c.radius;
            let max_x = c.x0.max(c.x1) + c.radius;
            let max_y = c.y0.max(c.y1) + c.radius;
            let max_z = c.z0.max(c.z1) + c.radius;
            CollisionAabb3D { min_x, min_y, min_z, max_x, max_y, max_z }
        }
        CollisionShape3D::Convex(c) => {
            let mut aabb = CollisionAabb3D {
                min_x: f32::INFINITY,
                min_y: f32::INFINITY,
                min_z: f32::INFINITY,
                max_x: f32::NEG_INFINITY,
                max_y: f32::NEG_INFINITY,
                max_z: f32::NEG_INFINITY,
            };
            let count = c.points.len() / 3;
            for i in 0..count {
                let px = c.points[i * 3];
                let py = c.points[i * 3 + 1];
                let pz = c.points[i * 3 + 2];
                if px < aabb.min_x { aabb.min_x = px; }
                if py < aabb.min_y { aabb.min_y = py; }
                if pz < aabb.min_z { aabb.min_z = pz; }
                if px > aabb.max_x { aabb.max_x = px; }
                if py > aabb.max_y { aabb.max_y = py; }
                if pz > aabb.max_z { aabb.max_z = pz; }
            }
            aabb
        }
    };
}

fn inverse_transform_aabb_to_local(
    aabb: &CollisionAabb3D,
    tx: f32,
    ty: f32,
    tz: f32,
    qx: f32,
    qy: f32,
    qz: f32,
    qw: f32,
) -> CollisionAabb3D {
    let corners = [
        (aabb.min_x, aabb.min_y, aabb.min_z),
        (aabb.max_x, aabb.min_y, aabb.min_z),
        (aabb.min_x, aabb.max_y, aabb.min_z),
        (aabb.max_x, aabb.max_y, aabb.min_z),
        (aabb.min_x, aabb.min_y, aabb.max_z),
        (aabb.max_x, aabb.min_y, aabb.max_z),
        (aabb.min_x, aabb.max_y, aabb.max_z),
        (aabb.max_x, aabb.max_y, aabb.max_z),
    ];
    let inv_qx = -qx;
    let inv_qy = -qy;
    let inv_qz = -qz;
    let inv_qw = qw;
    let mut local_min_x = f32::INFINITY;
    let mut local_min_y = f32::INFINITY;
    let mut local_min_z = f32::INFINITY;
    let mut local_max_x = f32::NEG_INFINITY;
    let mut local_max_y = f32::NEG_INFINITY;
    let mut local_max_z = f32::NEG_INFINITY;
    let mut out = [0.0f32; 3];
    for &(cx, cy, cz) in &corners {
        let dx = cx - tx;
        let dy = cy - ty;
        let dz = cz - tz;
        rotate_by_quat(dx, dy, dz, inv_qx, inv_qy, inv_qz, inv_qw, &mut out);
        if out[0] < local_min_x { local_min_x = out[0]; }
        if out[1] < local_min_y { local_min_y = out[1]; }
        if out[2] < local_min_z { local_min_z = out[2]; }
        if out[0] > local_max_x { local_max_x = out[0]; }
        if out[1] > local_max_y { local_max_y = out[1]; }
        if out[2] > local_max_z { local_max_z = out[2]; }
    }
    return CollisionAabb3D {
        min_x: local_min_x,
        min_y: local_min_y,
        min_z: local_min_z,
        max_x: local_max_x,
        max_y: local_max_y,
        max_z: local_max_z,
    };
}

// --- Triangle Mesh functions ---

// flight-lint: allow(conform-params) Principal D23 B: canonical Entity construction is zero-field; callers assign authored heightfield data after allocation
pub fn create_collision_heightfield3d() -> CollisionHeightfield3D {
    let mut out: CollisionHeightfield3D = flight_entity::allocate_entity();
    initialize_collision_heightfield3d(&mut out);
    return out;
}

fn create_collision_triangle_contact_accumulator3d() -> CollisionTriangleContactAccumulator3D {
    CollisionTriangleContactAccumulator3D {
        candidates: Vec::new(),
        best_depth: f32::NEG_INFINITY,
        best_normal: [0.0; 3],
    }
}

// flight-lint: allow(conform-params) Principal D23 B: canonical Entity construction is zero-field; callers assign authored mesh data after allocation
pub fn create_collision_triangle_mesh3d() -> CollisionTriangleMesh3D {
    let mut out: CollisionTriangleMesh3D = flight_entity::allocate_entity();
    initialize_collision_triangle_mesh3d(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principal D23 B: construction initialization owns only canonical zero-field defaults
pub fn initialize_collision_heightfield3d(out: &mut CollisionHeightfield3D) {
    out.columns = 0;
    out.rows = 0;
    out.heights.clear();
    out.cell_size_x = 1.0;
    out.cell_size_z = 1.0;
    out.version = 0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.rotation_x = 0.0;
    out.rotation_y = 0.0;
    out.rotation_z = 0.0;
    out.rotation_w = 1.0;
}

// flight-lint: allow(conform-params) Principal D23 B: construction initialization owns only canonical zero-field defaults
pub fn initialize_collision_triangle_mesh3d(out: &mut CollisionTriangleMesh3D) {
    out.points.clear();
    out.indices.clear();
    out.version = 0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.rotation_x = 0.0;
    out.rotation_y = 0.0;
    out.rotation_z = 0.0;
    out.rotation_w = 1.0;
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
    let candidates = heightfield_candidate_triangles(heightfield, convex);

    for &triangle in &candidates {
        let (col, row, sub) = heightfield_triangle_to_cell(heightfield, triangle);
        let triangles = heightfield_cell_triangles(heightfield, col, row);
        let tri = &triangles[sub];
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
    let candidates = mesh_candidate_triangles(mesh, convex);

    for &ti in &candidates {
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
    let rotation_length_squared = heightfield.rotation_x * heightfield.rotation_x
        + heightfield.rotation_y * heightfield.rotation_y
        + heightfield.rotation_z * heightfield.rotation_z
        + heightfield.rotation_w * heightfield.rotation_w;
    if heightfield.columns < 2
        || heightfield.rows < 2
        || heightfield.heights.len() != heightfield.columns * heightfield.rows
        || !heightfield.cell_size_x.is_finite()
        || !heightfield.cell_size_z.is_finite()
        || heightfield.cell_size_x <= 0.0
        || heightfield.cell_size_z <= 0.0
        || heightfield.version < 0
        || !heightfield.x.is_finite()
        || !heightfield.y.is_finite()
        || !heightfield.z.is_finite()
        || !rotation_length_squared.is_finite()
        || (rotation_length_squared - 1.0).abs() > 1e-6
    {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    for &height in &heightfield.heights {
        if !height.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
    }
    return None;
}

pub fn get_collision_triangle_mesh_validation_status3d(
    mesh: &CollisionTriangleMesh3D,
) -> Option<CollisionTestStatus> {
    let rotation_length_squared = mesh.rotation_x * mesh.rotation_x
        + mesh.rotation_y * mesh.rotation_y
        + mesh.rotation_z * mesh.rotation_z
        + mesh.rotation_w * mesh.rotation_w;
    if mesh.points.len() < 9
        || mesh.points.len() % 3 != 0
        || mesh.indices.len() < 3
        || mesh.indices.len() % 3 != 0
        || mesh.version < 0
        || !mesh.x.is_finite()
        || !mesh.y.is_finite()
        || !mesh.z.is_finite()
        || !rotation_length_squared.is_finite()
        || (rotation_length_squared - 1.0).abs() > 1e-6
    {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    for &value in &mesh.points {
        if !value.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
    }
    let max_index = mesh.points.len() / 3;
    for &idx in &mesh.indices {
        if idx >= max_index {
            return Some(CollisionTestStatus::DegenerateShape);
        }
    }
    for triangle in 0..(mesh.indices.len() / 3) {
        let offset = triangle * 3;
        let a = mesh.indices[offset] * 3;
        let b = mesh.indices[offset + 1] * 3;
        let c = mesh.indices[offset + 2] * 3;
        let ab_x = mesh.points[b] - mesh.points[a];
        let ab_y = mesh.points[b + 1] - mesh.points[a + 1];
        let ab_z = mesh.points[b + 2] - mesh.points[a + 2];
        let ac_x = mesh.points[c] - mesh.points[a];
        let ac_y = mesh.points[c + 1] - mesh.points[a + 1];
        let ac_z = mesh.points[c + 2] - mesh.points[a + 2];
        let cross_x = ab_y * ac_z - ab_z * ac_y;
        let cross_y = ab_z * ac_x - ab_x * ac_z;
        let cross_z = ab_x * ac_y - ab_y * ac_x;
        let cross_length_squared = cross_x * cross_x + cross_y * cross_y + cross_z * cross_z;
        let ab_length_squared = ab_x * ab_x + ab_y * ab_y + ab_z * ab_z;
        let ac_length_squared = ac_x * ac_x + ac_y * ac_y + ac_z * ac_z;
        let scale_squared = ab_length_squared.max(ac_length_squared);
        if !cross_length_squared.is_finite()
            || !scale_squared.is_finite()
            || cross_length_squared <= f32::EPSILON * f32::EPSILON * scale_squared * scale_squared
        {
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

    let candidates = heightfield_ray_candidate_triangles(heightfield, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction);

    for &triangle in &candidates {
        let (col, row, sub) = heightfield_triangle_to_cell(heightfield, triangle);
        let triangles = heightfield_cell_triangles(heightfield, col, row);
        let tri = &triangles[sub];
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
    if tri_count == 0 {
        return false;
    }
    let mut best_t = max_fraction + 1.0;
    let mut hit = false;

    let candidates = mesh_ray_candidate_triangles(mesh, origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction);

    for &ti in &candidates {
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

fn mesh_candidate_triangles(mesh: &CollisionTriangleMesh3D, convex: &CollisionShape3D) -> Vec<usize> {
    let bvh = get_or_build_mesh_bvh(mesh);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    let world_aabb = shape_aabb3d(convex);
    let local_aabb = inverse_transform_aabb_to_local(
        &world_aabb,
        mesh.x, mesh.y, mesh.z,
        mesh.rotation_x, mesh.rotation_y, mesh.rotation_z, mesh.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn mesh_ray_candidate_triangles(
    mesh: &CollisionTriangleMesh3D,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: f32,
) -> Vec<usize> {
    let bvh = get_or_build_mesh_bvh(mesh);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    if !max_fraction.is_finite() {
        let mut candidates = Vec::new();
        query_bvh_all(bvh, &mut candidates);
        return candidates;
    }
    let ray_box = ray_aabb(origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction);
    let local_aabb = inverse_transform_aabb_to_local(
        &ray_box,
        mesh.x, mesh.y, mesh.z,
        mesh.rotation_x, mesh.rotation_y, mesh.rotation_z, mesh.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn mesh_sweep_candidate_triangles(
    mesh: &CollisionTriangleMesh3D,
    convex: &CollisionShape3D,
    delta_x: f32,
    delta_y: f32,
    delta_z: f32,
    max_fraction: f32,
) -> Vec<usize> {
    let bvh = get_or_build_mesh_bvh(mesh);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    let base_aabb = shape_aabb3d(convex);
    let swept_aabb = CollisionAabb3D {
        min_x: base_aabb.min_x + (delta_x * max_fraction).min(0.0),
        min_y: base_aabb.min_y + (delta_y * max_fraction).min(0.0),
        min_z: base_aabb.min_z + (delta_z * max_fraction).min(0.0),
        max_x: base_aabb.max_x + (delta_x * max_fraction).max(0.0),
        max_y: base_aabb.max_y + (delta_y * max_fraction).max(0.0),
        max_z: base_aabb.max_z + (delta_z * max_fraction).max(0.0),
    };
    let local_aabb = inverse_transform_aabb_to_local(
        &swept_aabb,
        mesh.x, mesh.y, mesh.z,
        mesh.rotation_x, mesh.rotation_y, mesh.rotation_z, mesh.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn heightfield_triangle_to_cell(heightfield: &CollisionHeightfield3D, triangle: usize) -> (usize, usize, usize) {
    let cols = heightfield.columns - 1;
    let cell = triangle / 2;
    let sub = triangle % 2;
    let col = cell % cols;
    let row = cell / cols;
    return (col, row, sub);
}

fn heightfield_candidate_triangles(heightfield: &CollisionHeightfield3D, convex: &CollisionShape3D) -> Vec<usize> {
    let bvh = get_or_build_heightfield_bvh(heightfield);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    let world_aabb = shape_aabb3d(convex);
    let local_aabb = inverse_transform_aabb_to_local(
        &world_aabb,
        heightfield.x, heightfield.y, heightfield.z,
        heightfield.rotation_x, heightfield.rotation_y, heightfield.rotation_z, heightfield.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn heightfield_ray_candidate_triangles(
    heightfield: &CollisionHeightfield3D,
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: f32,
) -> Vec<usize> {
    let bvh = get_or_build_heightfield_bvh(heightfield);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    if !max_fraction.is_finite() {
        let mut candidates = Vec::new();
        query_bvh_all(bvh, &mut candidates);
        return candidates;
    }
    let ray_box = ray_aabb(origin_x, origin_y, origin_z, direction_x, direction_y, direction_z, max_fraction);
    let local_aabb = inverse_transform_aabb_to_local(
        &ray_box,
        heightfield.x, heightfield.y, heightfield.z,
        heightfield.rotation_x, heightfield.rotation_y, heightfield.rotation_z, heightfield.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn heightfield_sweep_candidate_triangles(
    heightfield: &CollisionHeightfield3D,
    convex: &CollisionShape3D,
    delta_x: f32,
    delta_y: f32,
    delta_z: f32,
    max_fraction: f32,
) -> Vec<usize> {
    let bvh = get_or_build_heightfield_bvh(heightfield);
    let bvh = match bvh {
        Some(ref b) => b,
        None => return Vec::new(),
    };
    let base_aabb = shape_aabb3d(convex);
    let swept_aabb = CollisionAabb3D {
        min_x: base_aabb.min_x + (delta_x * max_fraction).min(0.0),
        min_y: base_aabb.min_y + (delta_y * max_fraction).min(0.0),
        min_z: base_aabb.min_z + (delta_z * max_fraction).min(0.0),
        max_x: base_aabb.max_x + (delta_x * max_fraction).max(0.0),
        max_y: base_aabb.max_y + (delta_y * max_fraction).max(0.0),
        max_z: base_aabb.max_z + (delta_z * max_fraction).max(0.0),
    };
    let local_aabb = inverse_transform_aabb_to_local(
        &swept_aabb,
        heightfield.x, heightfield.y, heightfield.z,
        heightfield.rotation_x, heightfield.rotation_y, heightfield.rotation_z, heightfield.rotation_w,
    );
    let mut candidates = Vec::new();
    query_bvh(bvh, local_aabb.min_x, local_aabb.min_y, local_aabb.min_z, local_aabb.max_x, local_aabb.max_y, local_aabb.max_z, &mut candidates);
    return candidates;
}

fn ray_aabb(
    origin_x: f32,
    origin_y: f32,
    origin_z: f32,
    direction_x: f32,
    direction_y: f32,
    direction_z: f32,
    max_fraction: f32,
) -> CollisionAabb3D {
    let end_x = origin_x + direction_x * max_fraction;
    let end_y = origin_y + direction_y * max_fraction;
    let end_z = origin_z + direction_z * max_fraction;
    return CollisionAabb3D {
        min_x: origin_x.min(end_x),
        min_y: origin_y.min(end_y),
        min_z: origin_z.min(end_z),
        max_x: origin_x.max(end_x),
        max_y: origin_y.max(end_y),
        max_z: origin_z.max(end_z),
    };
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

    let candidates = heightfield_sweep_candidate_triangles(heightfield, convex, delta_x, delta_y, delta_z, max_fraction);

    for &triangle in &candidates {
        let (col, row, sub) = heightfield_triangle_to_cell(heightfield, triangle);
        let triangles = heightfield_cell_triangles(heightfield, col, row);
        let tri = &triangles[sub];
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
    if tri_count == 0 {
        return false;
    }
    let mut best_t = max_fraction;
    let mut hit = false;

    let candidates = mesh_sweep_candidate_triangles(mesh, convex, delta_x, delta_y, delta_z, max_fraction);

    for &ti in &candidates {
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
