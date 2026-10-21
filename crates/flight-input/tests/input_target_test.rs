use flight_entity::has_entity_runtime;
use flight_input::contract::*;

mod create_input_target_handle {
    use super::*;

    #[test]
    fn allocates_a_fresh_handle() {
        let handle = create_input_target_handle();
        assert!(!has_entity_runtime(&*handle.read().unwrap()));
    }
}

mod initialize_input_target_handle {
    use super::*;

    #[test]
    fn accepts_an_existing_handle() {
        let handle = create_input_target_handle();
        let mut locked = handle.write().unwrap();
        initialize_input_target_handle(&mut locked);
        assert!(!has_entity_runtime(&*locked));
    }
}
