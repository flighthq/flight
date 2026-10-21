use std::sync::Arc;

use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    equals_array_buffer, get_array_buffer_storage,
};
use flight_font::contract::*;

use crate::support::*;

mod _load_font_face_from_bytes {
    use super::*;

    #[test]
    fn loads_and_registers_only_the_supplied_view_window() {
        let (backend, record) = backend();
        let backing = create_array_buffer_from_bytes(Box::new([1, 2, 3, 4, 5, 6]));
        let bytes =
            create_array_buffer_view(&backing, 1, 4, ArrayBufferViewKind::Uint8Array).unwrap();
        let face = block_on(_load_font_face_from_bytes(&backend, "Family", &bytes)).unwrap();

        let constructions = record.constructions.lock().unwrap();
        assert_eq!(constructions.len(), 1);
        assert_eq!(constructions[0].0, "Family");
        let FontFaceSource::Data(source) = &constructions[0].1 else {
            panic!("expected byte source");
        };
        assert!(equals_array_buffer(&source.value.buffer, &backing));
        assert_eq!(source.value.byte_offset, 1);
        assert_eq!(source.value.byte_length, 4);
        let storage = get_array_buffer_storage(&source.value.buffer);
        assert_eq!(&storage.read().unwrap()[1..5], &[2, 3, 4, 5]);
        assert!(Arc::ptr_eq(&face, &constructions[0].2));
        assert!(Arc::ptr_eq(&face, &record.loaded.lock().unwrap()[0]));
        assert!(Arc::ptr_eq(&face, &record.added.lock().unwrap()[0]));
    }
}

mod _load_font_face_from_url {
    use super::*;

    #[test]
    fn loads_and_registers_the_single_url_source() {
        let (backend, record) = backend();
        let face = block_on(_load_font_face_from_url(&backend, "Family", "font.woff2")).unwrap();
        let constructions = record.constructions.lock().unwrap();
        let FontFaceSource::Url(source) = &constructions[0].1 else {
            panic!("expected URL source");
        };
        assert_eq!(source.value, "url(font.woff2)");
        assert!(Arc::ptr_eq(&face, &record.added.lock().unwrap()[0]));
    }
}

mod _load_font_face_from_urls {
    use super::*;

    #[test]
    fn composes_explicit_inferred_and_absent_format_hints() {
        let (backend, record) = backend();
        block_on(_load_font_face_from_urls(
            &backend,
            "Family",
            &[
                FontUrl {
                    format: Some("woff2".to_string()),
                    url: "a.woff2".to_string(),
                },
                FontUrl {
                    format: None,
                    url: "b.ttf".to_string(),
                },
                FontUrl {
                    format: None,
                    url: "c.bin".to_string(),
                },
            ],
        ))
        .unwrap();
        let constructions = record.constructions.lock().unwrap();
        let FontFaceSource::Url(source) = &constructions[0].1 else {
            panic!("expected URL source");
        };
        assert_eq!(
            source.value,
            "url(a.woff2) format('woff2'), url(b.ttf) format('truetype'), url(c.bin)"
        );
    }

    #[test]
    fn propagates_rejection_without_registering_the_face() {
        let (backend, record) = backend();
        *record.load_error.lock().unwrap() = Some(rejection("bad font"));
        let error = block_on(_load_font_face_from_urls(
            &backend,
            "Family",
            &[FontUrl {
                format: None,
                url: "font.woff2".to_string(),
            }],
        ))
        .err()
        .unwrap();
        assert_eq!(rejection_message(&error), Some("bad font"));
        assert!(record.added.lock().unwrap().is_empty());
    }
}

mod _load_font_faces_from_name {
    use super::*;

    #[test]
    fn uses_the_escaped_shorthand_and_returns_the_document_faces() {
        let (backend, record) = backend();
        let existing = face("Family");
        record.existing.lock().unwrap().push(existing.clone());
        let faces = block_on(_load_font_faces_from_name(&backend, "Family's Name")).unwrap();
        assert_eq!(&*record.lookups.lock().unwrap(), &["1em 'Family\\'s Name'"]);
        assert_eq!(faces.len(), 1);
        assert!(Arc::ptr_eq(&faces[0], &existing));
    }
}
