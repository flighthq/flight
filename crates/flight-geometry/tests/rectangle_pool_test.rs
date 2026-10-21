use flight_entity::{
    attach_entity_binding, get_entity_binding, has_entity_runtime, set_entity_uid,
};
use flight_geometry::*;

mod acquire_empty_rectangle {
    use super::*;

    #[test]
    fn resets_a_released_rectangle_to_empty() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        r.x = 5.0;
        r.y = 10.0;
        r.width = 50.0;
        r.height = 100.0;
        release_rectangle(r);
        let out = acquire_empty_rectangle();
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn returns_a_rectangle_with_all_fields_zero() {
        clear_rectangle_pool();
        let out = acquire_empty_rectangle();
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }
}

mod acquire_rectangle {
    use super::*;

    #[test]
    fn preserves_fields_of_a_released_rectangle() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        r.x = 5.0;
        r.y = 10.0;
        r.width = 50.0;
        r.height = 100.0;
        release_rectangle(r);
        let out = acquire_rectangle();
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (5.0, 10.0, 50.0, 100.0)
        );
    }

    #[test]
    fn reuses_released_rectangles_in_last_in_first_out_order() {
        clear_rectangle_pool();
        let mut first = acquire_rectangle();
        first.x = 1.0;
        let mut second = acquire_rectangle();
        second.x = 2.0;
        release_rectangle(first);
        release_rectangle(second);
        assert_eq!(acquire_rectangle().x, 2.0);
        assert_eq!(acquire_rectangle().x, 1.0);
    }

    #[test]
    fn starts_with_the_canonical_value_when_the_pool_is_empty() {
        clear_rectangle_pool();
        let out = acquire_rectangle();
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn uses_a_thread_local_bank() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        r.x = 41.0;
        release_rectangle(r);
        std::thread::spawn(|| assert_eq!(acquire_rectangle().x, 0.0))
            .join()
            .unwrap();
        assert_eq!(acquire_rectangle().x, 41.0);
    }
}

mod clear_rectangle_pool {
    use super::*;

    #[test]
    fn empties_the_bank_so_the_next_acquire_is_canonical() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        r.x = 12.0;
        release_rectangle(r);
        clear_rectangle_pool();
        assert_eq!(acquire_rectangle().x, 0.0);
    }
}

mod release_rectangle {
    use super::*;

    #[test]
    fn clears_the_whole_entity_runtime_before_reuse() {
        clear_rectangle_pool();
        let mut r = acquire_rectangle();
        attach_entity_binding(&mut r, Box::new("first".to_string()));
        set_entity_uid(&mut r, "rectangle".to_string());
        assert!(has_entity_runtime(&r));
        release_rectangle(r);
        let out = acquire_rectangle();
        assert!(!has_entity_runtime(&out));
        assert!(get_entity_binding(&out).is_none());
    }
}
