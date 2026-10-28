use flight_entity::{
    attach_entity_binding, get_entity_binding, has_entity_runtime, set_entity_uid,
};
use flight_geometry::contract::*;

mod acquire_empty_vector2 {
    use super::*;

    #[test]
    fn resets_a_released_vector_to_zero() {
        clear_vector2_pool();
        let mut v = acquire_vector2();
        v.x = 5.0;
        v.y = 10.0;
        release_vector2(v);
        let out = acquire_empty_vector2();
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }

    #[test]
    fn returns_a_vector_with_all_components_zero() {
        clear_vector2_pool();
        let out = acquire_empty_vector2();
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }
}

mod acquire_vector2 {
    use super::*;

    #[test]
    fn preserves_components_of_a_released_vector() {
        clear_vector2_pool();
        let mut v = acquire_vector2();
        v.x = 5.0;
        v.y = 10.0;
        release_vector2(v);
        let out = acquire_vector2();
        assert_eq!((out.x, out.y), (5.0, 10.0));
    }

    #[test]
    fn reuses_released_vectors_in_last_in_first_out_order() {
        clear_vector2_pool();
        let mut first = acquire_vector2();
        first.x = 1.0;
        let mut second = acquire_vector2();
        second.x = 2.0;
        release_vector2(first);
        release_vector2(second);
        assert_eq!(acquire_vector2().x, 2.0);
        assert_eq!(acquire_vector2().x, 1.0);
    }

    #[test]
    fn starts_with_the_canonical_value_when_the_pool_is_empty() {
        clear_vector2_pool();
        let out = acquire_vector2();
        assert_eq!((out.x, out.y), (0.0, 0.0));
    }

    #[test]
    fn uses_a_thread_local_bank() {
        clear_vector2_pool();
        let mut v = acquire_vector2();
        v.x = 41.0;
        release_vector2(v);
        std::thread::spawn(|| {
            let out = acquire_vector2();
            assert_eq!(out.x, 0.0);
        })
        .join()
        .unwrap();
        assert_eq!(acquire_vector2().x, 41.0);
    }
}

mod clear_vector2_pool {
    use super::*;

    #[test]
    fn clears_only_the_vector2_bank() {
        clear_vector2_pool();
        clear_vector3_pool();
        let mut vector2 = acquire_vector2();
        vector2.x = 12.0;
        let mut vector3 = acquire_vector3();
        vector3.x = 13.0;
        release_vector2(vector2);
        release_vector3(vector3);
        clear_vector2_pool();
        assert_eq!(acquire_vector2().x, 0.0);
        assert_eq!(acquire_vector3().x, 13.0);
    }
}

mod release_vector2 {
    use super::*;

    #[test]
    fn clears_the_whole_entity_runtime_before_reuse() {
        clear_vector2_pool();
        let mut v = acquire_vector2();
        attach_entity_binding(&mut v, Box::new("first".to_string()));
        set_entity_uid(&mut v, "vector-2".to_string());
        assert!(has_entity_runtime(&v));
        release_vector2(v);
        let out = acquire_vector2();
        assert!(!has_entity_runtime(&out));
        assert!(get_entity_binding(&out).is_none());
    }
}
