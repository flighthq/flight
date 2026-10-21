use flight_skeleton2d_formats::contract::*;

mod register_spine_json_timeline_handlers {
    use super::*;
    #[test]
    fn registers_exactly_the_builtin_timelines() {
        let mut registry = create_spine_json_registry();
        register_spine_json_timeline_handlers(&mut registry);
        assert_eq!(
            registry.timeline_handlers.len(),
            SPINE_JSON_ALL_TIMELINE_HANDLERS.len()
        );
        assert!(registry.section_handlers.is_empty());
    }
}
