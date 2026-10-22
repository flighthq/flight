use std::sync::Arc;

use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
    equals_array_buffer,
};
use flight_font::contract::*;

use crate::support::*;

fn bytes(values: Box<[u8]>) -> flight_buffer::ArrayBufferView {
    let length = values.len();
    let buffer = create_array_buffer_from_bytes(values);
    return create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array).unwrap();
}

mod load_font_resource_from_bytes {
    use super::*;

    #[test]
    fn constructs_loads_registers_and_attaches_under_the_resource_family() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        block_on(load_font_resource_from_bytes(
            &backend,
            &mut resource,
            &bytes(Box::new([0; 8])),
        ))
        .unwrap();
        let attached = resource.face.as_ref().unwrap();
        let constructions = record.constructions.lock().unwrap();
        assert_eq!(constructions.len(), 1);
        assert_eq!(constructions[0].0, "TestFont");
        assert!(Arc::ptr_eq(attached, &constructions[0].2));
        assert!(Arc::ptr_eq(attached, &record.loaded.lock().unwrap()[0]));
        assert!(Arc::ptr_eq(attached, &record.added.lock().unwrap()[0]));
    }

    #[test]
    fn preserves_only_the_view_window_and_its_backing_identity() {
        let (backend, record) = backend();
        let backing = create_array_buffer_from_bytes(Box::new([1, 2, 3, 4, 5, 6, 7, 8]));
        let view =
            create_array_buffer_view(&backing, 2, 4, ArrayBufferViewKind::Uint8Array).unwrap();
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        block_on(load_font_resource_from_bytes(
            &backend,
            &mut resource,
            &view,
        ))
        .unwrap();
        let constructions = record.constructions.lock().unwrap();
        let FontFaceSource::Data(source) = &constructions[0].1 else {
            panic!("expected byte source");
        };
        assert!(equals_array_buffer(&source.value.buffer, &backing));
        assert_eq!((source.value.byte_offset, source.value.byte_length), (2, 4));
    }

    #[test]
    fn propagates_rejection_without_registering_or_attaching() {
        let (backend, record) = backend();
        *record.load_error.lock().unwrap() = Some(rejection("bad font"));
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        let error = block_on(load_font_resource_from_bytes(
            &backend,
            &mut resource,
            &bytes(Box::new([0; 4])),
        ))
        .err()
        .unwrap();
        assert_eq!(rejection_message(&error), Some("bad font"));
        assert!(record.added.lock().unwrap().is_empty());
        assert!(resource.face.is_none());
    }

    #[test]
    fn leaves_a_previously_loaded_face_attached_when_reload_fails() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        block_on(load_font_resource_from_bytes(
            &backend,
            &mut resource,
            &bytes(Box::new([0; 4])),
        ))
        .unwrap();
        let loaded = resource.face.clone().unwrap();
        *record.load_error.lock().unwrap() = Some(rejection("boom"));
        assert!(
            block_on(load_font_resource_from_bytes(
                &backend,
                &mut resource,
                &bytes(Box::new([0; 4])),
            ))
            .is_err()
        );
        assert!(Arc::ptr_eq(resource.face.as_ref().unwrap(), &loaded));
        assert_eq!(record.added.lock().unwrap().len(), 1);
    }
}

mod load_font_resource_from_name {
    use super::*;

    #[test]
    fn queries_the_family_via_the_escaped_font_shorthand() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "Josh's Font".to_string();
        block_on(load_font_resource_from_name(&backend, &mut resource)).unwrap();
        assert_eq!(&*record.lookups.lock().unwrap(), &["1em 'Josh\\'s Font'"]);
    }

    #[test]
    fn attaches_the_first_face_when_the_host_returns_several() {
        let (backend, record) = backend();
        let first = face("first");
        let second = face("second");
        record
            .existing
            .lock()
            .unwrap()
            .extend([first.clone(), second]);
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        block_on(load_font_resource_from_name(&backend, &mut resource)).unwrap();
        assert!(Arc::ptr_eq(resource.face.as_ref().unwrap(), &first));
    }

    #[test]
    fn leaves_the_face_absent_when_no_registered_faces_are_found() {
        let (backend, _record) = backend();
        let mut resource = create_font_resource();
        resource.family = "UnknownFont".to_string();
        block_on(load_font_resource_from_name(&backend, &mut resource)).unwrap();
        assert!(resource.face.is_none());
    }

    #[test]
    fn registers_and_constructs_nothing_for_a_name_lookup() {
        let (backend, record) = backend();
        record.existing.lock().unwrap().push(face("existing"));
        let mut resource = create_font_resource();
        resource.family = "TestFont".to_string();
        block_on(load_font_resource_from_name(&backend, &mut resource)).unwrap();
        assert!(record.added.lock().unwrap().is_empty());
        assert!(record.constructions.lock().unwrap().is_empty());
    }

    #[test]
    fn propagates_a_lookup_failure_without_replacing_the_face() {
        let (backend, record) = backend();
        let existing = face("existing");
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        resource.face = Some(existing.clone());
        *record.lookup_error.lock().unwrap() = Some(rejection("no such font"));
        let error = block_on(load_font_resource_from_name(&backend, &mut resource))
            .err()
            .unwrap();
        assert_eq!(rejection_message(&error), Some("no such font"));
        assert!(Arc::ptr_eq(resource.face.as_ref().unwrap(), &existing));
    }
}

