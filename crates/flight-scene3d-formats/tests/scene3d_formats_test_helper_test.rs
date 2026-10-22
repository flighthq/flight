use flight_image::ImageResourceReference;
use flight_scene3d_formats::*;
use std::sync::Arc;

mod get_test_texture_resource {
    use super::*;
    #[test]
    fn finds_the_original_resource_handle_and_throws_the_source_error_when_absent() {
        let mut resources = Vec::new();
        let texture = create_external_texture_ref("model.png", None, Some(&mut resources));
        let ImageResourceReference::External(actual) =
            get_test_texture_resource(&resources, &texture)
        else {
            panic!("expected external")
        };
        let ImageResourceReference::External(expected) = &resources[0] else {
            panic!("expected external")
        };
        assert!(Arc::ptr_eq(&actual.reference, &expected.reference));
        let absent = create_external_texture_ref("absent.png", None, None);
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            get_test_texture_resource(&resources, &absent);
        }))
        .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::Error);
        assert_eq!(
            error.message,
            "texture is not associated with a scene resource"
        );
    }
}
