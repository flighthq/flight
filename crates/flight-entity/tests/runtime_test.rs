use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct BaseEntity {
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(BaseEntity);

fn create_test_entity() -> BaseEntity {
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

mod entity_runtime_slot {
    use super::*;

    fn assert_send_sync<T: Send + Sync>() {}

    #[test]
    fn is_the_allocation_id_plus_one_thin_pointer() {
        // D12 (Principal c92ee207): the numeric id is assigned at allocation, so it is stored
        // inline beside the lazily allocated runtime pointer, which stays null until used.
        assert_eq!(
            std::mem::size_of::<EntityRuntimeSlot>(),
            std::mem::size_of::<u64>() + std::mem::size_of::<usize>()
        );
        assert!(create_test_entity().entity_runtime().data.is_none());
    }

    #[test]
    fn is_send_and_sync() {
        assert_send_sync::<EntityRuntimeSlot>();
        assert_send_sync::<BaseEntity>();
        assert_send_sync::<EntityRuntime>();
    }

    #[test]
    fn defaults_to_an_empty_slot() {
        let runtime: EntityRuntimeSlot = allocate_entity();
        assert!(runtime.data.is_none());
    }

    #[test]
    fn clone_gives_a_fresh_empty_runtime() {
        let mut entity = create_test_entity();
        set_entity_uid(&mut entity, "source".to_string());
        attach_entity_binding(&mut entity, Box::new(7_i32));
        let copy = entity.entity_runtime().clone();
        assert!(copy.data.is_none());
        assert!(has_entity_binding(&entity));
    }

    #[test]
    fn always_compares_equal() {
        let mut bound = create_test_entity();
        attach_entity_binding(&mut bound, Box::new(()));
        let empty = create_test_entity();
        assert!(bound.entity_runtime() == empty.entity_runtime());
        assert_eq!(bound, empty);
    }

    #[test]
    fn debug_prints_an_opaque_marker() {
        let mut entity = create_test_entity();
        set_entity_uid(&mut entity, "secret-uid".to_string());
        let text = format!("{:?}", entity.entity_runtime());
        assert_eq!(text, "EntityRuntimeSlot(..)");
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
        entity.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        let runtime = get_entity_runtime(&entity);
        assert!(runtime.is_some());
        assert!(runtime.unwrap().binding.is_none());
    }

    #[test]
    fn returns_an_allocated_runtime_with_no_uid_until_one_is_assigned() {
        let mut entity = create_test_entity();
        entity.entity_runtime_mut().data = Some(Box::new(create_entity_runtime()));
        assert!(has_entity_runtime(&entity));
        assert!(get_entity_runtime(&entity).unwrap().uid.is_none());
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
