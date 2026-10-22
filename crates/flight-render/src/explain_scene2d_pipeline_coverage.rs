use std::collections::HashSet;

use flight_entity::Kind;
use flight_node::NodeRef;

use crate::{RenderState, Scene2DPipelineCoverageExplanation};

fn collect_used_kinds(root: &NodeRef) -> HashSet<Kind> {
    let mut out = HashSet::new();
    let mut stack = vec![root.clone()];
    while let Some(current) = stack.pop() {
        let current = current.read().unwrap();
        out.insert(current.node_fields().kind.clone());
        if let Some(children) = &current.node_runtime().children {
            for child in children.iter().rev() {
                stack.push(child.clone());
            }
        }
    }
    return out;
}

pub fn explain_scene_2d_pipeline_coverage<S: RenderState>(
    state: &S,
    scene: &NodeRef,
) -> Scene2DPipelineCoverageExplanation {
    let used_set = collect_used_kinds(scene);
    let mut registered_kinds = state.render_registries().node_renderers.key_order.clone();
    sort_kinds(&mut registered_kinds);
    let mut used_kinds: Vec<_> = used_set.iter().cloned().collect();
    sort_kinds(&mut used_kinds);
    let registered_set: HashSet<_> = registered_kinds.iter().cloned().collect();
    let uncovered_kinds = used_kinds
        .iter()
        .filter(|kind| !registered_set.contains(*kind))
        .cloned()
        .collect();
    let unused_registrations = registered_kinds
        .iter()
        .filter(|kind| !used_set.contains(*kind))
        .cloned()
        .collect();
    return Scene2DPipelineCoverageExplanation {
        registered_kinds,
        uncovered_kinds,
        unused_registrations,
        used_kinds,
    };
}

pub(crate) fn sort_kinds(kinds: &mut [Kind]) {
    kinds.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
