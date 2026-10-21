use flight_entity::{
    attach_entity_binding, get_entity_binding, has_entity_runtime, set_entity_uid,
};
use flight_geometry::*;

mod acquire_identity_matrix3 {
    use super::*;

    #[test]
    fn resets_a_released_matrix_to_identity() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        m.m[0] = 5.0;
        m.m[2] = 10.0;
        release_matrix3(m);
        let out = acquire_identity_matrix3();
        assert_eq!(out.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn returns_an_identity_matrix() {
        clear_matrix3_pool();
        let out = acquire_identity_matrix3();
        assert_eq!(out.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }
}

mod acquire_matrix3 {
    use super::*;

    #[test]
    fn preserves_elements_of_a_released_matrix() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        m.m[0] = 5.0;
        m.m[2] = 10.0;
        release_matrix3(m);
        let out = acquire_matrix3();
        assert_eq!((out.m[0], out.m[2]), (5.0, 10.0));
    }

    #[test]
    fn reuses_released_matrices_in_last_in_first_out_order() {
        clear_matrix3_pool();
        let mut first = acquire_matrix3();
        first.m[2] = 1.0;
        let mut second = acquire_matrix3();
        second.m[2] = 2.0;
        release_matrix3(first);
        release_matrix3(second);
        assert_eq!(acquire_matrix3().m[2], 2.0);
        assert_eq!(acquire_matrix3().m[2], 1.0);
    }

    #[test]
    fn starts_with_the_canonical_value_when_the_pool_is_empty() {
        clear_matrix3_pool();
        let out = acquire_matrix3();
        assert_eq!(out.m, [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn uses_a_thread_local_bank() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        m.m[2] = 41.0;
        release_matrix3(m);
        std::thread::spawn(|| assert_eq!(acquire_matrix3().m[2], 0.0))
            .join()
            .unwrap();
        assert_eq!(acquire_matrix3().m[2], 41.0);
    }
}

mod clear_matrix3_pool {
    use super::*;

    #[test]
    fn empties_the_bank_so_the_next_acquire_is_canonical() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        m.m[2] = 12.0;
        release_matrix3(m);
        clear_matrix3_pool();
        assert_eq!(acquire_matrix3().m[2], 0.0);
    }
}

mod release_matrix3 {
    use super::*;

    #[test]
    fn clears_the_whole_entity_runtime_before_reuse() {
        clear_matrix3_pool();
        let mut m = acquire_matrix3();
        attach_entity_binding(&mut m, Box::new("first".to_string()));
        set_entity_uid(&mut m, "matrix-3".to_string());
        assert!(has_entity_runtime(&m));
        release_matrix3(m);
        let out = acquire_matrix3();
        assert!(!has_entity_runtime(&out));
        assert!(get_entity_binding(&out).is_none());
    }
}
