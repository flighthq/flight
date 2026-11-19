//! flight-compiler: target-native

use crate::skin_vertices::{read_float_index, write_float_index};
use crate::{skin_tangents, skin_vertices};
use flight_geometry::create_vector4;
use flight_meshgeometry::{
    MeshGeometry, MeshSkinBindPose, VertexAttributeLayout, VertexSemantic,
    get_mesh_geometry_vertex_joints0, get_mesh_geometry_vertex_weights0,
};
use flight_scene3d::Skeleton3D;

// flight-lint: allow(f32) reads or writes the Float32Array skinning lanes (joint, normal and inverse-bind palettes, joint indices, weights and the interleaved vertex buffer); bind-pose math is f64
pub fn capture_mesh_skin_bind_pose(geometry: &MeshGeometry) -> MeshSkinBindPose {
    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride as f64 / 4.0;
    let count = if stride > 0.0 {
        (geometry.vertices.len() as f64 / stride) as usize
    } else {
        0
    };
    let position = float_offset_for_semantic(&layout, VertexSemantic::Position);
    let normal = float_offset_for_semantic(&layout, VertexSemantic::Normal);
    let tangent = float_offset_for_semantic(&layout, VertexSemantic::Tangent);
    drop(layout);
    let mut out = MeshSkinBindPose {
        positions: vec![0.0; count * 3].into_boxed_slice(),
        normals: vec![0.0; count * 3].into_boxed_slice(),
        tangents: vec![0.0; if tangent.is_some() { count * 4 } else { 0 }].into_boxed_slice(),
        joints: vec![0.0; count * 4].into_boxed_slice(),
        weights: vec![0.0; count * 4].into_boxed_slice(),
        skinned_positions: vec![0.0; count * 3].into_boxed_slice(),
        skinned_normals: vec![0.0; count * 3].into_boxed_slice(),
        skinned_tangents: vec![0.0; if tangent.is_some() { count * 4 } else { 0 }]
            .into_boxed_slice(),
    };
    let mut joint = create_vector4(0.0, 0.0, 0.0, 0.0);
    let mut weight = create_vector4(0.0, 0.0, 0.0, 0.0);
    for v in 0..count {
        let base = v as f64 * stride;
        if let Some(offset) = position {
            for i in 0..3 {
                out.positions[v * 3 + i] =
                    read_float_index(&geometry.vertices, base + offset + i as f64);
            }
        }
        if let Some(offset) = normal {
            for i in 0..3 {
                out.normals[v * 3 + i] =
                    read_float_index(&geometry.vertices, base + offset + i as f64);
            }
        }
        if let Some(offset) = tangent {
            for i in 0..4 {
                out.tangents[v * 4 + i] =
                    read_float_index(&geometry.vertices, base + offset + i as f64);
            }
        }
        if get_mesh_geometry_vertex_joints0(&mut joint, geometry, v as u32) {
            out.joints[v * 4..v * 4 + 4].copy_from_slice(&[
                joint.x as f32,
                joint.y as f32,
                joint.z as f32,
                joint.w as f32,
            ]);
        }
        if get_mesh_geometry_vertex_weights0(&mut weight, geometry, v as u32) {
            out.weights[v * 4..v * 4 + 4].copy_from_slice(&[
                weight.x as f32,
                weight.y as f32,
                weight.z as f32,
                weight.w as f32,
            ]);
        }
    }
    return out;
}
pub(crate) fn float_offset_for_semantic(
    layout: &VertexAttributeLayout,
    semantic: VertexSemantic,
) -> Option<f64> {
    return layout
        .attributes
        .iter()
        .find(|attribute| attribute.semantic == semantic)
        .map(|attribute| attribute.byte_offset as f64 / 4.0);
}
// flight-lint: allow(f32) reads or writes the Float32Array skinning lanes (joint, normal and inverse-bind palettes, joint indices, weights and the interleaved vertex buffer); bind-pose math is f64
pub fn skin_mesh_geometry(
    geometry: &mut MeshGeometry,
    skeleton: &Skeleton3D,
    bind_pose: &mut MeshSkinBindPose,
) {
    skin_vertices(
        &mut bind_pose.skinned_positions,
        &mut bind_pose.skinned_normals,
        &bind_pose.positions,
        &bind_pose.normals,
        &bind_pose.joints,
        &bind_pose.weights,
        &skeleton.joint_matrices.read().unwrap(),
        &skeleton.normal_matrices.read().unwrap(),
    );
    skin_tangents(
        &mut bind_pose.skinned_tangents,
        &bind_pose.tangents,
        &bind_pose.joints,
        &bind_pose.weights,
        &skeleton.joint_matrices.read().unwrap(),
    );
    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride as f64 / 4.0;
    let position = float_offset_for_semantic(&layout, VertexSemantic::Position);
    let normal = float_offset_for_semantic(&layout, VertexSemantic::Normal);
    let tangent = if !bind_pose.tangents.is_empty() {
        float_offset_for_semantic(&layout, VertexSemantic::Tangent)
    } else {
        None
    };
    for v in 0..bind_pose.skinned_positions.len() / 3 {
        let base = v as f64 * stride;
        if let Some(offset) = position {
            for i in 0..3 {
                write_float_index(
                    &mut geometry.vertices,
                    base + offset + i as f64,
                    bind_pose.skinned_positions[v * 3 + i] as f32,
                );
            }
        }
        if let Some(offset) = normal {
            for i in 0..3 {
                write_float_index(
                    &mut geometry.vertices,
                    base + offset + i as f64,
                    bind_pose.skinned_normals[v * 3 + i] as f32,
                );
            }
        }
        if let Some(offset) = tangent {
            for i in 0..4 {
                write_float_index(
                    &mut geometry.vertices,
                    base + offset + i as f64,
                    bind_pose.skinned_tangents[v * 4 + i] as f32,
                );
            }
        }
    }
    geometry.version = geometry.version.wrapping_add(1);
}
pub fn update_mesh_skin_bind_pose_deform_input(
    bind_pose: &mut MeshSkinBindPose,
    geometry: &MeshGeometry,
) {
    let layout = geometry.layout.read().unwrap();
    let stride = layout.stride as f64 / 4.0;
    let count = if stride > 0.0 {
        (geometry.vertices.len() as f64 / stride) as usize
    } else {
        0
    };
    let count = count.min(bind_pose.positions.len() / 3);
    let position = float_offset_for_semantic(&layout, VertexSemantic::Position);
    let normal = float_offset_for_semantic(&layout, VertexSemantic::Normal);
    for v in 0..count {
        let base = v as f64 * stride;
        if let Some(offset) = position {
            for i in 0..3 {
                bind_pose.positions[v * 3 + i] =
                    read_float_index(&geometry.vertices, base + offset + i as f64);
            }
        }
        if let Some(offset) = normal {
            for i in 0..3 {
                bind_pose.normals[v * 3 + i] =
                    read_float_index(&geometry.vertices, base + offset + i as f64);
            }
        }
    }
}
