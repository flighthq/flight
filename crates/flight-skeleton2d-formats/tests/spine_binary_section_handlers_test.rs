use flight_skeleton2d_formats::contract::*;

mod register_spine_binary_section_handlers {
    use super::*;
    #[test]
    fn registers_exactly_the_builtin_sections() {
        let mut registry = create_spine_binary_registry();
        register_spine_binary_section_handlers(&mut registry);
        assert_eq!(
            registry.section_handlers.len(),
            SPINE_BINARY_ALL_SECTION_HANDLERS.len()
        );
        assert!(registry.timeline_handlers.is_empty());
    }
}
