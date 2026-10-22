use flight_skeleton2d::contract::*;

mod create_skin_2d {
    use super::*;

    #[test]
    fn adopts_the_two_streams_without_copying() {
        let counts = vec![1u16, 2u16];
        let influences = vec![
            0.0f32, 1.0, 2.0, 3.0, 1.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
        ];
        let input_counts = counts.clone();
        let input_influences = influences.clone();
        let counts_ptr = input_counts.as_ptr();
        let influences_ptr = input_influences.as_ptr();
        let value = create_skin_2d(input_counts, input_influences);
        assert_eq!(value.influence_counts, counts);
        assert_eq!(value.influences, influences);
        assert_eq!(value.influence_counts.as_ptr(), counts_ptr);
        assert_eq!(value.influences.as_ptr(), influences_ptr);
    }
}

mod initialize_skin_2d {
    use super::*;

    #[test]
    fn assigns_both_streams() {
        let mut value = flight_entity::allocate_entity::<Skin2D>();
        let id = flight_entity::get_entity_id(&value);
        flight_entity::set_entity_uid(&mut value, String::from("skin-under-construction"));
        let runtime = flight_entity::get_entity_runtime(&value).unwrap() as *const _;
        let counts = vec![1];
        let influences = vec![0.0, 1.0, 2.0, 1.0];
        let counts_ptr = counts.as_ptr();
        let influences_ptr = influences.as_ptr();
        initialize_skin_2d(&mut value, counts, influences);
        assert_eq!(value.influence_counts, vec![1]);
        assert_eq!(value.influences.len(), 4);
        assert_eq!(value.influence_counts.as_ptr(), counts_ptr);
        assert_eq!(value.influences.as_ptr(), influences_ptr);
        assert_eq!(flight_entity::get_entity_id(&value), id);
        assert_eq!(
            flight_entity::get_entity_uid(&mut value),
            "skin-under-construction"
        );
        assert_eq!(
            flight_entity::get_entity_runtime(&value).unwrap() as *const _,
            runtime
        );
    }
}

mod source_skin_runtime {
    use super::*;

    #[test]
    fn a_skin_carries_an_entity_runtime_slot() {
        let mut value = create_skin_2d(vec![1], vec![0.0, 1.0, 0.0, 1.0]);
        flight_entity::set_entity_uid(&mut value, String::from("skin"));
        assert_eq!(flight_entity::get_entity_uid(&mut value), "skin");
    }
}
