//! On-demand surface attributes of a Scene3DHit (TS `sceneHitAttributes.ts`): the hit subset and
//! material, and barycentric uv0/normal/tangent read from the hit Mesh's current geometry. Every
//! query leaves its caller-owned output unchanged and returns its sentinel when the hit is empty or
//! the data is unavailable or degenerate.

// flight-lint: allow-file(contract-vocabulary) D16 open Material3D family retains the original heterogeneous material handles

use flight_entity::Ref;
use flight_geometry::{
    Ray3D, Vector2, Vector3, Vector4, create_vector2, create_vector3, create_vector4,
    inverse_matrix4,
};
use flight_materials::Material3D;
use flight_meshgeometry::{
    MeshGeometry, MeshTriangleVertexIndices, get_mesh_geometry_triangle_subset_index,
    get_mesh_geometry_triangle_vertex_indices, get_mesh_geometry_vertex_normal,
    get_mesh_geometry_vertex_tangent, get_mesh_geometry_vertex_uv0,
};
use flight_node::contract::{NodeRevisionState, get_node_world_matrix4};

use crate::pick_scene3d::narrow_mesh;
use crate::types::Scene3DHit;

// The hit Mesh's current geometry handle, or None for an empty (or non-Mesh) hit.
fn get_hit_geometry(hit: &Scene3DHit) -> Option<Ref<MeshGeometry>> {
    let node = hit.node.as_ref()?;
    let guard = node.read().unwrap();
    return narrow_mesh(&*guard).map(|mesh| mesh.geometry.clone());
}

// Resolves the hit's three triangle vertex indices, or false when the triangle is unavailable.
fn get_hit_triangle(
    out: &mut MeshTriangleVertexIndices,
    geometry: &MeshGeometry,
    hit: &Scene3DHit,
) -> bool {
    if hit.triangle_index < 0 {
        return false;
    }
    return get_mesh_geometry_triangle_vertex_indices(out, geometry, hit.triangle_index as u32);
}

/// Returns the authored material at the hit subset, or None for an absent/out-of-range/default slot
/// (TS `getScene3DHitMaterial`).
pub fn get_scene3d_hit_material(hit: &Scene3DHit) -> Option<Ref<dyn Material3D>> {
    let node = hit.node.as_ref()?;
    let guard = node.read().unwrap();
    let mesh = narrow_mesh(&*guard)?;
    let subset_index =
        get_mesh_geometry_triangle_subset_index(&mesh.geometry.read().unwrap(), hit.triangle_index);
    if subset_index < 0 {
        return None;
    }
    return mesh
        .materials
        .read()
        .unwrap()
        .get(subset_index as usize)
        .cloned()
        .flatten();
}

/// Returns the material/subset slot owning the hit triangle, or -1 when no declared subset contains
/// it (TS `getScene3DHitSubsetIndex`). This is computed on demand so the nearest-hit core remains
/// flat and small.
pub fn get_scene3d_hit_subset_index(hit: &Scene3DHit) -> i32 {
    let Some(geometry) = get_hit_geometry(hit) else {
        return -1;
    };
    return get_mesh_geometry_triangle_subset_index(&geometry.read().unwrap(), hit.triangle_index);
}

/// Interpolates uv0 from the hit triangle's current geometry (TS `getScene3DHitUv0`). Returns false
/// without changing `out` when the triangle or channel is unavailable.
pub fn get_scene3d_hit_uv0(out: &mut Vector2, hit: &Scene3DHit) -> bool {
    let Some(geometry) = get_hit_geometry(hit) else {
        return false;
    };
    let geometry = geometry.read().unwrap();
    let mut triangle = MeshTriangleVertexIndices {
        i0: 0,
        i1: 0,
        i2: 0,
    };
    if !get_hit_triangle(&mut triangle, &geometry, hit) {
        return false;
    }
    let mut uv0 = create_vector2(0.0, 0.0);
    let mut uv1 = create_vector2(0.0, 0.0);
    let mut uv2 = create_vector2(0.0, 0.0);
    if !get_mesh_geometry_vertex_uv0(&mut uv0, &geometry, triangle.i0) {
        return false;
    }
    if !get_mesh_geometry_vertex_uv0(&mut uv1, &geometry, triangle.i1) {
        return false;
    }
    if !get_mesh_geometry_vertex_uv0(&mut uv2, &geometry, triangle.i2) {
        return false;
    }
    out.x = hit.u * uv0.x + hit.v * uv1.x + hit.w * uv2.x;
    out.y = hit.u * uv0.y + hit.v * uv1.y + hit.w * uv2.y;
    return true;
}

