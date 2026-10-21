use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use flight_scene2d::contract::create_display_object;
use flight_scene2d_formats::contract::*;
use serde_json::Map;

mod lottie_null_layer_handler {
    use super::*;

    #[test]
    fn is_the_builtin_null_layer_handler() {
        let mut registry = create_lottie_registry();
        register_lottie_layer_handlers(&mut registry);
        assert!(Arc::ptr_eq(
            &get_lottie_layer_handler(&registry, LOTTIE_LAYER_KIND_NULL).unwrap(),
            &LOTTIE_ALL_LAYER_HANDLERS[1]
        ));
    }

    #[test]
    fn produces_an_empty_container() {
        let document = LottieRecord::from(Map::new());
        let layer = LottieRecord::from(Map::new());
        let registry = create_lottie_registry();
        let mut import = LottieImportContext {
            advanced_blends: Vec::new(),
            assets: HashMap::new(),
            channels: Vec::new(),
            diagnostics: None,
            document: &document,
            frame_offset: 0.0,
            frame_scale: 1.0,
            registry: &registry,
            resolve_image_resource: None,
            resolving_precompositions: HashSet::new(),
        };
        let container: flight_scene2d::Node2DRef = create_display_object(None);
        let mut context = LottieLayerContext {
            container: container.clone(),
            import: &mut import,
            layer: &layer,
        };

        lottie_null_layer_handler(&mut context);

        let node: flight_node::contract::NodeRef = container;
        assert_eq!(flight_node::contract::get_node_child_count(&node), 0);
    }
}
