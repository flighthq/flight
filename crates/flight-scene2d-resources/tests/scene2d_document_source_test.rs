use std::sync::{Arc, RwLock};

use flight_scene2d_resources::contract::*;

use crate::guard_state;

mod load_scene2d_document_from_url {
    use super::*;

    #[test]
    fn acquires_bytes_then_stops_at_the_renderer_neutral_document() {
        let mut registry = create_scene2d_document_importer_registry();
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(|_, context| context.url.as_deref() == Some("scene.acme")),
            Arc::new(|_, _| Some(create_scene2d_document())),
        );
        let fetch: Scene2DDocumentFetcher = Arc::new(|_, _, _| {
            Box::pin(async { Some(Arc::new(RwLock::new(vec![1].into_boxed_slice()))) })
        });
        let document = futures::executor::block_on(load_scene2d_document_from_url(
            "scene.acme".to_string(),
            &registry,
            &fetch,
            None,
            &guard_state(),
        ))
        .unwrap();
        assert_eq!(
            document.read().unwrap().source_kind.as_deref(),
            Some("acme")
        );
    }

    #[test]
    fn releases_fetched_bytes_before_matcher_and_importer_callbacks() {
        let source = Arc::new(RwLock::new(vec![1].into_boxed_slice()));
        let matcher_source = source.clone();
        let importer_source = source.clone();
        let mut registry = create_scene2d_document_importer_registry();
        register_scene2d_document_importer(
            &mut registry,
            "acme".to_string(),
            Arc::new(move |bytes, _| {
                let mut source = matcher_source
                    .try_write()
                    .expect("matcher must not run under the fetched-byte read guard");
                source[0] = bytes[0];
                return true;
            }),
            Arc::new(move |bytes, _| {
                let mut source = importer_source
                    .try_write()
                    .expect("importer must not run under the fetched-byte read guard");
                source[0] = bytes[0];
                return Some(create_scene2d_document());
            }),
        );
        let fetched = source.clone();
        let fetch: Scene2DDocumentFetcher = Arc::new(move |_, _, _| {
            let fetched = fetched.clone();
            Box::pin(async move { Some(fetched) })
        });
        let document = futures::executor::block_on(load_scene2d_document_from_url(
            "scene.acme".to_string(),
            &registry,
            &fetch,
            None,
            &guard_state(),
        ));
        assert!(document.is_some());
        assert_eq!(source.read().unwrap()[0], 1);
    }

    #[test]
    fn returns_none_when_acquisition_reports_an_expected_failure() {
        let fetch: Scene2DDocumentFetcher = Arc::new(|_, _, _| Box::pin(async { None }));
        assert!(
            futures::executor::block_on(load_scene2d_document_from_url(
                "missing.acme".to_string(),
                &create_scene2d_document_importer_registry(),
                &fetch,
                None,
                &guard_state(),
            ))
            .is_none()
        );
    }
}
