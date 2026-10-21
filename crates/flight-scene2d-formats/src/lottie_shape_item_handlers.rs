use std::sync::{Arc, LazyLock};

use crate::lottie_ellipse_shape_item::lottie_ellipse_shape_item_handler;
use crate::lottie_fill_shape_item::lottie_fill_shape_item_handler;
use crate::lottie_gradient_shape_items::{
    lottie_gradient_fill_shape_item_handler, lottie_gradient_stroke_shape_item_handler,
};
use crate::lottie_path_shape_item::lottie_path_shape_item_handler;
use crate::lottie_polystar_shape_item::lottie_polystar_shape_item_handler;
use crate::lottie_rectangle_shape_item::lottie_rectangle_shape_item_handler;
use crate::lottie_registry::register_lottie_shape_item_handler;
use crate::lottie_stroke_shape_item::lottie_stroke_shape_item_handler;
use crate::lottie_trim_path_shape_item::lottie_trim_path_shape_item_handler;
use crate::types::*;

pub static LOTTIE_ALL_SHAPE_ITEM_HANDLERS: LazyLock<Vec<LottieShapeItemHandler>> =
    LazyLock::new(|| {
        return vec![
            Arc::new(lottie_ellipse_shape_item_handler),
            Arc::new(lottie_fill_shape_item_handler),
            Arc::new(lottie_gradient_fill_shape_item_handler),
            Arc::new(lottie_gradient_stroke_shape_item_handler),
            Arc::new(lottie_path_shape_item_handler),
            Arc::new(lottie_polystar_shape_item_handler),
            Arc::new(lottie_rectangle_shape_item_handler),
            Arc::new(lottie_stroke_shape_item_handler),
            Arc::new(lottie_trim_path_shape_item_handler),
        ];
    });

pub fn register_lottie_shape_item_handlers(registry: &mut LottieRegistry) {
    for (kind, handler) in [
        (
            LOTTIE_SHAPE_ITEM_KIND_ELLIPSE,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[0].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_FILL,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[1].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_GRADIENT_FILL,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[2].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_GRADIENT_STROKE,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[3].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_PATH,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[4].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_POLYSTAR,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[5].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_RECTANGLE,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[6].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_STROKE,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[7].clone(),
        ),
        (
            LOTTIE_SHAPE_ITEM_KIND_TRIM_PATH,
            LOTTIE_ALL_SHAPE_ITEM_HANDLERS[8].clone(),
        ),
    ] {
        register_lottie_shape_item_handler(registry, kind, handler);
    }
}
