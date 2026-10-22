use std::sync::Arc;

use flight_image::ImageResourceReference;
use flight_scene3d_formats::{parse_obj, parse_obj_material_library};
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

mod load_scene3d_document_from_obj_url {
    use super::*;

    #[test]
    fn fetches_text_and_returns_the_parsed_cpu_document_without_resolving_resources() {
        let (host, requests) = net_host(Arc::new(|_| Some(text_body("v 0 0 0"))));

        let loaded = block_on(load_scene3d_document_from_obj_url(
            &host,
            "model.obj",
            None,
            None,
            &net_state(),
        ))
        .unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["model.obj".to_string()]);
        // The loader hands the fetched text and no material library to the real parser.
        assert_eq!(
            document_shape(&loaded),
            document_shape(&parse_obj("v 0 0 0", None, None, None))
        );
    }

    #[test]
    fn carries_the_model_directory_onto_the_relative_texture_references_its_parser_emits() {
        let source = "mtllib ship.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl hull\nf 1 2 3\n";
        let (host, _) = net_host(Arc::new(move |_| Some(text_body(source))));
        let materials = parse_obj_material_library("newmtl hull\nmap_Kd hull.png\n", None);

        let loaded = block_on(load_scene3d_document_from_obj_url(
            &host,
            "models/ship.obj",
            Some(&materials),
            None,
            &net_state(),
        ))
        .unwrap();

        let base_paths: Vec<Option<String>> = loaded
            .resources
            .iter()
            .filter_map(|resource| match resource {
                ImageResourceReference::External(value) => {
                    Some(value.reference.read().unwrap().base_path.clone())
                }
                ImageResourceReference::Embedded(_) => None,
            })
            .collect();
        assert!(!base_paths.is_empty());
        assert!(
            base_paths
                .iter()
                .all(|base_path| base_path.as_deref() == Some("models"))
        );
    }
}
