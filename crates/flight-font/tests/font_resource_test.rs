use flight_entity::has_entity_runtime;
use flight_font::contract::*;

mod create_font_resource {
    use super::*;

    #[test]
    fn creates_the_given_family_with_no_face() {
        let resource = create_font_resource("Arial");
        assert_eq!(resource.family, "Arial");
        assert!(resource.face.is_none());
        assert!(!has_entity_runtime(&resource));
    }

    #[test]
    fn returns_a_new_entity_each_call() {
        let mut first = create_font_resource("Arial");
        let second = create_font_resource("Arial");
        let _ = flight_entity::get_entity_uid(&mut first);
        assert!(has_entity_runtime(&first));
        assert!(!has_entity_runtime(&second));
    }
}

mod initialize_font_resource {
    use super::*;

    #[test]
    fn resets_family_and_face() {
        let mut resource = create_font_resource("Old");
        initialize_font_resource(&mut resource, "New");
        assert_eq!(resource.family, "New");
        assert!(resource.face.is_none());
    }
}