/// Interpolates the vertex normal and transforms it to world space with inverse-transpose, so
/// non-uniform scale remains correct (TS `getScene3DHitVertexNormal`). This is distinct from
/// `Scene3DHit.normal_*`, the geometric face normal used for culling. Returns false without
/// changing `out` when unavailable or degenerate.
// flight-lint: allow(conform-params) D5 caller-owned node revisions resolve the world matrix
pub fn get_scene3d_hit_vertex_normal(
    out: &mut Vector3,
    hit: &Scene3DHit,
    revisions: &mut NodeRevisionState,
) -> bool {
    let (Some(node), Some(geometry)) = (hit.node.as_ref(), get_hit_geometry(hit)) else {
        return false;
    };
    let mut normal0 = create_vector3(0.0, 0.0, 0.0);
    let mut normal1 = create_vector3(0.0, 0.0, 0.0);
    let mut normal2 = create_vector3(0.0, 0.0, 0.0);
    {
        let geometry = geometry.read().unwrap();
        let mut triangle = MeshTriangleVertexIndices {
            i0: 0,
            i1: 0,
            i2: 0,
        };
        if !get_hit_triangle(&mut triangle, &geometry, hit) {
            return false;
        }
        if !get_mesh_geometry_vertex_normal(&mut normal0, &geometry, triangle.i0) {
            return false;
        }
        if !get_mesh_geometry_vertex_normal(&mut normal1, &geometry, triangle.i1) {
            return false;
        }
        if !get_mesh_geometry_vertex_normal(&mut normal2, &geometry, triangle.i2) {
            return false;
        }
    }

    let nx = hit.u * normal0.x + hit.v * normal1.x + hit.w * normal2.x;
    let ny = hit.u * normal0.y + hit.v * normal1.y + hit.w * normal2.y;
    let nz = hit.u * normal0.z + hit.v * normal1.z + hit.w * normal2.z;
    let world_matrix = get_node_world_matrix4(node, revisions);
    let mut inverse_world = world_matrix.clone();
    if !inverse_matrix4(&mut inverse_world, &world_matrix) {
        return false;
    }
    let m = &inverse_world.m;
    return write_normalized(
        out,
        m[0] * nx + m[1] * ny + m[2] * nz,
        m[4] * nx + m[5] * ny + m[6] * nz,
        m[8] * nx + m[9] * ny + m[10] * nz,
    );
}

/// Interpolates tangent xyz/w, transforms the direction to world space, orthogonalizes it against
/// the interpolated world normal, and flips handedness under a mirrored world transform (TS
/// `getScene3DHitVertexTangent`). Returns false without changing `out` when normal/tangent data is
/// unavailable or degenerate.
// flight-lint: allow(conform-params) D5 caller-owned node revisions resolve the world matrix
pub fn get_scene3d_hit_vertex_tangent(
    out: &mut Vector4,
    hit: &Scene3DHit,
    revisions: &mut NodeRevisionState,
) -> bool {
    let (Some(node), Some(geometry)) = (hit.node.as_ref(), get_hit_geometry(hit)) else {
        return false;
    };
    let mut tangent0 = create_vector4(0.0, 0.0, 0.0, 0.0);
    let mut tangent1 = create_vector4(0.0, 0.0, 0.0, 0.0);
    let mut tangent2 = create_vector4(0.0, 0.0, 0.0, 0.0);
    {
        let geometry = geometry.read().unwrap();
        let mut triangle = MeshTriangleVertexIndices {
            i0: 0,
            i1: 0,
            i2: 0,
        };
        if !get_hit_triangle(&mut triangle, &geometry, hit) {
            return false;
        }
        if !get_mesh_geometry_vertex_tangent(&mut tangent0, &geometry, triangle.i0) {
            return false;
        }
        if !get_mesh_geometry_vertex_tangent(&mut tangent1, &geometry, triangle.i1) {
            return false;
        }
        if !get_mesh_geometry_vertex_tangent(&mut tangent2, &geometry, triangle.i2) {
            return false;
        }
    }
    let mut world_normal = create_vector3(0.0, 0.0, 0.0);
    if !get_scene3d_hit_vertex_normal(&mut world_normal, hit, revisions) {
        return false;
    }

    let tx = hit.u * tangent0.x + hit.v * tangent1.x + hit.w * tangent2.x;
    let ty = hit.u * tangent0.y + hit.v * tangent1.y + hit.w * tangent2.y;
    let tz = hit.u * tangent0.z + hit.v * tangent1.z + hit.w * tangent2.z;
    let tw = hit.u * tangent0.w + hit.v * tangent1.w + hit.w * tangent2.w;
    let world_matrix = get_node_world_matrix4(node, revisions);
    let m = &world_matrix.m;
    let mut wx = m[0] * tx + m[4] * ty + m[8] * tz;
    let mut wy = m[1] * tx + m[5] * ty + m[9] * tz;
    let mut wz = m[2] * tx + m[6] * ty + m[10] * tz;
    let projection = wx * world_normal.x + wy * world_normal.y + wz * world_normal.z;
    wx -= projection * world_normal.x;
    wy -= projection * world_normal.y;
    wz -= projection * world_normal.z;
    let length_squared = wx * wx + wy * wy + wz * wz;
    if length_squared == 0.0 {
        return false;
    }
    let inverse_length = 1.0 / length_squared.sqrt();
    let determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2])
        + m[8] * (m[1] * m[6] - m[5] * m[2]);
    out.x = wx * inverse_length;
    out.y = wy * inverse_length;
    out.z = wz * inverse_length;
    out.w = (if tw < 0.0 { -1.0 } else { 1.0 }) * (if determinant < 0.0 { -1.0 } else { 1.0 });
    return true;
}

/// True when the world ray meets the front side of the hit's geometric face normal (TS
/// `isScene3DHitFrontFacing`). Perpendicular rays are treated as front-facing; the ray direction
/// need not be normalized.
pub fn is_scene3d_hit_front_facing(hit: &Scene3DHit, ray: &Ray3D) -> bool {
    return ray.direction.x * hit.normal_x
        + ray.direction.y * hit.normal_y
        + ray.direction.z * hit.normal_z
        <= 0.0;
}

fn write_normalized(out: &mut Vector3, x: f32, y: f32, z: f32) -> bool {
    let length_squared = x * x + y * y + z * z;
    if length_squared == 0.0 {
        return false;
    }
    let inverse_length = 1.0 / length_squared.sqrt();
    out.x = x * inverse_length;
    out.y = y * inverse_length;
    out.z = z * inverse_length;
    return true;
}
