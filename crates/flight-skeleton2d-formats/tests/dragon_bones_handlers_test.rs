use flight_skeleton2d_formats::contract::*;

mod register_all_dragon_bones_handlers {
    use super::*;
    #[test]
    fn registers_both_handler_families() {
        let mut registry = create_dragon_bones_registry();
        register_all_dragon_bones_handlers(&mut registry);
        assert_eq!(registry.section_handlers.len(), 5);
        assert_eq!(registry.timeline_handlers.len(), 5);
    }
}
