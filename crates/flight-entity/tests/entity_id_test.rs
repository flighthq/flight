use std::collections::HashSet;
use std::sync::Arc;
use std::thread;

use flight_entity::*;

#[derive(Clone, Debug, Default, PartialEq)]
struct BaseEntity {
    runtime: EntityRuntimeSlot,
    value: u32,
}

flight_entity::impl_entity!(BaseEntity);

fn create_test_entity() -> BaseEntity {
    return allocate_entity();
}

fn initialize_test_entity(out: &mut BaseEntity) {
    out.value = 0;
}

mod get_entity_id {
    use super::*;

    #[test]
    fn assigns_an_id_at_allocation_without_creating_a_runtime() {
        let entity = create_test_entity();
        let id = get_entity_id(&entity);
        assert!(id >= 1 && id < ENTITY_ID_LIMIT);
        assert!(!has_entity_runtime(&entity));
    }

    #[test]
    fn gives_each_allocation_a_distinct_increasing_id() {
        let first = create_test_entity();
        let second = create_test_entity();
        let third = create_test_entity();
        assert!(get_entity_id(&first) < get_entity_id(&second));
        assert!(get_entity_id(&second) < get_entity_id(&third));
    }

    #[test]
    fn gives_a_clone_a_new_id() {
        let mut source = create_test_entity();
        source.value = 7;
        let clone = clone_entity(&source);
        assert_eq!(clone.value, 7);
        assert_ne!(get_entity_id(&clone), get_entity_id(&source));
        // The id is identity, not value: entities with equal data still compare equal.
        assert_eq!(clone, source);
    }

    #[test]
    fn keeps_the_same_id_through_initialize_binding_and_uid() {
        let mut entity = create_test_entity();
        let id = get_entity_id(&entity);

        initialize_test_entity(&mut entity);
        assert_eq!(get_entity_id(&entity), id);

        attach_entity_binding(&mut entity, Box::new(5_u8));
        assert_eq!(get_entity_id(&entity), id);

        let uid = get_entity_uid(&mut entity);
        set_entity_uid(&mut entity, "custom".to_string());
        assert_eq!(get_entity_id(&entity), id);
        assert!(uid.starts_with("entity-"));

        detach_entity_binding(&mut entity);
        assert_eq!(get_entity_id(&entity), id);
    }

    #[test]
    fn keeps_the_id_when_the_entity_moves() {
        let entity = create_test_entity();
        let id = get_entity_id(&entity);
        let shared = Arc::new(std::sync::RwLock::new(entity));
        assert_eq!(get_entity_id(&*shared.read().unwrap()), id);
    }

    #[test]
    fn reads_through_a_trait_object() {
        let entity = create_test_entity();
        let erased: &dyn Entity = &entity;
        assert_eq!(get_entity_id(erased), get_entity_id(&entity));
    }

    #[test]
    fn never_repeats_an_id_across_threads() {
        let handles: Vec<_> = (0..8)
            .map(|_| {
                return thread::spawn(|| {
                    let mut ids = Vec::new();
                    let mut previous = 0;
                    for _ in 0..500 {
                        let id = get_entity_id(&create_test_entity());
                        // Monotonic within one thread: the sequence only moves forward.
                        assert!(id > previous);
                        previous = id;
                        ids.push(id);
                    }
                    return ids;
                });
            })
            .collect();
        let mut seen = HashSet::new();
        for handle in handles {
            for id in handle.join().unwrap() {
                assert!(seen.insert(id), "id {} allocated twice", id);
            }
        }
        assert_eq!(seen.len(), 8 * 500);
    }
}
