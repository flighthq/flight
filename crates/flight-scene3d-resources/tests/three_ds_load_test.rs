use std::sync::Arc;

use flight_scene3d_formats::parse3ds;
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

mod load_scene3d_document_from_3ds_url {
    use super::*;

    #[test]
    fn fetches_bytes_and_returns_the_parsed_cpu_document_without_resolving_resources() {
        let (host, requests) = net_host(Arc::new(|_| Some(bytes_body(&[9, 8]))));

        let loaded = block_on(load_scene3d_document_from_3ds_url(
            &host,
            "model.3ds",
            None,
            &net_state(),
        ))
        .unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["model.3ds".to_string()]);
        // The loader hands the fetched bytes to the real parser unchanged and returns its document.
        assert_eq!(
            document_shape(&loaded),
            document_shape(&parse3ds(&[9u8, 8], None, None))
        );
        assert!(loaded.resources.is_empty());
    }
}
