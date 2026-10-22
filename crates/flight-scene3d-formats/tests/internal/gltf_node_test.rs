use super::*;
use crate::gltf_diagnostics::flush_gltf_drops;
use crate::gltf_json::decode_gltf_json;
use flight_importdiagnostics::ImportDiagnosticDetailValue;
use serde_json::json;
use std::sync::{Arc, RwLock};

#[test]
fn local_transform_keeps_partial_trs_defaults_unnormalized_quaternion_and_matrix_precedence() {
    let parsed = decode_gltf_json(
        &json!({"nodes":[{"translation":[2],"rotation":[0,1,0,2],"scale":[3]},{"matrix":[1,0,0,0,0,1,0,0,0,0,1,0,4,5,6,1],"translation":[99,99,99]}]}),
    );
    let nodes = parsed.source.read().unwrap().nodes.clone().unwrap();
    let transform = gltf_node_transform(&nodes[0]);
    assert_eq!(
        (
            transform.position.x,
            transform.position.y,
            transform.position.z
        ),
        (2.0, 0.0, 0.0)
    );
    assert_eq!(
        (
            transform.rotation.x,
            transform.rotation.y,
            transform.rotation.z,
            transform.rotation.w
        ),
        (0.0, 1.0, 0.0, 2.0)
    );
    assert_eq!(
        (transform.scale.x, transform.scale.y, transform.scale.z),
        (3.0, 1.0, 1.0)
    );
    let mut detached = clone_gltf_transform(&transform);
    detached.position.x = 100.0;
    assert_eq!(transform.position.x, 2.0);
    let matrix = gltf_node_transform(&nodes[1]);
    assert_eq!(
        (matrix.position.x, matrix.position.y, matrix.position.z),
        (4.0, 5.0, 6.0)
    );
}

#[test]
fn world_transforms_keep_first_parent_recover_cycles_and_aggregate_invalid_child_references() {
    let parsed = decode_gltf_json(
        &json!({"nodes":[{"children":[2,99,-1],"translation":[1,0,0]},{"children":[2],"translation":[10,0,0]},{"translation":[0,2,0]}]}),
    );
    let nodes = parsed.source.read().unwrap().nodes.clone().unwrap();
    let drops = Arc::new(RwLock::new(Vec::new()));
    let mut out = vec![create_transform3d()];
    out.reserve(20);
    let capacity = out.capacity();
    build_gltf_node_world_transforms(&mut out, &nodes, &parsed.metadata, Some(&drops));
    assert_eq!(out.len(), 3);
    assert_eq!(out.capacity(), capacity);
    assert_eq!((out[2].position.x, out[2].position.y), (1.0, 2.0));
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    flush_gltf_drops(Some(&diagnostics), Some(&drops));
    assert_eq!(
        diagnostics.read().unwrap()[0].kind,
        "gltf.node-child-out-of-range"
    );
    assert_eq!(
        diagnostics.read().unwrap()[0].detail.as_ref().unwrap()["count"],
        ImportDiagnosticDetailValue::Number(2.0)
    );
    assert_eq!(
        diagnostics.read().unwrap()[1].kind,
        "gltf.node-multiple-parents"
    );
    assert_eq!(
        diagnostics.read().unwrap()[1].detail.as_ref().unwrap()["firstParent"],
        ImportDiagnosticDetailValue::Number(0.0)
    );
    let parsed = decode_gltf_json(
        &json!({"nodes":[{"children":[1],"translation":[1,0,0]},{"children":[0],"translation":[2,0,0]}]}),
    );
    drops.write().unwrap().clear();
    build_gltf_node_world_transforms(
        &mut out,
        &parsed.source.read().unwrap().nodes.clone().unwrap(),
        &parsed.metadata,
        Some(&drops),
    );
    assert_eq!((out[0].position.x, out[1].position.x), (1.0, 3.0));
    assert_eq!(drops.read().unwrap()[0].kind, "gltf.node-hierarchy-cycle");
    assert_eq!(drops.read().unwrap()[0].count, 1);
}

#[test]
fn iterative_world_resolution_handles_depth_2048_and_preserves_original_fractional_json_child_classification()
 {
    let nodes: Vec<_> = (0..2048)
        .map(|index| {
            if index + 1 < 2048 {
                json!({"children":[index+1],"translation":[1,0,0]})
            } else {
                json!({"translation":[1,0,0]})
            }
        })
        .collect();
    let parsed = decode_gltf_json(&json!({"nodes":nodes}));
    let mut out = Vec::new();
    build_gltf_node_world_transforms(
        &mut out,
        &parsed.source.read().unwrap().nodes.clone().unwrap(),
        &parsed.metadata,
        None,
    );
    assert_eq!(out.len(), 2048);
    assert_eq!(out[2047].position.x, 2048.0);
    let parsed = decode_gltf_json(&json!({"nodes":[{"children":[0.9999999999]}]}));
    let drops = Arc::new(RwLock::new(Vec::new()));
    build_gltf_node_world_transforms(
        &mut out,
        &parsed.source.read().unwrap().nodes.clone().unwrap(),
        &parsed.metadata,
        Some(&drops),
    );
    assert_eq!(drops.read().unwrap()[0].kind, "gltf.node-multiple-parents");
}
