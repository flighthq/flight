use flight_skeleton2d_formats::contract::*;

mod register_all_spine_json_handlers {
    use super::*;
    #[test]
    fn registers_both_handler_families() {
        let mut registry = create_spine_json_registry();
        register_all_spine_json_handlers(&mut registry);
        assert_eq!(registry.section_handlers.len(), 8);
        assert_eq!(registry.timeline_handlers.len(), 8);
    }
}
