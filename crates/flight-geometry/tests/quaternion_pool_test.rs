use flight_entity::{
    attach_entity_binding, get_entity_binding, has_entity_runtime, set_entity_uid,
};
use flight_geometry::*;

mod acquire_identity_quaternion {
    use super::*;

    #[test]
    fn resets_a_released_quaternion_to_identity() {
        clear_quaternion_pool();
        let mut q = acquire_quaternion();
        q.x = 9.0;
        q.w = 0.0;
        release_quaternion(q);
        let out = acquire_identity_quaternion();
        assert_eq!((out.x, out.y, out.z, out.w), (0.0, 0.0, 0.0, 1.0));
    }

    #[test]
    fn returns_an_identity_quaternion() {
        clear_quaternion_pool();
        let out = acquire_identity_quaternion();
        assert_eq!((out.x, out.y, out.z, out.w), (0.0, 0.0, 0.0, 1.0));
    }
}

mod acquire_quaternion {
    use super::*;

    #[test]
    fn preserves_components_of_a_released_quaternion() {
        clear_quaternion_pool();
        let mut q = acquire_quaternion();
        q.x = 5.0;
        q.w = 10.0;
        release_quaternion(q);
        let out = acquire_quaternion();
        assert_eq!((out.x, out.w), (5.0, 10.0));
    }

    #[test]
    fn reuses_released_quaternions_in_last_in_first_out_order() {
        clear_quaternion_pool();
        let mut first = acquire_quaternion();
        first.x = 1.0;
        let mut second = acquire_quaternion();
        second.x = 2.0;
        release_quaternion(first);
        release_quaternion(second);
        assert_eq!(acquire_quaternion().x, 2.0);
        assert_eq!(acquire_quaternion().x, 1.0);
    }

    #[test]
    fn starts_with_the_canonical_value_when_the_pool_is_empty() {
        clear_quaternion_pool();
        let out = acquire_quaternion();
        assert_eq!((out.x, out.y, out.z, out.w), (0.0, 0.0, 0.0, 1.0));
    }

    #[test]
    fn uses_a_thread_local_bank() {
        clear_quaternion_pool();
        let mut q = acquire_quaternion();
        q.x = 41.0;
        release_quaternion(q);
        std::thread::spawn(|| assert_eq!(acquire_quaternion().x, 0.0))
            .join()
            .unwrap();
        assert_eq!(acquire_quaternion().x, 41.0);
    }
}

mod clear_quaternion_pool {
    use super::*;

    #[test]
    fn empties_the_bank_so_the_next_acquire_is_canonical() {
        clear_quaternion_pool();
        let mut q = acquire_quaternion();
        q.x = 12.0;
        release_quaternion(q);
        clear_quaternion_pool();
        assert_eq!(acquire_quaternion().x, 0.0);
    }
}

mod release_quaternion {
    use super::*;

    #[test]
    fn clears_the_whole_entity_runtime_before_reuse() {
        clear_quaternion_pool();
        let mut q = acquire_quaternion();
        attach_entity_binding(&mut q, Box::new("first".to_string()));
        set_entity_uid(&mut q, "quaternion".to_string());
        assert!(has_entity_runtime(&q));
        release_quaternion(q);
        let out = acquire_quaternion();
        assert!(!has_entity_runtime(&out));
        assert!(get_entity_binding(&out).is_none());
    }
}
