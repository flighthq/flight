use std::sync::Arc;

use flight_scene3d_formats::parse_md5_mesh;
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

mod load_scene3d_document_from_md5_mesh_url {
    use super::*;

    #[test]
    fn fetches_text_and_returns_the_parsed_cpu_document_without_resolving_resources() {
        let (host, requests) = net_host(Arc::new(|_| Some(text_body("MD5Version 10"))));

        let loaded = block_on(load_scene3d_document_from_md5_mesh_url(&host, "model.md5mesh", None, &net_state())).unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["model.md5mesh".to_string()]);
        // The loader hands the fetched text to the real parser unchanged and returns its document.
        assert_eq!(document_shape(&loaded), document_shape(&parse_md5_mesh("MD5Version 10", None, None)));
        assert!(loaded.resources.is_empty());
    }
}
