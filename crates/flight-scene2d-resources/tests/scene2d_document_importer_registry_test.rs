use std::sync::Arc;

use flight_scene2d_resources::contract::*;

use crate::guard_state;

mod create_scene2d_document_from_bytes {
    use super::*;

    #[test]
    fn dispatches_to_the_first_matching_registered_importer() {
        let mut registry = create_scene2d_document_importer_registry();
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(|source, _| source.first() == Some(&42)),
            Arc::new(|_, _| Some(create_scene2d_document())),
        );
        let document =
            create_scene2d_document_from_bytes(&[42], &registry, None, &guard_state()).unwrap();
        assert_eq!(
            document.read().unwrap().source_kind.as_deref(),
            Some("acme")
        );
    }

    #[test]
    fn returns_none_when_no_importer_matches() {
        assert!(
            create_scene2d_document_from_bytes(
                &[0],
                &create_scene2d_document_importer_registry(),
                None,
                &guard_state(),
            )
            .is_none()
        );
    }
}

mod create_scene2d_document_importer_registry {
    use super::*;

    #[test]
    fn creates_isolated_registries_with_no_implicit_codecs() {
        let mut first = create_scene2d_document_importer_registry();
        let second = create_scene2d_document_importer_registry();
        assert!(first.entries.is_empty());
        assert!(second.entries.is_empty());
        register_scene2d_document_importer(
            &mut first,
            "acme".to_string(),
            Arc::new(|_, _| true),
            Arc::new(|_, _| None),
        );
        assert_eq!(first.entries.len(), 1);
        assert!(second.entries.is_empty());
    }
}

mod register_scene2d_document_importer {
    use super::*;

    #[test]
    fn replaces_a_kind_in_place_with_last_write_wins_behavior() {
        let mut registry = create_scene2d_document_importer_registry();
        let first: Scene2DDocumentImporter = Arc::new(|_, _| None);
        let second: Scene2DDocumentImporter = Arc::new(|_, _| Some(create_scene2d_document()));
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(|_, _| true),
            first,
        );
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(|_, _| true),
            second.clone(),
        );
        assert_eq!(registry.entries.len(), 1);
        assert!(Arc::ptr_eq(&registry.entries[0].import_document, &second));
    }
}

mod unregister_scene2d_document_importer {
    use super::*;

    #[test]
    fn removes_an_existing_kind_and_reports_absence() {
        let mut registry = create_scene2d_document_importer_registry();
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(|_, _| true),
            Arc::new(|_, _| None),
        );
        assert!(unregister_scene2d_document_importer(&mut registry, "acme"));
        assert!(!unregister_scene2d_document_importer(&mut registry, "acme"));
    }
}
