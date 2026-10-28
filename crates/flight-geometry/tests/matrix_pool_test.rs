//! flight-compiler: target-native

use flight_entity::{
    attach_entity_binding, get_entity_binding, has_entity_runtime, set_entity_uid,
};
use flight_geometry::contract::*;

fn components(m: &Matrix) -> (f32, f32, f32, f32, f32, f32) {
    return (m.a, m.b, m.c, m.d, m.tx, m.ty);
}

mod acquire_identity_matrix {
    use super::*;

    #[test]
    fn resets_a_released_matrix_to_identity() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        m.a = 5.0;
        m.tx = 10.0;
        release_matrix(m);
        let out = acquire_identity_matrix();
        assert_eq!(components(&out), (1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
    }

    #[test]
    fn returns_an_identity_matrix() {
        clear_matrix_pool();
        let out = acquire_identity_matrix();
        assert_eq!(components(&out), (1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
    }
}

mod acquire_matrix {
    use super::*;

    #[test]
    fn preserves_components_of_a_released_matrix() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        m.a = 5.0;
        m.tx = 10.0;
        release_matrix(m);
        let out = acquire_matrix();
        assert_eq!((out.a, out.tx), (5.0, 10.0));
    }

    #[test]
    fn reuses_released_matrices_in_last_in_first_out_order() {
        clear_matrix_pool();
        let mut first = acquire_matrix();
        first.tx = 1.0;
        let mut second = acquire_matrix();
        second.tx = 2.0;
        release_matrix(first);
        release_matrix(second);
        assert_eq!(acquire_matrix().tx, 2.0);
        assert_eq!(acquire_matrix().tx, 1.0);
    }

    #[test]
    fn starts_with_the_canonical_value_when_the_pool_is_empty() {
        clear_matrix_pool();
        let out = acquire_matrix();
        assert_eq!(components(&out), (1.0, 0.0, 0.0, 1.0, 0.0, 0.0));
    }

    #[test]
    fn uses_a_thread_local_bank() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        m.tx = 41.0;
        release_matrix(m);
        std::thread::spawn(|| assert_eq!(acquire_matrix().tx, 0.0))
            .join()
            .unwrap();
        assert_eq!(acquire_matrix().tx, 41.0);
    }
}

mod clear_matrix_pool {
    use super::*;

    #[test]
    fn empties_the_bank_so_the_next_acquire_is_canonical() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        m.tx = 12.0;
        release_matrix(m);
        clear_matrix_pool();
        assert_eq!(acquire_matrix().tx, 0.0);
    }
}

mod release_matrix {
    use super::*;

    #[test]
    fn clears_the_whole_entity_runtime_before_reuse() {
        clear_matrix_pool();
        let mut m = acquire_matrix();
        attach_entity_binding(&mut m, Box::new("first".to_string()));
        set_entity_uid(&mut m, "matrix".to_string());
        assert!(has_entity_runtime(&m));
        release_matrix(m);
        let out = acquire_matrix();
        assert!(!has_entity_runtime(&out));
        assert!(get_entity_binding(&out).is_none());
    }
}
