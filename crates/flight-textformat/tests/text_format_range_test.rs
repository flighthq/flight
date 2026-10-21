use crate::common::empty_text_format;
use flight_textformat::contract::*;
use std::sync::{Arc, RwLock};

mod create_text_format_range {
    use super::*;

    #[test]
    fn creates_a_range_with_the_given_fields() {
        let mut fields = empty_text_format();
        fields.size = Some(16.0);
        fields.bold = Some(true);
        let format = Arc::new(RwLock::new(fields));
        let range = create_text_format_range(format.clone(), 0, 10);
        assert_eq!((range.start, range.end), (0, 10));
        assert!(Arc::ptr_eq(&range.format, &format));
        assert_eq!(range.format.read().unwrap().size, Some(16.0));
        assert_eq!(range.format.read().unwrap().bold, Some(true));
    }

    #[test]
    fn retains_the_callers_format_object_and_later_edits() {
        let format = Arc::new(RwLock::new(empty_text_format()));
        let range = create_text_format_range(format.clone(), 0, 1);
        format.write().unwrap().bold = Some(false);
        assert_eq!(range.format.read().unwrap().bold, Some(false));
        assert!(Arc::ptr_eq(&range.format, &format));
    }

    #[test]
    fn preserves_utf16_offsets_across_a_surrogate_pair() {
        let format = Arc::new(RwLock::new(empty_text_format()));
        let range = create_text_format_range(format, 1, 3);
        let units: Vec<u16> = "a😀b".encode_utf16().collect();
        assert_eq!(&units[range.start..range.end], &[0xD83D, 0xDE00]);
        assert_eq!((range.start, range.end), (1, 3));
    }

    #[test]
    fn allocates_independent_range_entity_identities() {
        let format = Arc::new(RwLock::new(empty_text_format()));
        let mut first = create_text_format_range(format.clone(), 0, 1);
        let mut second = create_text_format_range(format, 0, 1);
        assert_ne!(
            flight_entity::get_entity_uid(&mut first),
            flight_entity::get_entity_uid(&mut second)
        );
    }
}

mod initialize_text_format_range {
    use super::*;

    #[test]
    fn copies_fields_without_normalizing_or_replacing_the_entity_slot() {
        let original = Arc::new(RwLock::new(empty_text_format()));
        let mut range = create_text_format_range(original, 0, 10);
        flight_entity::set_entity_uid(&mut range, "existing-range".to_string());
        let replacement = Arc::new(RwLock::new(empty_text_format()));
        initialize_text_format_range(&mut range, replacement.clone(), 9, 2);
        assert_eq!((range.start, range.end), (9, 2));
        assert!(Arc::ptr_eq(&range.format, &replacement));
        assert_eq!(flight_entity::get_entity_uid(&mut range), "existing-range");
    }
}
