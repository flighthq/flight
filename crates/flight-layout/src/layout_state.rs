use std::collections::HashMap;

use crate::types::*;

pub fn create_layout_state() -> LayoutState {
    let mut out = LayoutState {
        guard: None,
        last_failure_actual_length: 0,
        last_failure_kind: None,
        last_failure_node_index: 0,
        last_failure_parent_index: 0,
        last_failure_required_length: 0,
        last_failure_resolver_kind: None,
        resolvers: HashMap::new(),
    };
    initialize_layout_state(&mut out);
    return out;
}

pub fn initialize_layout_state(out: &mut LayoutState) {
    out.guard = None;
    out.last_failure_actual_length = 0;
    out.last_failure_kind = None;
    out.last_failure_node_index = -1;
    out.last_failure_parent_index = -1;
    out.last_failure_required_length = 0;
    out.last_failure_resolver_kind = None;
    out.resolvers = HashMap::new();
}

pub fn register_layout_resolver(
    state: &mut LayoutState,
    kind: &str,
    resolver: Option<LayoutResolver>,
) {
    match resolver {
        None => {
            state.resolvers.remove(kind);
        }
        Some(r) => {
            state.resolvers.insert(kind.to_string(), r);
        }
    }
}
