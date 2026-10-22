use std::sync::Arc;

use flight_scene3d_formats::parse_md2;
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

mod load_scene3d_document_from_md2_url {
    use super::*;

    #[test]
    fn fetches_bytes_and_returns_the_parsed_cpu_document_without_resolving_resources() {
        let (host, requests) = net_host(Arc::new(|_| Some(bytes_body(&[7]))));

        let loaded = block_on(load_scene3d_document_from_md2_url(&host, "model.md2", None, &net_state())).unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["model.md2".to_string()]);
        // The loader hands the fetched bytes to the real parser unchanged and returns its document.
        assert_eq!(document_shape(&loaded), document_shape(&parse_md2(&[7u8], None, None)));
        assert!(loaded.resources.is_empty());
    }
}
