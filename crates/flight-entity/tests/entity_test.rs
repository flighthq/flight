use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct TestEntity {
    runtime: EntityRuntime,
    x: f32,
}

mod allocate_entity {
    use super::*;

    #[test]
    fn returns_an_entity_with_no_runtime() {
        let out: Entity = allocate_entity();
        assert!(!has_entity_runtime(&out));
    }

    #[test]
    fn allocates_any_default_entity_type_with_an_empty_runtime_slot() {
        let out: TestEntity = allocate_entity();
        assert!(out.runtime.data.is_none());
        assert_eq!(out.x, 0.0);
    }

    #[test]
    fn returns_a_fresh_value_on_each_call() {
        let mut a: Entity = allocate_entity();
        let b: Entity = allocate_entity();
        attach_entity_binding(&mut a, Box::new(()));
        assert!(has_entity_runtime(&a));
        assert!(!has_entity_runtime(&b));
    }
}
