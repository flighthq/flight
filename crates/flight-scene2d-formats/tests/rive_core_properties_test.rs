use std::collections::HashSet;

use flight_scene2d_formats::contract::*;

mod get_rive_core_property_field_type {
    use super::*;

    #[test]
    fn answers_for_a_retired_alternate_key_not_only_the_current_one() {
        assert_eq!(
            get_rive_core_property_field_type(13),
            Some(RiveFieldType::Double)
        );
        assert_eq!(
            get_rive_core_property_field_type(9),
            Some(RiveFieldType::Double)
        );
    }

    #[test]
    fn answers_for_the_core_properties_every_file_uses() {
        assert_eq!(
            get_rive_core_property_field_type(4),
            Some(RiveFieldType::String)
        );
        assert_eq!(
            get_rive_core_property_field_type(7),
            Some(RiveFieldType::Double)
        );
        assert_eq!(
            get_rive_core_property_field_type(8),
            Some(RiveFieldType::Double)
        );
    }

    #[test]
    fn covers_every_wire_width() {
        let widths: HashSet<_> = (0..1100)
            .filter_map(get_rive_core_property_field_type)
            .collect();
        assert_eq!(
            widths,
            HashSet::from([
                RiveFieldType::Uint,
                RiveFieldType::String,
                RiveFieldType::Double,
                RiveFieldType::Color,
            ])
        );
    }

    #[test]
    fn returns_none_for_a_key_the_object_model_does_not_define() {
        assert_eq!(get_rive_core_property_field_type(0), None);
        assert_eq!(get_rive_core_property_field_type(999_999), None);
    }
}

mod is_rive_core_bytes_property {
    use super::*;

    #[test]
    fn agrees_with_the_field_table_that_every_blob_key_is_length_prefixed() {
        for key in [212, 223, 359, 582, 588, 711, 866, 868, 871, 911, 920, 963] {
            assert_eq!(
                get_rive_core_property_field_type(key),
                Some(RiveFieldType::String)
            );
        }
    }

    #[test]
    fn leaves_genuine_text_alone() {
        assert!(!is_rive_core_bytes_property(4));
        assert!(!is_rive_core_bytes_property(55));
        assert!(!is_rive_core_bytes_property(999_999));
    }

    #[test]
    fn marks_the_length_prefixed_properties_that_are_raw_blobs_not_text() {
        assert!(is_rive_core_bytes_property(212));
        assert!(is_rive_core_bytes_property(911));
    }
}
