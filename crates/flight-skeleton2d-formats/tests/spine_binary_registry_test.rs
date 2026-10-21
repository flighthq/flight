use std::sync::Arc;

use flight_skeleton2d_formats::contract::*;

mod create_spine_binary_registry {
    use super::*;
    #[test]
    fn creates_independent_empty_registries() {
        let mut left = create_spine_binary_registry();
        let right = create_spine_binary_registry();
        register_spine_binary_section_handler(&mut left, "vendor", Arc::new(|_| {}));
        assert_eq!(left.section_handlers.len(), 1);
        assert!(right.section_handlers.is_empty());
    }
}

mod get_spine_binary_section_handler {
    use super::*;
    #[test]
    fn returns_only_registered_handlers() {
        let registry = create_spine_binary_registry();
        assert!(get_spine_binary_section_handler(&registry, "missing").is_none());
    }
}

mod get_spine_binary_timeline_handler {
    use super::*;
    #[test]
    fn returns_only_registered_handlers() {
        let registry = create_spine_binary_registry();
        assert!(get_spine_binary_timeline_handler(&registry, "missing").is_none());
    }
}

mod register_spine_binary_section_handler {
    use super::*;
    #[test]
    fn is_last_write_wins_without_moving_the_key() {
        let mut registry = create_spine_binary_registry();
        let first: SpineBinarySectionHandler = Arc::new(|_| {});
        let second: SpineBinarySectionHandler = Arc::new(|_| {});
        register_spine_binary_section_handler(&mut registry, "a", first);
        register_spine_binary_section_handler(&mut registry, "b", Arc::new(|_| {}));
        register_spine_binary_section_handler(&mut registry, "a", second.clone());
        assert_eq!(registry.section_handlers[0].kind, "a");
        assert!(Arc::ptr_eq(
            &get_spine_binary_section_handler(&registry, "a").unwrap(),
            &second
        ));
    }
}

mod register_spine_binary_timeline_handler {
    use super::*;
    #[test]
    fn is_last_write_wins_without_moving_the_key() {
        let mut registry = create_spine_binary_registry();
        let first: SpineBinaryTimelineHandler = Arc::new(|_| {});
        let second: SpineBinaryTimelineHandler = Arc::new(|_| {});
        register_spine_binary_timeline_handler(&mut registry, "a", first);
        register_spine_binary_timeline_handler(&mut registry, "b", Arc::new(|_| {}));
        register_spine_binary_timeline_handler(&mut registry, "a", second.clone());
        assert_eq!(registry.timeline_handlers[0].kind, "a");
        assert!(Arc::ptr_eq(
            &get_spine_binary_timeline_handler(&registry, "a").unwrap(),
            &second
        ));
    }
}

mod unregister_spine_binary_section_handler {
    use super::*;
    #[test]
    fn removes_only_a_present_entry() {
        let mut registry = create_spine_binary_registry();
        assert!(!unregister_spine_binary_section_handler(&mut registry, "a"));
        register_spine_binary_section_handler(&mut registry, "a", Arc::new(|_| {}));
        assert!(unregister_spine_binary_section_handler(&mut registry, "a"));
    }
}

mod unregister_spine_binary_timeline_handler {
    use super::*;
    #[test]
    fn removes_only_a_present_entry() {
        let mut registry = create_spine_binary_registry();
        assert!(!unregister_spine_binary_timeline_handler(
            &mut registry,
            "a"
        ));
        register_spine_binary_timeline_handler(&mut registry, "a", Arc::new(|_| {}));
        assert!(unregister_spine_binary_timeline_handler(&mut registry, "a"));
    }
}
