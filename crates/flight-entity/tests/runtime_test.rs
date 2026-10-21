use flight_entity::*;

fn create_test_entity() -> Entity {
    return allocate_entity();
}

mod create_entity_runtime_tests {
    use super::*;

    #[test]
    fn returns_a_runtime() {
        let runtime = create_entity_runtime();
        // The runtime is a valid struct.
        assert!(runtime.binding.is_none());
    }

    #[test]
    fn has_a_none_binding_slot() {
        let runtime = create_entity_runtime();
        assert!(runtime.binding.is_none());
    }
}

mod entity_runtime {
    use super::*;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn is_one_thin_pointer() {
        assert_eq!(std::mem::size_of::<EntityRuntime>(), std::mem::size_of::<usize>());
    }

    #[test]
    fn is_send_and_sync() {
        assert_send_sync::<EntityRuntime>();
        assert_send_sync::<Entity>();
    }

    #[test]
    fn defaults_to_an_empty_slot() {
        let runtime: EntityRuntime = allocate_entity();
        assert!(runtime.data.is_none());
    }

    #[test]
    fn clone_gives_a_fresh_empty_runtime() {
        let mut entity = create_test_entity();
        set_entity_uid(&mut entity, "source".to_string());
        attach_entity_binding(&mut entity, Box::new(7_i32));
        let copy = entity.runtime.clone();
        assert!(copy.data.is_none());
        assert!(has_entity_binding(&entity));
    }

    #[test]
    fn always_compares_equal() {
        let mut bound = create_test_entity();
        attach_entity_binding(&mut bound, Box::new(()));
        let empty = create_test_entity();
        assert!(bound.runtime == empty.runtime);
        assert_eq!(bound, empty);
    }

    #[test]
    fn debug_prints_an_opaque_marker() {
        let mut entity = create_test_entity();
        set_entity_uid(&mut entity, "secret-uid".to_string());
        let text = format!("{:?}", entity.runtime);
        assert_eq!(text, "EntityRuntime(..)");
        assert!(!format!("{:?}", entity).contains("secret-uid"));
    }
}

mod get_entity_runtime_tests {
    use super::*;

    #[test]
    fn returns_none_for_a_fresh_entity() {
        let entity = create_test_entity();
        assert!(get_entity_runtime(&entity).is_none());
    }

    #[test]
    fn returns_the_runtime_object_when_set() {
        let mut entity = create_test_entity();
        entity.runtime.data = Some(Box::new(create_entity_runtime()));
        let runtime = get_entity_runtime(&entity);
        assert!(runtime.is_some());
        assert!(runtime.unwrap().binding.is_none());
    }
}

mod has_entity_runtime_tests {
    use super::*;

    #[test]
    fn returns_false_for_a_fresh_entity() {
        let entity = create_test_entity();
        assert_eq!(has_entity_runtime(&entity), false);
    }

    #[test]
    fn returns_true_after_a_binding_is_attached() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(()));
        assert_eq!(has_entity_runtime(&entity), true);
    }
}
