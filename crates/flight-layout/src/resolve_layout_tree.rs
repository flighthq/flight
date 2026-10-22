use crate::types::*;

fn clear_layout_failure(state: &mut LayoutState) {
    state.last_failure_actual_length = 0;
    state.last_failure_kind = None;
    state.last_failure_node_index = -1;
    state.last_failure_parent_index = -1;
    state.last_failure_required_length = 0;
    state.last_failure_resolver_kind = None;
}

pub fn explain_layout_resolution(
    state: &LayoutState,
    tree: &LayoutTree,
    node_index: i32,
) -> Option<LayoutResolutionExplanation> {
    if state.last_failure_kind.is_some()
        && (node_index < 0
            || state.last_failure_node_index < 0
            || node_index == state.last_failure_node_index)
    {
        return Some(LayoutResolutionExplanation {
            actual_length: state.last_failure_actual_length,
            kind: state.last_failure_kind.unwrap(),
            node_index: state.last_failure_node_index,
            parent_index: state.last_failure_parent_index,
            required_length: state.last_failure_required_length,
            resolver_kind: state.last_failure_resolver_kind.clone(),
        });
    }

    let nodes = &tree.nodes;
    if node_index < 0 || node_index as usize >= nodes.len() {
        return None;
    }
    let idx = node_index as usize;
    let node = &nodes[idx];
    if node.parent_index < -1 || node.parent_index >= node_index {
        return Some(explanation(
            LayoutResolutionFailureKind::InvalidHierarchy,
            node_index,
            node.parent_index,
            Some(node.kind.clone()),
        ));
    }
    for i in (idx + 1)..nodes.len() {
        if nodes[i].parent_index == node_index && !state.resolvers.contains_key(&node.kind) {
            return Some(explanation(
                LayoutResolutionFailureKind::UnregisteredKind,
                node_index,
                -1,
                Some(node.kind.clone()),
            ));
        }
    }
    return None;
}

fn explanation(
    kind: LayoutResolutionFailureKind,
    node_index: i32,
    parent_index: i32,
    resolver_kind: Option<String>,
) -> LayoutResolutionExplanation {
    return LayoutResolutionExplanation {
        actual_length: 0,
        kind,
        node_index,
        parent_index,
        required_length: 0,
        resolver_kind,
    };
}

#[allow(clippy::too_many_arguments)]
fn fail_layout_resolution(
    state: &mut LayoutState,
    tree: &LayoutTree,
    kind: LayoutResolutionFailureKind,
    node_index: i32,
    parent_index: i32,
    required_length: i32,
    actual_length: i32,
    resolver_kind: Option<String>,
) -> bool {
    state.last_failure_actual_length = actual_length;
    state.last_failure_kind = Some(kind);
    state.last_failure_node_index = node_index;
    state.last_failure_parent_index = parent_index;
    state.last_failure_required_length = required_length;
    state.last_failure_resolver_kind = resolver_kind;
    let guard = state.guard;
    if let Some(guard_fn) = guard {
        if let Some(exp) = explain_layout_resolution(state, tree, node_index) {
            guard_fn(&exp);
        }
    }
    return false;
}

fn finite_size(value: f32) -> f32 {
    return if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    };
}

pub fn resolve_layout_tree(
    out: &mut [f32],
    state: &mut LayoutState,
    tree: &LayoutTree,
    intrinsic_sizes: &[f32],
    available_width: f32,
    available_height: f32,
) -> bool {
    clear_layout_failure(state);
    let nodes = &tree.nodes;
    let required_out_length = nodes.len() * 4;
    if out.len() < required_out_length {
        return fail_layout_resolution(
            state,
            tree,
            LayoutResolutionFailureKind::OutputTooSmall,
            -1,
            -1,
            required_out_length as i32,
            out.len() as i32,
            None,
        );
    }
    let required_intrinsic_length = nodes.len() * 2;
    if intrinsic_sizes.len() < required_intrinsic_length {
        return fail_layout_resolution(
            state,
            tree,
            LayoutResolutionFailureKind::IntrinsicSizesTooSmall,
            -1,
            -1,
            required_intrinsic_length as i32,
            intrinsic_sizes.len() as i32,
            None,
        );
    }

    let root_width = finite_size(available_width);
    let root_height = finite_size(available_height);
    for i in 0..nodes.len() {
        let node = &nodes[i];
        let parent_index = node.parent_index;
        if parent_index < -1 || parent_index >= i as i32 {
            return fail_layout_resolution(
                state,
                tree,
                LayoutResolutionFailureKind::InvalidHierarchy,
                i as i32,
                parent_index,
                0,
                0,
                Some(node.kind.clone()),
            );
        }
        let offset = i * 4;
        if parent_index == -1 {
            out[offset] = 0.0;
            out[offset + 1] = 0.0;
            out[offset + 2] = root_width;
            out[offset + 3] = root_height;
            continue;
        }

        let parent_kind: &str = &nodes[parent_index as usize].kind;
        let resolver = state.resolvers.get(parent_kind).copied();
        match resolver {
            None => {
                return fail_layout_resolution(
                    state,
                    tree,
                    LayoutResolutionFailureKind::UnregisteredKind,
                    parent_index,
                    -1,
                    0,
                    0,
                    Some(parent_kind.to_string()),
                );
            }
            Some(resolver_fn) => {
                let failure = resolver_fn(out, tree, intrinsic_sizes, parent_index as usize, i);
                if let Some(failure_kind) = failure {
                    let failure_node_index =
                        if failure_kind == LayoutResolutionFailureKind::InvalidContainerStyle {
                            parent_index
                        } else {
                            i as i32
                        };
                    return fail_layout_resolution(
                        state,
                        tree,
                        failure_kind,
                        failure_node_index,
                        parent_index,
                        0,
                        0,
                        Some(parent_kind.to_string()),
                    );
                }
            }
        }
    }
    return true;
}
