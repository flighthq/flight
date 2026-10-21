use crate::interaction_fixture;
use flight_interaction::hit_tests::HitTestContext;
use flight_interaction::interaction_spatial_index::*;

mod find_spatial_interaction_target {
    use super::*;

    #[test]
    fn returns_none_for_empty_tree() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::manager_for(&root);
        let ctx = HitTestContext::new();
        let candidates: Vec<flight_node::NodeRef> = Vec::new();
        let result = find_spatial_interaction_target(&mgr, &ctx, 0.0, 0.0, false, &candidates);
        assert!(result.is_none());
    }
}

mod refresh_interaction_spatial_index {
    use super::*;

    #[test]
    fn without_index_does_not_panic() {
        let root = interaction_fixture::node();
        let mgr = interaction_fixture::manager_for(&root);
        let mut candidates = Vec::new();
        refresh_interaction_spatial_index(&mgr, &mut candidates);
        assert!(candidates.is_empty());
    }
}
