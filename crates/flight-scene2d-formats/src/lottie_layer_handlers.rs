use std::sync::{Arc, LazyLock};

use crate::lottie_image_layer::lottie_image_layer_handler;
use crate::lottie_null_layer::lottie_null_layer_handler;
use crate::lottie_precomposition_layer::lottie_precomposition_layer_handler;
use crate::lottie_registry::register_lottie_layer_handler;
use crate::lottie_shape_layer::lottie_shape_layer_handler;
use crate::lottie_solid_layer::lottie_solid_layer_handler;
use crate::lottie_text_layer::lottie_text_layer_handler;
use crate::types::*;

pub static LOTTIE_ALL_LAYER_HANDLERS: LazyLock<Vec<LottieLayerHandler>> = LazyLock::new(|| {
    return vec![
        Arc::new(lottie_image_layer_handler),
        Arc::new(lottie_null_layer_handler),
        Arc::new(lottie_precomposition_layer_handler),
        Arc::new(lottie_shape_layer_handler),
        Arc::new(lottie_solid_layer_handler),
        Arc::new(lottie_text_layer_handler),
    ];
});

pub fn register_lottie_layer_handlers(registry: &mut LottieRegistry) {
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_PRECOMPOSITION,
        LOTTIE_ALL_LAYER_HANDLERS[2].clone(),
    );
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_SOLID,
        LOTTIE_ALL_LAYER_HANDLERS[4].clone(),
    );
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_IMAGE,
        LOTTIE_ALL_LAYER_HANDLERS[0].clone(),
    );
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_NULL,
        LOTTIE_ALL_LAYER_HANDLERS[1].clone(),
    );
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_SHAPE,
        LOTTIE_ALL_LAYER_HANDLERS[3].clone(),
    );
    register_lottie_layer_handler(
        registry,
        LOTTIE_LAYER_KIND_TEXT,
        LOTTIE_ALL_LAYER_HANDLERS[5].clone(),
    );
}
