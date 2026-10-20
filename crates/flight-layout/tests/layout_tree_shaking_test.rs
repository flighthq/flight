// These tests verify that layout resolvers are independently registerable,
// matching the TS tree-shaking tests that verify esbuild can independently
// bundle each resolver. In Rust, the module system provides this separation
// inherently; these tests document that each resolver registers its own kind
// without pulling in the others.

use flight_layout::*;

mod layout_resolver_tree_shaking {
    use super::*;

    #[test]
    fn keeps_anchor_only_assembly_independent_of_flex_and_grid() {
        let mut state = create_layout_state();
        register_anchor_layout_resolver(&mut state);
        assert_eq!(state.resolvers.len(), 1);
        assert!(state.resolvers.contains_key(ANCHOR_LAYOUT_KIND));
        assert!(!state.resolvers.contains_key(FLEX_LAYOUT_KIND));
        assert!(!state.resolvers.contains_key(GRID_LAYOUT_KIND));
    }

    #[test]
    fn includes_each_optional_resolver_only_through_its_named_registrar() {
        let mut flex_state = create_layout_state();
        register_flex_layout_resolver(&mut flex_state);
        assert_eq!(flex_state.resolvers.len(), 1);
        assert!(flex_state.resolvers.contains_key(FLEX_LAYOUT_KIND));
        assert!(!flex_state.resolvers.contains_key(GRID_LAYOUT_KIND));

        let mut grid_state = create_layout_state();
        register_grid_layout_resolver(&mut grid_state);
        assert_eq!(grid_state.resolvers.len(), 1);
        assert!(grid_state.resolvers.contains_key(GRID_LAYOUT_KIND));
        assert!(!grid_state.resolvers.contains_key(FLEX_LAYOUT_KIND));
    }
}