mod load_font_resource_from_url {
    use super::*;

    #[test]
    fn builds_loads_registers_and_attaches_one_url_source() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_url(
            &backend,
            &mut resource,
            "https://example.com/font.woff2",
        ))
        .unwrap();
        let constructions = record.constructions.lock().unwrap();
        assert_eq!(constructions[0].0, "MyFont");
        let FontFaceSource::Url(source) = &constructions[0].1 else {
            panic!("expected URL source");
        };
        assert_eq!(source.value, "url(https://example.com/font.woff2)");
        assert!(Arc::ptr_eq(
            resource.face.as_ref().unwrap(),
            &record.added.lock().unwrap()[0]
        ));
    }

    #[test]
    fn adds_no_format_hint_to_the_single_url_form() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_url(
            &backend,
            &mut resource,
            "font.woff2",
        ))
        .unwrap();
        let constructions = record.constructions.lock().unwrap();
        let FontFaceSource::Url(source) = &constructions[0].1 else {
            panic!("expected URL source");
        };
        assert_eq!(source.value, "url(font.woff2)");
    }

    #[test]
    fn propagates_rejection_without_registering_or_attaching() {
        let (backend, record) = backend();
        *record.load_error.lock().unwrap() = Some(rejection("bad url"));
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        assert!(
            block_on(load_font_resource_from_url(
                &backend,
                &mut resource,
                "font.woff2",
            ))
            .is_err()
        );
        assert!(record.added.lock().unwrap().is_empty());
        assert!(resource.face.is_none());
    }
}

mod load_font_resource_from_urls {
    use super::*;

    fn recorded_url_source(record: &FontBackendRecord) -> String {
        let constructions = record.constructions.lock().unwrap();
        let FontFaceSource::Url(source) = &constructions[0].1 else {
            panic!("expected URL source");
        };
        return source.value.clone();
    }

    #[test]
    fn composes_and_attaches_a_comma_joined_source_with_format_hints() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_urls(
            &backend,
            &mut resource,
            &[
                FontUrl {
                    format: Some("woff2".to_string()),
                    url: "font.woff2".to_string(),
                },
                FontUrl {
                    format: None,
                    url: "font.ttf".to_string(),
                },
            ],
        ))
        .unwrap();
        assert_eq!(
            recorded_url_source(&record),
            "url(font.woff2) format('woff2'), url(font.ttf) format('truetype')"
        );
        assert!(resource.face.is_some());
    }

    #[test]
    fn infers_the_format_from_the_extension() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_urls(
            &backend,
            &mut resource,
            &[FontUrl {
                format: None,
                url: "font.otf".to_string(),
            }],
        ))
        .unwrap();
        assert_eq!(
            recorded_url_source(&record),
            "url(font.otf) format('opentype')"
        );
    }

    #[test]
    fn omits_the_format_hint_when_none_can_be_inferred() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_urls(
            &backend,
            &mut resource,
            &[FontUrl {
                format: None,
                url: "font.bin".to_string(),
            }],
        ))
        .unwrap();
        assert_eq!(recorded_url_source(&record), "url(font.bin)");
    }

    #[test]
    fn mixes_explicit_inferred_and_absent_hints() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_urls(
            &backend,
            &mut resource,
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
        assert_eq!(
            recorded_url_source(&record),
            "url(a.woff2) format('woff2'), url(b.ttf) format('truetype'), url(c.bin)"
        );
    }

    #[test]
    fn builds_an_empty_source_for_an_empty_list() {
        let (backend, record) = backend();
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        block_on(load_font_resource_from_urls(&backend, &mut resource, &[])).unwrap();
        assert_eq!(recorded_url_source(&record), "");
    }

    #[test]
    fn propagates_rejection_without_registering_or_attaching() {
        let (backend, record) = backend();
        *record.load_error.lock().unwrap() = Some(rejection("bad url"));
        let mut resource = create_font_resource();
        resource.family = "MyFont".to_string();
        assert!(
            block_on(load_font_resource_from_urls(
                &backend,
                &mut resource,
                &[FontUrl {
                    format: None,
                    url: "font.woff2".to_string(),
                }],
            ))
            .is_err()
        );
        assert!(record.added.lock().unwrap().is_empty());
        assert!(resource.face.is_none());
    }
}
