use crate::lottie_layer_handlers::register_lottie_layer_handlers;
use crate::lottie_mask_handlers::register_lottie_mask_handlers;
use crate::lottie_shape_item_handlers::register_lottie_shape_item_handlers;
use crate::types::LottieRegistry;

pub fn register_all_lottie_handlers(registry: &mut LottieRegistry) {
    register_lottie_layer_handlers(registry);
    register_lottie_mask_handlers(registry);
    register_lottie_shape_item_handlers(registry);
}
