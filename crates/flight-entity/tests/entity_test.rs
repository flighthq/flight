use flight_entity::*;

mod allocate_entity {
    use super::*;

    #[test]
    fn returns_an_entity_with_no_runtime() {
        let out = allocate_entity();
        assert!(out.runtime.is_none());
    }
}

mod finish_entity {
    use super::*;

    #[test]
    fn returns_the_entity() {
        let out = allocate_entity();
        let entity = finish_entity(out);
        // finish_entity is an identity operation; the entity is valid.
        assert!(entity.runtime.is_none());
    }
}
