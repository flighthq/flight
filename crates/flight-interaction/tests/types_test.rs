use flight_interaction::types::*;

mod create_focus_manager_options {
    use super::*;

    #[test]
    fn returns_all_none() {
        let opts = create_focus_manager_options();
        assert!(opts.wrap.is_none());
    }
}

mod create_interaction_manager_options {
    use super::*;

    #[test]
    fn returns_all_none() {
        let opts = create_interaction_manager_options();
        assert!(opts.cursor_backend.is_none());
        assert!(opts.double_click_delay.is_none());
        assert!(opts.double_click_distance.is_none());
        assert!(opts.enabled.is_none());
        assert!(opts.precise.is_none());
        assert!(opts.spatial_index.is_none());
        assert!(opts.suppress_touch_hover.is_none());
        assert!(opts.tracked_subscribers_only.is_none());
    }
}
