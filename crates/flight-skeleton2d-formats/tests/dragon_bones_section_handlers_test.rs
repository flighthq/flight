use flight_skeleton2d_formats::contract::*;

mod register_dragon_bones_section_handlers {
    use super::*;
    #[test]
    fn registers_exactly_the_builtin_sections() {
        let mut registry = create_dragon_bones_registry();
        register_dragon_bones_section_handlers(&mut registry);
        assert_eq!(
            registry.section_handlers.len(),
            DRAGON_BONES_ALL_SECTION_HANDLERS.len()
        );
        assert!(registry.timeline_handlers.is_empty());
        assert_eq!(
            registry
                .section_handlers
                .iter()
                .map(|e| e.kind.as_str())
                .collect::<Vec<_>>(),
            ["bones", "skins", "slots", "animations", "ikConstraints"]
        );
    }
}
