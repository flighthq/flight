use flight_skeleton2d::contract::*;

mod create_skin_2d {
    use super::*;

    #[test]
    fn adopts_the_two_streams_without_copying() {
        let counts = vec![1u16, 2u16];
        let influences = vec![
            0.0f32, 1.0, 2.0, 3.0, 1.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
        ];
        let value = create_skin_2d(counts.clone(), influences.clone());
        assert_eq!(value.influence_counts, counts);
        assert_eq!(value.influences, influences);
    }
}

mod initialize_skin_2d {
    use super::*;

    #[test]
    fn assigns_both_streams() {
        let mut value = flight_entity::allocate_entity::<Skin2D>();
        initialize_skin_2d(&mut value, vec![1], vec![0.0, 1.0, 2.0, 1.0]);
        assert_eq!(value.influence_counts, vec![1]);
        assert_eq!(value.influences.len(), 4);
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
