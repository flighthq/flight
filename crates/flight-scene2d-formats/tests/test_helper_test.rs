use flight_scene2d_formats::contract::*;

mod create_ready_image_resource_for_test {
    use super::*;

    #[test]
    fn creates_a_ready_resource_with_default_or_explicit_dimensions() {
        let default = create_ready_image_resource_for_test(None, None);
        assert_eq!(default.read().unwrap().width, 1);
        assert_eq!(default.read().unwrap().height, 1);

        let explicit = create_ready_image_resource_for_test(Some(9), Some(3));
        assert_eq!(explicit.read().unwrap().width, 9);
        assert_eq!(explicit.read().unwrap().height, 3);
    }
}
