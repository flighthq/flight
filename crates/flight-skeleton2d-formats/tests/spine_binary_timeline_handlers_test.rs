use flight_skeleton2d_formats::contract::*;

mod register_spine_binary_timeline_handlers {
    use super::*;
    #[test]
    fn registers_exactly_the_builtin_timelines() {
        let mut registry = create_spine_binary_registry();
        register_spine_binary_timeline_handlers(&mut registry);
        assert_eq!(
            registry.timeline_handlers.len(),
            SPINE_BINARY_ALL_TIMELINE_HANDLERS.len()
        );
        assert!(registry.section_handlers.is_empty());
    }
}
