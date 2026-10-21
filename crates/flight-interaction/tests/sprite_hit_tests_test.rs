use crate::interaction_fixture;
use flight_interaction::sprite_hit_tests::*;

mod default_quad_batch_hit_test_handler {
    use super::*;

    #[test]
    fn no_data_returns_false() {
        let node = interaction_fixture::node();
        assert!(!default_quad_batch_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_sprite_hit_test_handler {
    use super::*;

    #[test]
    fn no_bitmap_returns_false() {
        let node = interaction_fixture::node();
        assert!(!default_sprite_hit_test_handler(&node, 0.0, 0.0));
    }
}

mod default_tilemap_hit_test_handler {
    use super::*;

    #[test]
    fn no_data_returns_false() {
        let node = interaction_fixture::node();
        assert!(!default_tilemap_hit_test_handler(&node, 0.0, 0.0));
    }
}
