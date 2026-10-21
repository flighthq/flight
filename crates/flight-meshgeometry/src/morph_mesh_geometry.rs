use crate::MeshGeometry;
use crate::MeshMorph;
use crate::MeshMorphBindPose;
use crate::VertexSemantic;
use crate::get_vertex_attribute_float_offset;

fn accumulate_deltas(accumulator: &mut [f32], deltas: &[f32], weight: f32, count: usize) {
    let n = count.min(deltas.len());
    for i in 0..n {
        accumulator[i] += weight * deltas[i];
    }
}

/// Blends a morphed MeshGeometry in place for the current weights: computes
/// base + sum(wi * target_i) for position, and where the base carries them, normal and
/// tangent, into the bind pose scratch, then writes back into geometry.vertices.
/// Bumps geometry.version.
pub fn blend_mesh_geometry_morph(
    geometry: &mut MeshGeometry,
    morph: &MeshMorph,
    bind_pose: &mut MeshMorphBindPose,
) {
    let vertex_count = bind_pose.positions.len() / 3;
    let floats = vertex_count * 3;

    // Copy base pose into blended scratch
    bind_pose.blended_positions[..floats].copy_from_slice(&bind_pose.positions[..floats]);
    if let (Some(blended_normals), Some(normals)) =
        (&mut bind_pose.blended_normals, &bind_pose.normals)
    {
        blended_normals[..floats].copy_from_slice(&normals[..floats]);
    }
    if let (Some(blended_tangents), Some(tangents)) =
        (&mut bind_pose.blended_tangents, &bind_pose.tangents)
    {
        blended_tangents[..floats].copy_from_slice(&tangents[..floats]);
    }

    let targets = &morph.targets;
    let weights = &morph.weights;
    let target_count = targets.len().min(weights.len());
    for t in 0..target_count {
        let weight = weights[t];
        if weight == 0.0 {
            continue;
        }
        let target = &targets[t];
        accumulate_deltas(&mut bind_pose.blended_positions, &target.position_deltas, weight, floats);
        if let (Some(blended_normals), Some(normal_deltas)) =
            (&mut bind_pose.blended_normals, &target.normal_deltas)
        {
            accumulate_deltas(blended_normals, normal_deltas, weight, floats);
        }
        if let (Some(blended_tangents), Some(tangent_deltas)) =
            (&mut bind_pose.blended_tangents, &target.tangent_deltas)
        {
            accumulate_deltas(blended_tangents, tangent_deltas, weight, floats);
        }
    }

    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let position_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Position);
    let normal_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Normal);
    let tangent_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent);

    for v in 0..vertex_count {
        let dst = v * floats_per_vertex;
        let s = v * 3;
        if position_offset >= 0 {
            let po = position_offset as usize;
            geometry.vertices[dst + po] = bind_pose.blended_positions[s];
            geometry.vertices[dst + po + 1] = bind_pose.blended_positions[s + 1];
            geometry.vertices[dst + po + 2] = bind_pose.blended_positions[s + 2];
        }
        if let Some(ref blended_normals) = bind_pose.blended_normals {
            if normal_offset >= 0 {
                let no = normal_offset as usize;
                geometry.vertices[dst + no] = blended_normals[s];
                geometry.vertices[dst + no + 1] = blended_normals[s + 1];
                geometry.vertices[dst + no + 2] = blended_normals[s + 2];
            }
        }
        if let Some(ref blended_tangents) = bind_pose.blended_tangents {
            if tangent_offset >= 0 {
                let to = tangent_offset as usize;
                geometry.vertices[dst + to] = blended_tangents[s];
                geometry.vertices[dst + to + 1] = blended_tangents[s + 1];
                geometry.vertices[dst + to + 2] = blended_tangents[s + 2];
            }
        }
    }

    geometry.version += 1;
}

/// Captures the de-interleaved CPU-morph base pose for one MeshGeometry. Allocates the
/// SoA arrays once; the per-frame blend then allocates nothing.
pub fn capture_mesh_morph_bind_pose(geometry: &MeshGeometry) -> MeshMorphBindPose {
    let floats_per_vertex = (geometry.layout.stride / 4) as usize;
    let vertex_count = if floats_per_vertex > 0 { geometry.vertices.len() / floats_per_vertex } else { 0 };

    let position_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Position);
    let normal_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Normal);
    let tangent_offset = get_vertex_attribute_float_offset(&geometry.layout, VertexSemantic::Tangent);

    let mut positions = vec![0.0f32; vertex_count * 3];
    let mut normals = if normal_offset >= 0 { Some(vec![0.0f32; vertex_count * 3]) } else { None };
    let mut tangents = if tangent_offset >= 0 { Some(vec![0.0f32; vertex_count * 3]) } else { None };

    for v in 0..vertex_count {
        let base = v * floats_per_vertex;
        let p = v * 3;
        if position_offset >= 0 {
            let po = position_offset as usize;
            positions[p] = geometry.vertices[base + po];
            positions[p + 1] = geometry.vertices[base + po + 1];
            positions[p + 2] = geometry.vertices[base + po + 2];
        }
        if let Some(ref mut n) = normals {
            let no = normal_offset as usize;
            n[p] = geometry.vertices[base + no];
            n[p + 1] = geometry.vertices[base + no + 1];
            n[p + 2] = geometry.vertices[base + no + 2];
        }
        if let Some(ref mut t) = tangents {
            let to = tangent_offset as usize;
            t[p] = geometry.vertices[base + to];
            t[p + 1] = geometry.vertices[base + to + 1];
            t[p + 2] = geometry.vertices[base + to + 2];
        }
    }

    return MeshMorphBindPose {
        blended_normals: if normals.is_some() { Some(vec![0.0f32; vertex_count * 3]) } else { None },
        blended_positions: vec![0.0f32; vertex_count * 3],
        blended_tangents: if tangents.is_some() { Some(vec![0.0f32; vertex_count * 3]) } else { None },
        normals,
        positions,
        tangents,
    };
}

