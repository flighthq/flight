use flight_entity::*;

fn create_test_entity() -> Entity {
    return finish_entity(allocate_entity());
}

mod attach_entity_binding {
    use super::*;

    #[test]
    fn creates_a_runtime_object_if_none_is_present() {
        let mut entity = create_test_entity();
        assert!(get_entity_runtime(&entity).is_none());
        attach_entity_binding(&mut entity, Box::new(()));
        assert!(get_entity_runtime(&entity).is_some());
    }

    #[test]
    fn assigns_to_the_binding_slot() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(42_i32));
        let runtime = get_entity_runtime(&entity).unwrap();
        assert!(runtime.binding.is_some());
    }

    #[test]
    fn preserves_an_existing_runtime_while_assigning_its_binding() {
        let mut entity = create_test_entity();
        entity.runtime = Some(create_entity_runtime());
        let runtime_ptr = entity.runtime.as_ref().unwrap() as *const EntityRuntime;

        attach_entity_binding(&mut entity, Box::new(()));

        // The runtime is the same allocation (not replaced).
        let runtime_ptr_after = entity.runtime.as_ref().unwrap() as *const EntityRuntime;
        assert_eq!(runtime_ptr, runtime_ptr_after);
        assert!(entity.runtime.as_ref().unwrap().binding.is_some());
    }
}

mod detach_entity_binding {
    use super::*;

    #[test]
    fn clears_the_binding_while_preserving_the_runtime() {
        let mut entity = create_test_entity();
        let mut runtime = create_entity_runtime();
        runtime.binding = Some(Box::new(()));
        entity.runtime = Some(runtime);

        detach_entity_binding(&mut entity);

        assert!(entity.runtime.is_some());
        assert!(entity.runtime.as_ref().unwrap().binding.is_none());
    }

    #[test]
    fn does_not_allocate_a_runtime_when_no_binding_exists() {
        let mut entity = create_test_entity();

        detach_entity_binding(&mut entity);

        assert!(entity.runtime.is_none());
    }
}

mod get_entity_binding {
    use super::*;

    #[test]
    fn returns_none_if_the_entity_has_no_runtime() {
        let entity = create_test_entity();
        assert!(get_entity_binding(&entity).is_none());
    }

    #[test]
    fn returns_none_if_the_binding_slot_is_empty() {
        let mut entity = create_test_entity();
        entity.runtime = Some(create_entity_runtime());
        assert!(get_entity_binding(&entity).is_none());
    }

    #[test]
    fn returns_the_binding_slot_if_set() {
        let mut entity = create_test_entity();
        let mut runtime = create_entity_runtime();
        runtime.binding = Some(Box::new(99_i32));
        entity.runtime = Some(runtime);
        let binding = get_entity_binding(&entity);
        assert!(binding.is_some());
        assert_eq!(binding.unwrap().downcast_ref::<i32>(), Some(&99_i32));
    }

    #[test]
    fn accepts_a_readonly_entity() {
        let entity: &Entity = &create_test_entity();
        assert!(get_entity_binding(entity).is_none());
    }
}

mod get_entity_binding_as {
    use super::*;

    #[test]
    fn returns_the_binding_with_the_caller_owned_type() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new("wrapper".to_string()));

        let result = get_entity_binding_as::<String>(&entity);

        assert!(result.is_some());
        assert_eq!(result.unwrap(), "wrapper");
    }

    #[test]
    fn returns_none_if_no_binding_exists() {
        let entity: &Entity = &create_test_entity();
        assert!(get_entity_binding_as::<String>(entity).is_none());
    }
}

mod has_entity_binding {
    use super::*;

    #[test]
    fn returns_false_if_the_entity_has_no_runtime() {
        let entity: &Entity = &create_test_entity();
        assert_eq!(has_entity_binding(entity), false);
    }

    #[test]
    fn returns_false_if_the_binding_slot_is_empty() {
        let mut entity = create_test_entity();
        entity.runtime = Some(create_entity_runtime());
        assert_eq!(has_entity_binding(&entity), false);
    }

    #[test]
    fn returns_true_if_a_binding_exists() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(()));
        assert_eq!(has_entity_binding(&entity), true);
    }
}
