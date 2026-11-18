//! flight-compiler: target-native

use crate::MeshGeometry;
use crate::VertexSemantic;
use crate::get_vertex_attribute_float_offset;

/// Offsets every uv0 coordinate by (du, dv): u' = u + du, v' = v + dv.
// flight-lint: allow(f32) UV offsets operate on bounded texture coordinates in GPU vertex storage
pub fn offset_mesh_geometry_uvs(geometry: &mut MeshGeometry, du: f32, dv: f32) {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), VertexSemantic::Uv0);
    if float_offset < 0 {
        return;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + float_offset as u32) as usize;
        geometry.vertices[base] += du;
        geometry.vertices[base + 1] += dv;
    }
    if vertex_count > 0 {
        geometry.version += 1;
    }
}

/// Scales every uv0 coordinate by (su, sv) around the origin: u' = u * su, v' = v * sv.
// flight-lint: allow(f32) UV scales operate on bounded texture coordinates in GPU vertex storage
pub fn scale_mesh_geometry_uvs(geometry: &mut MeshGeometry, su: f32, sv: f32) {
    let float_offset =
        get_vertex_attribute_float_offset(&geometry.layout.read().unwrap(), VertexSemantic::Uv0);
    if float_offset < 0 {
        return;
    }
    let floats_per_vertex = geometry.layout.read().unwrap().stride / 4;
    let vertex_count = if floats_per_vertex > 0 {
        geometry.vertices.len() as u32 / floats_per_vertex
    } else {
        0
    };
    for i in 0..vertex_count {
        let base = (i * floats_per_vertex + float_offset as u32) as usize;
        geometry.vertices[base] *= su;
        geometry.vertices[base + 1] *= sv;
    }
    if vertex_count > 0 {
        geometry.version += 1;
    }
}
