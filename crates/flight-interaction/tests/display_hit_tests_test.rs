use crate::interaction_fixture;
use flight_interaction::display_hit_tests::*;

mod default_html_view_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_html_view_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_movie_clip_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_movie_clip_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_node2d_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_node2d_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_rich_text_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_rich_text_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_shape_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_shape_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_text_hit_test_handler {
    use super::*;

    #[test]
    fn returns_false_for_plain_node() {
        let node = interaction_fixture::node();
        assert!(!default_text_hit_test_handler(&node, 0.0, 0.0));
    }
}
