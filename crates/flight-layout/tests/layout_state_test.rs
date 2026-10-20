use flight_layout::*;

fn noop_resolver(
    _out: &mut [f32],
    _tree: &LayoutTree,
    _sizes: &[f32],
    _parent: usize,
    _child: usize,
) -> Option<LayoutResolutionFailureKind> {
    return None;
}

fn replacement_resolver(
    _out: &mut [f32],
    _tree: &LayoutTree,
    _sizes: &[f32],
    _parent: usize,
    _child: usize,
) -> Option<LayoutResolutionFailureKind> {
    return Some(LayoutResolutionFailureKind::InvalidItemStyle);
}

mod create_layout_state {
    use super::*;

    #[test]
    fn starts_with_an_empty_resolver_registry_and_no_retained_failure() {
        let state = create_layout_state();
        assert_eq!(state.resolvers.len(), 0);
        assert_eq!(state.last_failure_kind, None);
        assert_eq!(state.last_failure_node_index, -1);
        assert_eq!(state.last_failure_parent_index, -1);
        assert!(state.guard.is_none());
    }
}

mod initialize_layout_state {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_layout_state() {
        // Verify initialize_layout_state exists as a callable function
        let mut state = create_layout_state();
        initialize_layout_state(&mut state);
        assert_eq!(state.resolvers.len(), 0);
    }
}

mod register_layout_resolver {
    use super::*;

    #[test]
    fn is_open_last_write_wins_and_accepts_none_to_unregister() {
        let mut state = create_layout_state();
        register_layout_resolver(&mut state, "acme.Flow", Some(noop_resolver));
        register_layout_resolver(&mut state, "acme.Flow", Some(replacement_resolver));
        // Verify the resolver was replaced by calling it and checking its return value
        let resolver = state.resolvers.get("acme.Flow").copied().unwrap();
        let tree = LayoutTree { nodes: vec![] };
        assert_eq!(
            resolver(&mut [], &tree, &[], 0, 0),
            Some(LayoutResolutionFailureKind::InvalidItemStyle)
        );
        register_layout_resolver(&mut state, "acme.Flow", None);
        assert!(!state.resolvers.contains_key("acme.Flow"));
    }
}
