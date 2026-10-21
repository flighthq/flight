
use crate::MeshGeometry;
use crate::MeshMorphBindPose;
use crate::MeshSkinBindPose;
use crate::VertexSemantic;
use crate::clone_mesh_geometry;
use crate::compute_mesh_geometry_bounds;
use crate::get_mesh_geometry_morph_bind_pose;
use crate::get_mesh_geometry_skin_bind_pose;
use crate::get_vertex_attribute_float_offset;

/// Clones geometry for an independently updated CPU-deformed mesh. Unlike the general
/// clone, this restores the deepest captured undeformed attributes when the source has
/// already been morphed or skinned, then gives the clone a fresh runtime.
pub fn clone_mesh_geometry_for_deformation(source: &MeshGeometry) -> MeshGeometry {
    let mut clone = clone_mesh_geometry(source);
    let morph_bind_pose = get_mesh_geometry_morph_bind_pose(source);
    let skin_bind_pose = get_mesh_geometry_skin_bind_pose(source);

    if let Some(mbp) = morph_bind_pose {
        restore_morph_bind_pose(&mut clone, mbp);
    } else if let Some(sbp) = skin_bind_pose {
        restore_skin_bind_pose(&mut clone, sbp);
    }

    let mut bounds = flight_geometry::create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    compute_mesh_geometry_bounds(&mut bounds, &clone);
    clone.bounds = Some(bounds);
    return clone;
}

fn restore_float3(geometry: &mut MeshGeometry, semantic: VertexSemantic, source: &[f32]) {
    let offset = get_vertex_attribute_float_offset(&geometry.layout, semantic);
    if offset < 0 {
        return;
    }
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count_from_geo = if floats_per_vertex > 0 { geometry.vertices.len() / floats_per_vertex } else { 0 };
    let vertex_count_from_src = source.len() / 3;
    let vertex_count = vertex_count_from_geo.min(vertex_count_from_src);
    for vertex in 0..vertex_count {
        let target = vertex * floats_per_vertex + offset as usize;
        let from = vertex * 3;
        geometry.vertices[target] = source[from];
        geometry.vertices[target + 1] = source[from + 1];
        geometry.vertices[target + 2] = source[from + 2];
    }
}

fn restore_morph_bind_pose(geometry: &mut MeshGeometry, bind_pose: &MeshMorphBindPose) {
    restore_float3(geometry, VertexSemantic::Position, &bind_pose.positions);
    if let Some(ref normals) = bind_pose.normals {
        restore_float3(geometry, VertexSemantic::Normal, normals);
    }
    if let Some(ref tangents) = bind_pose.tangents {
        restore_float3(geometry, VertexSemantic::Tangent, tangents);
    }
}

fn restore_skin_bind_pose(geometry: &mut MeshGeometry, bind_pose: &MeshSkinBindPose) {
    restore_float3(geometry, VertexSemantic::Position, &bind_pose.positions);
    restore_float3(geometry, VertexSemantic::Normal, &bind_pose.normals);
}

