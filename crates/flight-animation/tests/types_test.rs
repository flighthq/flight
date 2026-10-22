use flight_animation::contract::*;
use flight_animation::*;

mod create_state_ref_from_index {
    use super::*;

    #[test]
    fn wraps_usize_in_state_ref_index() {
        let state = create_state_ref_from_index(3);
        match state {
            StateRef::Index(i) => assert_eq!(i, 3),
            _ => panic!("expected StateRef::Index"),
        }
    }
}

mod create_state_ref_from_name {
    use super::*;

    #[test]
    fn wraps_str_in_state_ref_name() {
        let state = create_state_ref_from_name("idle");
        match state {
            StateRef::Name(n) => assert_eq!(n, "idle"),
            _ => panic!("expected StateRef::Name"),
        }
    }
}

mod linear_easing_identity {
    use super::*;

    #[test]
    fn returns_input_unchanged() {
        assert_eq!(linear_easing_identity(0.0), 0.0);
        assert_eq!(linear_easing_identity(0.5), 0.5);
        assert_eq!(linear_easing_identity(1.0), 1.0);
    }
}
