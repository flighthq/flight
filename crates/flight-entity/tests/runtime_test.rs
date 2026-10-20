use flight_entity::*;

fn create_test_entity() -> Entity {
    return finish_entity(allocate_entity());
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
        entity.runtime = Some(create_entity_runtime());
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
