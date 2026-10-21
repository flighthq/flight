use flight_skeleton2d_formats::contract::*;

mod register_dragon_bones_timeline_handlers {
    use super::*;
    #[test]
    fn registers_exactly_the_builtin_timelines() {
        let mut registry = create_dragon_bones_registry();
        register_dragon_bones_timeline_handlers(&mut registry);
        assert_eq!(
            registry.timeline_handlers.len(),
            DRAGON_BONES_ALL_TIMELINE_HANDLERS.len()
        );
        assert!(registry.section_handlers.is_empty());
        assert_eq!(
            registry
                .timeline_handlers
                .iter()
                .map(|e| e.kind.as_str())
                .collect::<Vec<_>>(),
            ["bone", "slot", "deform", "ik", "zOrder"]
        );
    }
}
