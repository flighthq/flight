use flight_geometry::create_rectangle;

use crate::interaction_fixture;
use flight_interaction::spatial_query::*;

mod hit_test_area_query {
    use super::*;

    #[test]
    fn includes_node_in_region() {
        let root = interaction_fixture::node();
        let rect = create_rectangle(-10.0, -10.0, 20.0, 20.0);
        let mut out = Vec::new();
        let mut revisions = interaction_fixture::revisions();
        hit_test_area_query(&root, &rect, &mut out, &mut revisions);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn excludes_disabled_node() {
        let root = interaction_fixture::node();
        {
            let mut n = root.write().unwrap();
            n.node_fields_mut().enabled = false;
        }
        let rect = create_rectangle(-10.0, -10.0, 20.0, 20.0);
        let mut out = Vec::new();
        let mut revisions = interaction_fixture::revisions();
        hit_test_area_query(&root, &rect, &mut out, &mut revisions);
        assert!(out.is_empty());
    }
}

mod hit_test_area_query_circle {
    use super::*;

    #[test]
    fn includes_node_in_circle() {
        let root = interaction_fixture::node();
        let mut out = Vec::new();
        let mut revisions = interaction_fixture::revisions();
        hit_test_area_query_circle(&root, 0.0, 0.0, 10.0, &mut out, &mut revisions);
        assert_eq!(out.len(), 1);
    }
}
