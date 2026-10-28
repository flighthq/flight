//! flight-compiler: target-native

use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct BaseEntity {
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(BaseEntity);

fn create_test_entity() -> BaseEntity {
    return allocate_entity();
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
        entity.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        let runtime_ptr = entity.entity_runtime().data.as_deref().unwrap() as *const EntityRuntime;

        attach_entity_binding(&mut entity, Box::new(()));

        // The runtime is the same allocation (not replaced).
        let runtime_ptr_after =
            entity.entity_runtime().data.as_deref().unwrap() as *const EntityRuntime;
        assert_eq!(runtime_ptr, runtime_ptr_after);
        assert!(
            entity
                .entity_runtime()
                .data
                .as_ref()
                .unwrap()
                .binding
                .is_some()
        );
    }
}

mod detach_entity_binding {
    use super::*;

    #[test]
    fn clears_the_binding_while_preserving_the_runtime() {
        let mut entity = create_test_entity();
        let mut runtime = create_entity_runtime();
        runtime.binding = Some(Box::new(()));
        entity.entity_runtime_mut().data = Some(Box::new(runtime));

        detach_entity_binding(&mut entity);

        assert!(entity.entity_runtime().data.is_some());
        assert!(
            entity
                .entity_runtime()
                .data
                .as_ref()
                .unwrap()
                .binding
                .is_none()
        );
    }

    #[test]
    fn does_not_allocate_a_runtime_when_no_binding_exists() {
        let mut entity = create_test_entity();

        detach_entity_binding(&mut entity);

        assert!(entity.entity_runtime().data.is_none());
    }

    #[test]
    fn preserves_the_uid_when_clearing_the_binding() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(()));
        set_entity_uid(&mut entity, "kept".to_string());

        detach_entity_binding(&mut entity);

        assert!(has_entity_runtime(&entity));
        assert!(!has_entity_binding(&entity));
        assert_eq!(get_entity_uid(&mut entity), "kept");
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
        entity.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        assert!(get_entity_binding(&entity).is_none());
    }

    #[test]
    fn returns_the_binding_slot_if_set() {
        let mut entity = create_test_entity();
        let mut runtime = create_entity_runtime();
        runtime.binding = Some(Box::new(99_i32));
        entity.entity_runtime_mut().data = Some(Box::new(runtime));
        let binding = get_entity_binding(&entity);
        assert!(binding.is_some());
        assert_eq!(binding.unwrap().downcast_ref::<i32>(), Some(&99_i32));
    }

    #[test]
    fn accepts_a_readonly_entity() {
        let entity: &BaseEntity = &create_test_entity();
        assert!(get_entity_binding(entity).is_none());
    }
}

mod get_entity_binding_as {
    use super::*;

    #[test]
    fn returns_the_binding_with_the_caller_owned_type() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new("wrapper".to_string()));

        let result = get_entity_binding_as::<String, _>(&entity);

        assert!(result.is_some());
        assert_eq!(result.unwrap(), "wrapper");
    }

    #[test]
    fn returns_none_if_no_binding_exists() {
        let entity: &BaseEntity = &create_test_entity();
        assert!(get_entity_binding_as::<String, _>(entity).is_none());
    }

    #[test]
    fn returns_none_when_the_binding_has_a_different_type() {
        // TS getEntityBindingAs is an unchecked cast; Rust downcasts and returns None instead.
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(1_i32));
        assert!(get_entity_binding_as::<String, _>(&entity).is_none());
    }
}

mod has_entity_binding {
    use super::*;

    #[test]
    fn returns_false_if_the_entity_has_no_runtime() {
        let entity: &BaseEntity = &create_test_entity();
        assert_eq!(has_entity_binding(entity), false);
    }

    #[test]
    fn returns_false_if_the_binding_slot_is_empty() {
        let mut entity = create_test_entity();
        entity.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        assert_eq!(has_entity_binding(&entity), false);
    }

    #[test]
    fn returns_true_if_a_binding_exists() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(()));
        assert_eq!(has_entity_binding(&entity), true);
    }
}
