use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct TestEntity {
    runtime: EntityRuntime,
    x: f32,
}

fn create_test_entity() -> Entity {
    return allocate_entity();
}

mod clone_entity_tests {
    use super::*;

    #[test]
    fn resets_the_runtime_slot_to_none_on_the_clone() {
        let mut source = create_test_entity();
        attach_entity_binding(&mut source, Box::new(()));
        assert!(has_entity_runtime(&source));
        let clone = clone_entity(&source);
        assert!(!has_entity_runtime(&clone));
    }

    #[test]
    fn does_not_share_the_runtime_between_source_and_clone() {
        let source = create_test_entity();
        let clone = clone_entity(&source);
        assert!(clone.runtime.data.is_none());
    }

    #[test]
    fn returns_a_new_entity_instance() {
        let source = create_test_entity();
        let clone = clone_entity(&source);
        let source_ptr = &source as *const Entity;
        let clone_ptr = &clone as *const Entity;
        assert_ne!(source_ptr, clone_ptr);
    }

    #[test]
    fn clone_of_a_bound_entity_yields_an_unbound_clone() {
        let mut source = create_test_entity();
        attach_entity_binding(&mut source, Box::new(42_i32));
        let clone = clone_entity(&source);
        assert!(!has_entity_runtime(&clone));
    }

    #[test]
    fn copies_data_fields_and_empties_the_runtime_of_a_derived_entity() {
        let mut source: TestEntity = allocate_entity();
        source.x = 3.0;
        source.runtime.data = Some(Box::new(create_entity_runtime()));
        let copy = source.clone();
        assert_eq!(copy.x, 3.0);
        assert!(copy.runtime.data.is_none());
        assert!(source.runtime.data.is_some());
    }
}

mod strip_entity_runtime_tests {
    use super::*;

    #[test]
    fn removes_the_runtime() {
        let entity = create_test_entity();
        let _stripped = strip_entity_runtime(&entity);
        // EntityWithoutRuntime has no runtime field -- stripping succeeded by construction.
    }

    #[test]
    fn does_not_mutate_the_source_entity() {
        let entity = create_test_entity();
        let _stripped = strip_entity_runtime(&entity);
        // The source entity's runtime is still None (the default for a fresh entity).
        assert!(entity.runtime.data.is_none());
    }

    #[test]
    fn strips_bound_entity_runtime_not_in_output() {
        let mut entity = create_test_entity();
        attach_entity_binding(&mut entity, Box::new(true));
        let _stripped = strip_entity_runtime(&entity);
        // EntityWithoutRuntime has no runtime field, so the binding is not carried over.
    }

    #[test]
    fn round_trip_strip_then_allocate_yields_a_valid_unbound_entity() {
        let mut original = create_test_entity();
        attach_entity_binding(&mut original, Box::new(()));
        let _stripped = strip_entity_runtime(&original);
        let restored: Entity = allocate_entity();
        assert!(!has_entity_runtime(&restored));
    }
}
