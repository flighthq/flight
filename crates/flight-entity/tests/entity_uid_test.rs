use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct BaseEntity {
    runtime: EntityRuntimeSlot,
}

flight_entity::impl_entity!(BaseEntity);

fn create_test_entity() -> BaseEntity {
    return allocate_entity();
}

mod get_entity_uid {
    use super::*;

    #[test]
    fn lazily_generates_a_uid_on_first_access() {
        let mut entity = create_test_entity();
        let uid = get_entity_uid(&mut entity);
        assert!(!uid.is_empty());
    }

    #[test]
    fn returns_the_same_uid_on_repeated_access() {
        let mut entity = create_test_entity();
        let first = get_entity_uid(&mut entity);
        let second = get_entity_uid(&mut entity);
        assert_eq!(second, first);
    }

    #[test]
    fn generates_distinct_uids_for_different_entities() {
        let mut a = create_test_entity();
        let mut b = create_test_entity();
        assert_ne!(get_entity_uid(&mut a), get_entity_uid(&mut b));
    }

    #[test]
    fn creates_the_runtime_if_the_entity_has_none() {
        let mut entity = create_test_entity();
        assert!(entity.entity_runtime().data.is_none());
        get_entity_uid(&mut entity);
        assert!(entity.entity_runtime().data.is_some());
    }
}

mod set_entity_uid {
    use super::*;

    #[test]
    fn sets_a_stable_id_before_any_get() {
        let mut entity = create_test_entity();
        set_entity_uid(&mut entity, "my-stable-id".to_string());
        assert_eq!(get_entity_uid(&mut entity), "my-stable-id");
    }

    #[test]
    fn replaces_a_previously_generated_uid() {
        let mut entity = create_test_entity();
        let generated = get_entity_uid(&mut entity);
        set_entity_uid(&mut entity, "override".to_string());
        assert_eq!(get_entity_uid(&mut entity), "override");
        assert_ne!(get_entity_uid(&mut entity), generated);
    }

    #[test]
    fn creates_the_runtime_if_the_entity_has_none() {
        let mut entity = create_test_entity();
        assert!(entity.entity_runtime().data.is_none());
        set_entity_uid(&mut entity, "pre-bind".to_string());
        assert!(entity.entity_runtime().data.is_some());
        assert_eq!(get_entity_uid(&mut entity), "pre-bind");
    }
}
