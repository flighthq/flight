use crate::gltf_diagnostics::{GltfDropTally, tally_gltf_numbers};
use crate::gltf_json::{GltfJsonMetadata, gltf_original_array_number};
use crate::gltf_schema::GltfNode;
use flight_entity::Ref;
use flight_geometry::contract::{
    Transform3D, compose_matrix4_from_transform3d, create_matrix4, create_transform3d,
    decompose_matrix4_to_transform3d, multiply_matrix4,
};
use flight_importdiagnostics::ImportDiagnosticSeverity;

#[cfg(test)]
#[path = "../tests/internal/gltf_node_test.rs"]
mod tests;

// flight-lint: allow(f64) private exact-integer limb keeps JSON child indices precise for bounds/parent-table lookups; local/world coordinate math remains canonical f32
pub(crate) fn build_gltf_node_world_transforms(
    out: &mut Vec<Transform3D>,
    nodes: &[Ref<GltfNode>],
    metadata: &GltfJsonMetadata,
    drops: Option<&Ref<Vec<GltfDropTally>>>,
) {
    out.clear();
    let mut parents = vec![-1_i32; nodes.len()];
    for (parent, node) in nodes.iter().enumerate() {
        let children = node.read().unwrap().children.clone().unwrap_or_default();
        for (position, current) in children.into_iter().enumerate() {
            let child = gltf_original_array_number(metadata, node, "children", position, current);
            if child < 0.0 || child >= nodes.len() as f64 {
                tally_gltf_numbers(
                    drops,
                    ImportDiagnosticSeverity::Recover,
                    "gltf.node-child-out-of-range",
                    &[("firstChild", current)],
                );
                continue;
            }
            if !child.is_finite() || child.fract() != 0.0 {
                // A noninteger TypedArray key reads undefined, which is not the source sentinel -1.
                tally_gltf_numbers(
                    drops,
                    ImportDiagnosticSeverity::Recover,
                    "gltf.node-multiple-parents",
                    &[("firstChild", current)],
                );
                continue;
            }
            let child = child as usize;
            if parents[child] != -1 {
                tally_gltf_numbers(
                    drops,
                    ImportDiagnosticSeverity::Recover,
                    "gltf.node-multiple-parents",
                    &[
                        ("firstChild", current),
                        ("firstParent", parents[child] as f32),
                    ],
                );
                continue;
            }
            parents[child] = parent as i32;
        }
    }
    let local_matrices: Vec<_> = nodes
        .iter()
        .map(|node| {
            let mut matrix = create_matrix4();
            compose_matrix4_from_transform3d(&mut matrix, &gltf_node_transform(node));
            return matrix;
        })
        .collect();
    let mut world_matrices: Vec<_> = nodes.iter().map(|_| create_matrix4()).collect();
    let mut state = vec![0_u8; nodes.len()];
    let mut stack = Vec::new();
    for start in 0..nodes.len() {
        while state[start] != 2 {
            stack.clear();
            let mut node = start as i32;
            let mut cycle = false;
            while node >= 0 && state[node as usize] != 2 {
                let index = node as usize;
                if state[index] == 1 {
                    tally_gltf_numbers(
                        drops,
                        ImportDiagnosticSeverity::Recover,
                        "gltf.node-hierarchy-cycle",
                        &[("firstNode", node as f32)],
                    );
                    parents[index] = -1;
                    for &pending in &stack {
                        state[pending] = 0;
                    }
                    cycle = true;
                    break;
                }
                state[index] = 1;
                stack.push(index);
                node = parents[index];
            }
            if cycle {
                continue;
            }
            while let Some(node) = stack.pop() {
                let parent = parents[node];
                if parent < 0 {
                    world_matrices[node].m = local_matrices[node].m;
                } else {
                    let parent = parent as usize;
                    if parent < node {
                        let (before, after) = world_matrices.split_at_mut(node);
                        multiply_matrix4(&mut after[0], &before[parent], &local_matrices[node]);
                    } else {
                        let (before, after) = world_matrices.split_at_mut(parent);
                        multiply_matrix4(&mut before[node], &after[0], &local_matrices[node]);
                    }
                }
                state[node] = 2;
            }
        }
    }
    for matrix in &world_matrices {
        let mut transform = create_transform3d();
        decompose_matrix4_to_transform3d(&mut transform, matrix);
        out.push(transform);
    }
}

pub(crate) fn clone_gltf_transform(source: &Transform3D) -> Transform3D {
    let mut out = create_transform3d();
    out.position.x = source.position.x;
    out.position.y = source.position.y;
    out.position.z = source.position.z;
    out.rotation.x = source.rotation.x;
    out.rotation.y = source.rotation.y;
    out.rotation.z = source.rotation.z;
    out.rotation.w = source.rotation.w;
    out.scale.x = source.scale.x;
    out.scale.y = source.scale.y;
    out.scale.z = source.scale.z;
    return out;
}

pub(crate) fn gltf_node_transform(node: &Ref<GltfNode>) -> Transform3D {
    let node = node.read().unwrap();
    let mut out = create_transform3d();
    if let Some(values) = &node.matrix {
        let mut matrix = create_matrix4();
        matrix.m.fill(f32::NAN);
        for (target, value) in matrix.m.iter_mut().zip(values) {
            *target = *value;
        }
        decompose_matrix4_to_transform3d(&mut out, &matrix);
        return out;
    }
    if let Some(values) = &node.translation {
        out.position.x = values.first().copied().unwrap_or(0.0);
        out.position.y = values.get(1).copied().unwrap_or(0.0);
        out.position.z = values.get(2).copied().unwrap_or(0.0);
    }
    if let Some(values) = &node.rotation {
        out.rotation.x = values.first().copied().unwrap_or(0.0);
        out.rotation.y = values.get(1).copied().unwrap_or(0.0);
        out.rotation.z = values.get(2).copied().unwrap_or(0.0);
        out.rotation.w = values.get(3).copied().unwrap_or(1.0);
    }
    if let Some(values) = &node.scale {
        out.scale.x = values.first().copied().unwrap_or(1.0);
        out.scale.y = values.get(1).copied().unwrap_or(1.0);
        out.scale.z = values.get(2).copied().unwrap_or(1.0);
    }
    return out;
}
