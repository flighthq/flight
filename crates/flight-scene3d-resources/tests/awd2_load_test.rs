use std::sync::{Arc, RwLock};

use flight_scene3d_formats::{AWD2_ALL_BLOCK_HANDLERS, Awd2ParseOptions, parse_awd2};
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

mod load_scene3d_document_from_awd2_url {
    use super::*;

    #[test]
    fn fetches_bytes_and_returns_the_parsed_cpu_document_without_resolving_resources() {
        let (host, requests) = net_host(Arc::new(|_| Some(bytes_body(&[5, 6]))));
        let parse = Awd2ParseOptions {
            blocks: AWD2_ALL_BLOCK_HANDLERS.clone(),
            deflate: None,
            lzma: None,
        };

        let loaded =
            block_on(load_scene3d_document_from_awd2_url(&host, "model.awd", &parse, None, &net_state()))
                .unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["model.awd".to_string()]);
        // The loader hands the fetched bytes to the real parser unchanged and returns its document.
        let direct = parse_awd2(&Arc::new(RwLock::new(vec![5u8, 6].into_boxed_slice())), &parse, None);
        assert_eq!(document_shape(&loaded.read().unwrap()), document_shape(&direct.read().unwrap()));
        assert!(loaded.read().unwrap().resources.is_empty());
    }
}
