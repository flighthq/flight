use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_scene2d_formats::contract::*;
use serde_json::{Value, json};

mod append_lottie_shape_path_channels {
    use super::*;

    #[test]
    fn produces_a_channel_for_an_animated_path() {
        let document = create_lottie_test_document(Vec::new());
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
        let mut flattened = Vec::new();
        flatten_lottie_shape_path(&mut flattened, &lottie_test_square_path(0.0, 0.0, 10.0));
        let current = Arc::new(RwLock::new(flattened));
        let applies = Arc::new(AtomicUsize::new(0));
        let count = applies.clone();
        let apply: LottieRerender = Arc::new(move || {
            count.fetch_add(1, Ordering::Relaxed);
        });
        let keyframes = vec![
            json!({ "s": [square_value(10.0)], "t": 0 }),
            json!({ "s": [square_value(20.0)], "t": 30 }),
        ];

        append_lottie_shape_path_channels(&keyframes, &current, &apply, &mut import);

        assert_eq!(import.channels.len(), 1);
        assert_eq!(applies.load(Ordering::Relaxed), 0);
    }
}

fn square_value(size: f32) -> Value {
    return json!({
        "c": true,
        "i": [[0, 0], [0, 0], [0, 0], [0, 0]],
        "o": [[0, 0], [0, 0], [0, 0], [0, 0]],
        "v": [[0, 0], [size, 0], [size, size], [0, size]]
    });
}
